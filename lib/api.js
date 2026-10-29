/**
 * HTTP surface of the skin plugin.
 *
 * The persistent client half has no RPC channel to its Host half, so the Host
 * publishes a small JSON API on the same origin the page is served from, plus
 * the wallpaper bytes. Both are loopback-only and read/write nothing outside
 * the skin library.
 */
import { existsSync, statSync, createReadStream, openSync, closeSync } from 'node:fs'
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
        serveAsset(request, response, path)
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
      if (path === '/skin/update/install' && request.method === 'POST') {
        // Whole-tree update: the bundle is a few hundred KB of source, so one
        // Buffer is simpler than a tar reader on the Host.
        const body = await readRawBody(request)
        const staged = service.stageUpdate(body)
        const installed = await service.installStagedUpdate(staged)
        sendJson(response, 200, { ok: true, installed })
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

  function serveAsset(request, response, path) {
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
    const stats = statSync(file)
    const headers = {
      'content-type': kind === 'video' ? store.videoType(id) : store.wallpaperType(id),
      'cache-control': 'public, max-age=31536000, immutable',
    }
    if (kind === 'video') {
      // Chromium asks for a byte range on every media element load; answering
      // 206 (and advertising it on the plain response) is what makes the video
      // start reliably and seek on loop.
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