/**
 * HTTP surface of the skin plugin.
 *
 * The persistent client half has no RPC channel to its Host half, so the Host
 * publishes a small JSON API on the same origin the page is served from, plus
 * the wallpaper bytes. Both are loopback-only and read/write nothing outside
 * the skin library.
 */
import { existsSync, statSync, createReadStream } from 'node:fs'
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

/**
 * Build the request handler for the `/skin` prefix.
 * @param {import('./service.js').SkinService} service
 * @param {{ store: import('./store.js').SkinStore, log?: (message: string) => void }} deps
 */
export function createSkinHandler(service, deps) {
  const { store, log } = deps

  return async function handle(request, response) {
    if (!isLoopback(request)) {
      sendJson(response, 403, { ok: false, error: '仅允许本机访问' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname

    try {
      if (path.startsWith('/skin/assets/')) {
        serveWallpaper(request, response, path)
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
        case 'import-path': {
          const result = service.importPath(body.path, { replaceSameSource: body.replaceSameSource === true })
          sendJson(response, 200, { ok: true, result, snapshot: service.snapshot() })
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

  function serveWallpaper(request, response, path) {
    const match = /^\/skin\/assets\/([^/]+)\/wallpaper$/.exec(path)
    if (!match) {
      sendJson(response, 404, { ok: false, error: '资源不存在' })
      return
    }
    const id = decodeURIComponent(match[1])
    if (!isSkinId(id)) {
      sendJson(response, 400, { ok: false, error: '非法皮肤 id' })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { ok: false, error: '只支持 GET' })
      return
    }
    const file = store.wallpaperPath(id)
    if (file === null || !existsSync(file)) {
      sendJson(response, 404, { ok: false, error: '这个皮肤没有壁纸' })
      return
    }
    const stats = statSync(file)
    response.writeHead(200, {
      'content-type': store.wallpaperType(id),
      'content-length': stats.size,
      'cache-control': 'public, max-age=31536000, immutable',
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
  }
}