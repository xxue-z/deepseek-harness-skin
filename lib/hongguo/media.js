/**
 * Local proxy and clip store for 红果 media.
 *
 * Two rules keep this safe and useful at the same time:
 *
 * - **Loopback only.** The app serves its decrypted stream from
 *   `127.0.0.1:<random port>`. We forward only loopback URLs, so this endpoint
 *   can never be used to fetch arbitrary hosts through the app.
 * - **Same origin for the browser.** The skin page runs on the DSH web origin,
 *   while the app listens on another port; forwarding through `/skin/hongguo/*`
 *   means the `<video>` element and the cover `<img>` tags never need CORS.
 */
import { createWriteStream, mkdirSync, rmSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'

/** Media URLs the app hands out are always loopback HTTP. */
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\//i

/** Cover URLs may also point at the CDN (HEIC), which we pass through too. */
const ALLOWED_IMAGE = /^https?:\/\//i

const CLIP_PATTERN = /\.(mp4|m4v|webm)$/i

/**
 * The app answers an un-ranged GET with a single 4 MiB window, so anything
 * longer is pulled in these byte windows instead.
 */
const CHUNK_BYTES = 1048576

export function isLoopbackUrl(value) {
  return typeof value === 'string' && LOOPBACK.test(value)
}

/**
 * Forward one request, preserving range semantics.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {string} target
 * @param {'media'|'image'} kind
 */
export async function forward(request, response, target, kind = 'media') {
  const allowed = kind === 'image' ? ALLOWED_IMAGE.test(target) : isLoopbackUrl(target)
  if (!allowed) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(kind === 'image' ? '只允许图片地址' : '只允许本机媒体地址')
    return
  }
  const headers = {}
  if (typeof request.headers.range === 'string') headers.range = request.headers.range
  if (typeof request.headers['if-range'] === 'string') headers['if-range'] = request.headers['if-range']

  let upstream
  try {
    upstream = await fetch(target, { headers, redirect: 'follow' })
  } catch (error) {
    response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`无法连接媒体源：${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const out = {
    'content-type': upstream.headers.get('content-type') ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
    'accept-ranges': upstream.headers.get('accept-ranges') ?? 'bytes',
    'cache-control': kind === 'image' ? 'public, max-age=3600' : 'no-store',
  }
  for (const name of ['content-length', 'content-range']) {
    const value = upstream.headers.get(name)
    if (value !== null) out[name] = value
  }
  response.writeHead(upstream.status === 206 ? 206 : upstream.status === 200 ? 200 : upstream.status, out)
  if (!upstream.body) {
    response.end()
    return
  }
  Readable.fromWeb(upstream.body).pipe(response)
}

/** Filesystem-friendly clip name: keep CJK, drop separators. */
export function clipName(title, episode) {
  const clean = String(title ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  const suffix = Number.isFinite(Number(episode)) ? `第${Number(episode)}集` : '第1集'
  return `${clean || 'hongguo'} ${suffix}.mp4`
}

/**
 * Download one clip into the playlist folder so the theme can play it.
 *
 * The theme only ever sees plain files, so this is the path that makes 红果
 * content playable as a background: no CORS, no range tricks, no codec probe.
 *
 * The app's proxy caps an un-ranged response at 4 MiB, so anything longer has to
 * be pulled in `Range` windows. It advertises `Accept-Ranges: bytes` and answers
 * `bytes=0-0` with the real total, which is what `probeTotal` reads.
 *
 * @param {{url: string, directory: string, title: string, episode: number, onProgress?: (received: number, total: number) => void}} job
 */
export async function downloadClip(job) {
  if (!isLoopbackUrl(job.url)) throw new Error('播放地址不是本机代理，无法下载')
  mkdirSync(job.directory, { recursive: true })
  const file = join(job.directory, clipName(job.title, job.episode))
  const partial = `${file}.part`
  const total = await probeTotal(job.url)
  const sink = createWriteStream(partial)
  let received = 0
  const write = async (chunk) => {
    received += chunk.length
    if (!sink.write(chunk)) await new Promise((resolve) => sink.once('drain', resolve))
    job.onProgress?.(received, total)
  }
  try {
    if (total > 0) {
      for (let offset = 0; offset < total; ) {
        const end = Math.min(offset + CHUNK_BYTES - 1, total - 1)
        const response = await fetch(job.url, { headers: { range: `bytes=${offset}-${end}` } })
        if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
        const chunk = Buffer.from(await response.arrayBuffer())
        if (chunk.length === 0) throw new Error('下载中断：服务端返回空数据')
        await write(chunk)
        offset += chunk.length
      }
    } else {
      const upstream = await fetch(job.url)
      if (!upstream.ok || !upstream.body) throw new Error(`下载失败：HTTP ${upstream.status}`)
      for await (const chunk of Readable.fromWeb(upstream.body)) await write(Buffer.from(chunk))
    }
    await new Promise((resolve, reject) => {
      sink.end(resolve)
      sink.on('error', reject)
    })
    const { renameSync } = await import('node:fs')
    renameSync(partial, file)
  } catch (error) {
    try {
      sink.destroy()
      rmSync(partial, { force: true })
    } catch {
      /* nothing to clean */
    }
    throw error
  }
  return { file, bytes: received, total }
}

/** Total bytes of a proxied stream, or 0 when the server will not say. */
export async function probeTotal(url) {
  try {
    const response = await fetch(url, { headers: { range: 'bytes=0-0' } })
    const contentRange = response.headers.get('content-range')
    await response.arrayBuffer()
    const match = contentRange ? /\/(\d+)$/.exec(contentRange) : null
    if (match) return Number(match[1])
    const length = Number(response.headers.get('content-length') ?? 0)
    return response.status === 206 ? length : 0
  } catch {
    return 0
  }
}

/** Clip folder listing used by the tool's `clips` action. */
export function listClips(directory) {
  try {
    return readdirSync(directory)
      .filter((name) => CLIP_PATTERN.test(name))
      .map((name) => {
        const info = statSync(join(directory, name))
        return { name, bytes: info.size, mtimeMs: info.mtimeMs }
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  } catch {
    return []
  }
}

/** Remove every clip we downloaded (the folder is ours alone). */
export function clearClips(directory) {
  let removed = 0
  try {
    for (const entry of readdirSync(directory)) {
      if (!CLIP_PATTERN.test(entry)) continue
      rmSync(join(directory, entry), { force: true })
      removed += 1
    }
  } catch {
    /* empty folder */
  }
  return removed
}