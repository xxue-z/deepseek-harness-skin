/**
 * HTTP surface of the skin plugin.
 *
 * The persistent client half has no RPC channel to its Host half, so the Host
 * publishes a small JSON API on the same origin the page is served from, plus
 * the wallpaper bytes. Both are loopback-only and read/write nothing outside
 * the skin library.
 */
import { existsSync, statSync, createReadStream, openSync, closeSync } from 'node:fs'
import { videoType } from './playlist.js'
import { isSkinId } from './store.js'

const MAX_BODY_BYTES = 32 * 1024 * 1024

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

function isLoopback(request) {
  const address = request.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJsonBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体超过 32 MB')
    chunks.push(chunk)
  }
  if (total === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Collect a request body as raw bytes (the update bundle). */
async function readRawBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体超过 32 MB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/* -------------------------------------------------------------------------- */
/* release download proxy                                                      */
/* -------------------------------------------------------------------------- */

/** A release bundle is a few hundred KB; this is a ceiling, not a target. */
const MAX_RELEASE_BYTES = 64 * 1024 * 1024
const RELEASE_TIMEOUT_MS = 120_000
/** The only hosts a release asset may come from. */
const RELEASE_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])

/**
 * Check a URL the page asks the Host to download.
 *
 * The page hands over a URL, so this is the one place that decides what the
 * Host will fetch: https only, GitHub only. Anything else is refused before a
 * socket is opened.
 *
 * @param {string} input
 * @returns {URL}
 */
export function assertReleaseUrl(input) {
  let parsed
  try {
    parsed = new URL(String(input ?? ''))
  } catch {
    throw new Error('更新地址不合法')
  }
  if (parsed.protocol !== 'https:') throw new Error('更新地址必须是 https')
  if (!RELEASE_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error(`不支持的更新下载源：${parsed.hostname}`)
  return parsed
}

/**
 * Download a release bundle on the page's behalf.
 *
 * The browser cannot do this itself: `github.com/.../releases/download/...`
 * answers 302 to `release-assets.githubusercontent.com`, and neither hop sends
 * an `Access-Control-Allow-Origin` header, so a cross-origin `fetch` from the
 * page is rejected as "Failed to fetch" no matter how the redirect is handled.
 * The Host is not subject to CORS, so the bytes are pulled here and handed to
 * the page from its own origin.
 *
 * @param {string} input
 * @param {{ fetchImpl?: typeof fetch, maxBytes?: number, timeoutMs?: number }} [options]
 * @returns {Promise<{ bytes: Buffer, url: string, contentType: string }>}
 */
export async function fetchReleaseAsset(input, options = {}) {
  const url = assertReleaseUrl(input)
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : MAX_RELEASE_BYTES
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : RELEASE_TIMEOUT_MS
  // The download can be slow; only the connection and the body read are
  // bounded, so a slow-but-progressing transfer is not cut off mid-way.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url.href, { redirect: 'follow', signal: controller.signal })
    if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}`)
    const declared = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`更新包过大（${declared} 字节）`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength === 0) throw new Error('更新包为空')
    if (bytes.byteLength > maxBytes) throw new Error(`更新包过大（${bytes.byteLength} 字节）`)
    return {
      bytes,
      url: url.href,
      contentType: response.headers?.get?.('content-type') ?? 'application/octet-stream',
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('下载更新包超时')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function sendBytes(response, status, bytes, contentType) {
  response.writeHead(status, {
    'content-type': contentType || 'application/octet-stream',
    'cache-control': 'no-store',
    'content-length': bytes.byteLength,
  })
  response.end(bytes)
}

/**
 * Build the request handler for the `/skin` prefix.
 * @param {import('./service.js').SkinService} service
 * @param {{ store: import('./store.js').SkinStore, log?: (message: string) => void, meta?: { version: string, repository: string } }} deps
 */
export function createSkinHandler(service, deps) {
  const { store, log } = deps
  const meta = deps.meta ?? { version: '0.0.0', repository: 'xxue-z/deepseek-harness-skin' }

  return async function handle(request, response) {
    if (!isLoopback(request)) {
      sendJson(response, 403, { ok: false, error: '仅允许本机访问' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname

    try {
      if (path.startsWith('/skin/assets/')) {
        serveAsset(request, response, url)
        return
      }
      // Version and update check are the only routes outside /skin/api: the
      // settings page reads them before anything else is loaded, and they are
      // static or anonymous.
      if (path === '/skin/version') {
        sendJson(response, 200, {
          ok: true,
          version: meta.version,
          repository: meta.repository,
          url: `https://github.com/${meta.repository}`,
        })
        return
      }
      if (path === '/skin/update-check') {
        if (request.method !== 'GET' && request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: '只支持 GET' })
          return
        }
        const result = typeof service.updateCheck === 'function' ? await service.updateCheck() : null
        if (result === null) throw new Error('更新检查不可用')
        sendJson(response, 200, { ok: true, ...result })
        return
      }
      if (path === '/skin/update/download' && request.method === 'POST') {
        // The page cannot fetch the release itself (no CORS header on either
        // GitHub hop), so it asks the Host for the bytes and receives them
        // from its own origin.
        const body = await readJsonBody(request)
        const asset = await fetchReleaseAsset(typeof body.url === 'string' ? body.url : String(body.url ?? ''))
        sendBytes(response, 200, asset.bytes, 'application/octet-stream')
        return
      }
      if (path === '/skin/update/install' && request.method === 'POST') {
        // Whole-tree update: the bundle is a few hundred KB of source, so one
        // Buffer is simpler than a tar reader on the Host.
        const body = await readRawBody(request)
        const staged = service.stageUpdate(body)
        const installed = await service.installStagedUpdate(staged)
        // A swapped tree is not a running one: the Host loaded its modules and
        // its version at process start, so the page must ask for a restart
        // instead of reloading into an app that is half on the new build.
        sendJson(response, 200, {
          ok: true,
          installed,
          version: installed?.version ?? null,
          reload: false,
          restartMessage: installed?.restartMessage ?? null,
        })
        return
      }
      if (!path.startsWith('/skin/api/')) {
        sendJson(response, 404, { ok: false, error: '未知接口' })
        return
      }
      const action = path.slice('/skin/api/'.length)
      if (request.method === 'GET' && action === 'snapshot') {
        sendJson(response, 200, { ok: true, snapshot: service.snapshot() })
        return
      }
      if (request.method === 'GET' && action === 'videos') {
        // The folder listing behind the playlist: order plus one URL per file.
        // Listing is not reading, and the folder is one the user configured.
        const folder = url.searchParams.get('folder')
        sendJson(response, 200, { ok: true, ...service.listPlaylistVideos(folder === null ? undefined : folder) })
        return
      }
      if (request.method === 'GET' && action === 'models') {
        // The model dropdown reads the Host's live registry, so it lists the
        // same routes the chat composer offers instead of a copy.
        sendJson(response, 200, { ok: true, models: await service.listModels() })
        return
      }
      if (request.method !== 'POST') {
        sendJson(response, 405, { ok: false, error: '只支持 POST' })
        return
      }
      const body = await readJsonBody(request)
      switch (action) {
        case 'ping': {
          service.noteClient(body && typeof body === 'object' ? body : null)
          sendJson(response, 200, { ok: true, client: service.clientDiagnostics() })
          return
        }
        case 'reveal-sources': {
          // Opens the configured Codex theme folder in the OS file manager so
          // the user can drop packs in without copying a path.
          const opened = await service.revealSources()
          sendJson(response, 200, { ok: true, opened })
          return
        }
        case 'scan': {
          sendJson(response, 200, { ok: true, results: service.scanCodexDirs(), snapshot: service.snapshot() })
          return
        }
        case 'pick-source': {
          const picked = await service.pickSource()
          sendJson(response, 200, { ok: true, ...picked })
          return
        }
        case 'import-path': {
          const result = service.importPath(body.path, { replaceSameSource: body.replaceSameSource === true })
          sendJson(response, 200, { ok: true, result, snapshot: service.snapshot() })
          return
        }
        case 'rename': {
          sendJson(response, 200, { ok: true, snapshot: service.rename(String(body.id ?? ''), String(body.name ?? '')) })
          return
        }
        case 'release-video': {
          // Called after the browser detaches a <video>. On Windows the media
          // buffer can outlive the element and keep video.mp4 locked, so the
          // client asks explicitly and retries when the answer is `inUse`.
          sendJson(response, 200, { ok: true, ...releaseVideo(store, String(body.id ?? '')) })
          return
        }
        case 'import-zip': {
          const data = typeof body.data === 'string' ? body.data : ''
          const bytes = Buffer.from(data, 'base64')
          if (bytes.byteLength === 0) throw new Error('ZIP 内容为空')
          const result = service.importZip(bytes, typeof body.name === 'string' ? body.name : 'theme.zip')
          sendJson(response, 200, { ok: true, result, snapshot: service.snapshot() })
          return
        }
        case 'apply': {
          sendJson(response, 200, { ok: true, snapshot: service.apply(String(body.id ?? '')) })
          return
        }
        case 'deactivate': {
          sendJson(response, 200, { ok: true, snapshot: service.deactivate() })
          return
        }
        case 'transparency': {
          const value = body.value === null || body.value === undefined ? null : Number(body.value)
          const result = service.setTransparency(String(body.id ?? ''), value)
          sendJson(response, 200, { ok: true, snapshot: result.snapshot })
          return
        }
        case 'video-settings': {
          const result = service.setVideoSettings({
            autoplay: typeof body.autoplay === 'boolean' ? body.autoplay : undefined,
            muted: typeof body.muted === 'boolean' ? body.muted : undefined,
          })
          sendJson(response, 200, { ok: true, settings: result.settings, snapshot: result.snapshot })
          return
        }
        case 'playlist-settings': {
          // Folder, speed and picture-in-picture. The on/off switch is a
          // separate, deliberately unsaved endpoint (`playlist-enabled`).
          const result = service.setPlaylistSettings({
            folder: typeof body.folder === 'string' ? body.folder : undefined,
            speed: body.speed === undefined ? undefined : Number(body.speed),
            pictureInPicture: typeof body.pictureInPicture === 'boolean' ? body.pictureInPicture : undefined,
          })
          sendJson(response, 200, { ok: true, playlist: result.settings, snapshot: result.snapshot })
          return
        }
        case 'playlist-enabled': {
          sendJson(response, 200, { ok: true, ...service.setPlaylistEnabled(body.enabled === true) })
          return
        }
        case 'playlist-track': {
          sendJson(response, 200, { ok: true, ...service.trackPlaylist(body) })
          return
        }
        case 'playlist-history': {
          // Double-clicking a remembered folder, or pasting one, both land here:
          // it becomes the active folder and moves to the top of the history.
          const result = service.rememberPlaylistFolder(String(body.path ?? ''))
          sendJson(response, 200, { ok: true, playlist: result.settings, snapshot: result.snapshot })
          return
        }
        case 'pick-folder': {
          const initial = typeof body.initial === 'string' && body.initial !== '' ? body.initial : undefined
          const path = await service.pickDirectory(initial, typeof body.description === 'string' ? body.description : undefined)
          if (path === null) {
            sendJson(response, 200, { ok: true, path: null })
            return
          }
          const result = service.rememberPlaylistFolder(path)
          sendJson(response, 200, { ok: true, path, playlist: result.settings, snapshot: result.snapshot })
          return
        }
        case 'open-folder': {
          sendJson(response, 200, { ok: true, opened: await service.openFolder(String(body.path ?? '')) })
          return
        }
        case 'refresh-video': {
          const result = service.refreshVideo(String(body.id ?? ''))
          sendJson(response, 200, { ok: true, status: result.status, snapshot: result.snapshot })
          return
        }
        case 'delete': {
          sendJson(response, 200, { ok: true, snapshot: service.remove(String(body.id ?? '')) })
          return
        }
        case 'recolor': {
          sendJson(response, 200, { ok: true, snapshot: service.recolor(String(body.id ?? ''), body.palette) })
          return
        }
        case 'design': {
          const result = await service.design({
            description: typeof body.description === 'string' ? body.description : '',
            palette: Array.isArray(body.palette) ? body.palette.filter((value) => typeof value === 'string') : [],
            imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : null,
            videoDataUrl: typeof body.videoDataUrl === 'string' ? body.videoDataUrl : null,
            details: body.details && typeof body.details === 'object' ? body.details : null,
            baseId: typeof body.baseId === 'string' && body.baseId !== '' ? body.baseId : null,
            modelProvider: typeof body.modelProvider === 'string' ? body.modelProvider : undefined,
            modelModel: typeof body.modelModel === 'string' ? body.modelModel : undefined,
          })
          sendJson(response, 200, { ok: true, ...result, snapshot: service.snapshot() })
          return
        }
        case 'export': {
          sendJson(response, 200, { ok: true, theme: service.exportTheme(String(body.id ?? '')) })
          return
        }
        default:
          sendJson(response, 404, { ok: false, error: `未知接口：${action}` })
      }
    } catch (error) {
      log?.(`${path}: ${errorMessage(error)}`)
      sendJson(response, 400, { ok: false, error: errorMessage(error) })
    }
  }

  function serveAsset(request, response, url) {
    const path = url.pathname
    // Folder playlists are not part of the skin library, so they get their own
    // route; the bytes still leave through the same ranged media path.
    if (path === '/skin/assets/playlist/video') {
      servePlaylistVideo(request, response, url)
      return
    }
    const match = /^\/skin\/assets\/([^/]+)\/(wallpaper|video)$/.exec(path)
    if (!match) {
      sendJson(response, 404, { ok: false, error: '资源不存在' })
      return
    }
    const id = decodeURIComponent(match[1])
    const kind = match[2]
    if (!isSkinId(id)) {
      sendJson(response, 400, { ok: false, error: '非法皮肤 id' })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { ok: false, error: '只支持 GET' })
      return
    }
    const file = kind === 'video' ? store.videoPath(id) : store.wallpaperPath(id)
    if (file === null || !existsSync(file)) {
      sendJson(response, 404, { ok: false, error: kind === 'video' ? '这个皮肤没有动态背景' : '这个皮肤没有壁纸' })
      return
    }
    serveFile(request, response, file, {
      type: kind === 'video' ? store.videoType(id) : store.wallpaperType(id),
      ranges: kind === 'video',
      cache: 'public, max-age=31536000, immutable',
    })
  }

  /**
   * One video from the configured playlist folder.
   *
   * `folder` and `name` come straight from the URL, so both are re-validated:
   * `service.resolvePlaylistPath` rejects separators, `..`, and anything whose
   * real path lands outside the folder. Nothing is listed here — the client
   * learns the URLs from `/skin/api/videos` — so a guessed name still has to
   * sit in the folder the user picked.
   */
  function servePlaylistVideo(request, response, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { ok: false, error: '只支持 GET' })
      return
    }
    const folder = url.searchParams.get('folder') ?? ''
    const name = url.searchParams.get('name') ?? ''
    const file = service.resolvePlaylistPath(folder, name)
    if (file === null) {
      sendJson(response, 404, { ok: false, error: '这个视频不存在或不在所选文件夹里' })
      return
    }
    serveFile(request, response, file, {
      type: videoType(name),
      ranges: true,
      // The URL carries size and mtime; a replaced file gets a new one.
      cache: 'private, max-age=0, must-revalidate',
    })
  }
}

/**
 * Send one file with optional byte-range support.
 *
 * Chromium asks for a byte range on every media element load; answering 206
 * (and advertising it on the plain response) is what makes a video start
 * reliably and seek on loop.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {string} file
 * @param {{ type: string, ranges?: boolean, cache?: string }} options
 */
function serveFile(request, response, file, options) {
  const stats = statSync(file)
  const headers = {
    'content-type': options.type,
    'cache-control': options.cache ?? 'no-store',
  }
  if (options.ranges === true) {
    const range = parseRangeHeader(request.headers.range, stats.size)
    if (range?.invalid) {
      response.writeHead(416, { ...headers, 'content-range': `bytes */${stats.size}`, 'content-length': 0 })
      response.end()
      return
    }
    if (range) {
      const length = range.end - range.start + 1
      response.writeHead(206, {
        ...headers,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${range.start}-${range.end}/${stats.size}`,
        'content-length': length,
      })
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      streamFile(request, response, file, { start: range.start, end: range.end })
      return
    }
    headers['accept-ranges'] = 'bytes'
  }
  headers['content-length'] = stats.size
  response.writeHead(200, headers)
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  streamFile(request, response, file)
}

/**
 * Stream one file to the response and release it as soon as the browser is done.
 *
 * A `<video>` seeks and buffers, so Chromium leaves several range responses open
 * for a while; a paused or replaced element may sit on them until its buffer is
 * dropped. That handle is what keeps video.mp4 locked on Windows after switching
 * to a static theme. Media responses therefore ask for a teardown when the
 * connection closes, so the file descriptor goes away even if the element never
 * says so.
 *
 * @param {import('node:http').ServerResponse} response
 * @param {{ start?: number, end?: number }} [options]
 */
function streamFile(request, response, file, options) {
  const stream = options ? createReadStream(file, options) : createReadStream(file)
  let closed = false
  const finish = () => {
    if (closed) return
    closed = true
    // Destroying closes the descriptor; `destroy()` on an ended stream is safe.
    stream.destroy()
  }
  // The client hanging up (navigation, element removed, seek abandoned) must not
  // leave the fd open for the OS to reap at process exit.
  response.on('close', finish)
  stream.on('error', () => {
    finish()
    response.destroy()
  })
  stream.pipe(response)
  stream.on('end', finish)
}

/**
 * Drop any OS-level handle on a theme's video and report whether it went away.
 *
 * Windows keeps video.mp4 locked while Chromium still holds the media buffer,
 * even after the `<video>` is detached, which is why switching to a static theme
 * left the file occupied until the app exited. Opening the file for writing is
 * the cheapest proof: it fails with a sharing violation while any other handle
 * holds it.
 *
 * @param {import('./store.js').SkinStore} store
 * @param {string} id
 * @returns {{ lock: 'released' | 'inUse' | 'absent' }}
 */
function releaseVideo(store, id) {
  const file = store.videoPath(id)
  if (file === null || !existsSync(file)) return { lock: 'absent' }
  return { lock: canWrite(file) ? 'released' : 'inUse' }
}

function canWrite(file) {
  try {
    const fd = openSync(file, 'r+')
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

/**
 * Read one `Range: bytes=…` header.
 *
 * Only a single range is supported: the element either plays from the start or
 * seeks inside the clip, and a multipart response buys nothing here.
 *
 * @returns {{ start: number, end: number } | { invalid: true } | null} null when the request has no range.
 */
function parseRangeHeader(value, total) {
  if (typeof value !== 'string' || !value.startsWith('bytes=')) return null
  const spec = value.slice('bytes='.length).split(',')[0].trim()
  const match = /^(\d*)-(\d*)$/.exec(spec)
  if (!match) return { invalid: true }
  const rawStart = match[1] === '' ? null : Number(match[1])
  const rawEnd = match[2] === '' ? null : Number(match[2])
  if (rawStart === null && rawEnd === null) return { invalid: true }
  if (!Number.isSafeInteger(rawStart ?? 0) || !Number.isSafeInteger(rawEnd ?? 0)) return { invalid: true }
  let start = rawStart
  let end = rawEnd
  if (start === null) {
    // Suffix range: the last N bytes.
    start = Math.max(0, total - end)
    end = total - 1
  } else if (end === null || end >= total) {
    end = total - 1
  }
  if (start >= total || start > end) return { invalid: true }
  return { start, end }
}