/**
 * A minimal Chrome DevTools Protocol client for the 红果短剧 desktop app.
 *
 * The app is a Wails/WebView2 shell: every backend call the UI makes goes
 * through `window.go.app.App.<Method>`, generated into the page at runtime.
 * Those bindings are the only usable API — the request signing they perform
 * lives in a bytecode VM inside the executable and cannot be reproduced from
 * Node — so this client drives the page with `Runtime.evaluate` instead of
 * talking to the upstream HTTP API.
 *
 * Node 22 ships a global `WebSocket`, which is all a CDP evaluate needs.
 */

/** How long one evaluate may take before we give up on the page. */
const DEFAULT_TIMEOUT_MS = 30000

/** The page belongs to the app when its URL is this origin. */
const APP_ORIGIN = /^http:\/\/wails\.localhost\b/i

/**
 * List page targets on a loopback CDP endpoint.
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 * @returns {Promise<Array<{id: string, url: string, webSocketDebuggerUrl: string}>>}
 */
export async function listTargets(port, timeoutMs = 4000) {
  const response = await fetchJson(`http://127.0.0.1:${port}/json/list`, timeoutMs)
  return Array.isArray(response) ? response : []
}

/** Whether a CDP endpoint answers at all — used to probe a live instance. */
export async function probePort(port, timeoutMs = 1500) {
  try {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`, timeoutMs)
    return typeof version?.Browser === 'string' ? version.Browser : true
  } catch {
    return null
  }
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Pick the app page, or the first page when the app origin is not up yet.
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 */
export async function pickTarget(port, timeoutMs = 4000) {
  const targets = await listTargets(port, timeoutMs)
  const pages = targets.filter((entry) => entry && typeof entry.webSocketDebuggerUrl === 'string')
  const app = pages.find((entry) => APP_ORIGIN.test(String(entry.url ?? '')))
  const page = app ?? pages.find((entry) => entry.type === 'page') ?? pages[0]
  if (!page) throw new Error(`CDP 端口 ${port} 上没有可用的页面`)
  return page
}

/**
 * Evaluate an expression in the app page and return its value.
 *
 * `awaitPromise` makes async bindings resolve; `returnByValue` keeps the answer
 * on the protocol instead of leaving an object handle behind. Long results are
 * the caller's problem — project inside the page (see `api.js`).
 *
 * @param {number} port
 * @param {string} expression
 * @param {{timeoutMs?: number, targetId?: string}} [options]
 */
export async function evaluate(port, expression, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
  const target = options.targetId
    ? { webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${options.targetId}` }
    : await pickTarget(port, Math.min(timeoutMs, 5000))

  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        /* already closed */
      }
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => finish(new Error(`CDP 求值超时（${timeoutMs}ms）`)), timeoutMs)

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
            allowUnsafeEvalBlockedByCSP: true,
          },
        }),
      )
    })
    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (message.id !== 1) return
      if (message.error) {
        finish(new Error(message.error.message ?? 'CDP 调用失败'))
        return
      }
      const result = message.result ?? {}
      const exception = result.exceptionDetails
      if (exception) {
        const text =
          exception.exception?.description ?? exception.exception?.value ?? exception.text ?? '页面脚本抛出了异常'
        finish(new Error(String(text).split('\n')[0]))
        return
      }
      finish(null, result.result?.value)
    })
    socket.addEventListener('error', () => finish(new Error('CDP WebSocket 连接失败')))
    socket.addEventListener('close', () => {
      if (!settled) finish(new Error('CDP 连接被关闭'))
    })
  })
}

/**
 * Wait until the Wails bindings exist on the page.
 *
 * The debug port answers as soon as WebView2 is up, which is seconds before the
 * SPA has loaded the Wails runtime; evaluating `window.go.app.App.*` in that
 * window throws `Cannot read properties of undefined`. Gating here keeps every
 * later call deterministic instead of racing the page.
 *
 * @param {number} port
 * @param {number} [timeoutMs]
 */
export async function waitReady(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let last = 'unknown'
  while (Date.now() < deadline) {
    try {
      const kind = await evaluate(port, 'typeof window.go?.app?.App', { timeoutMs: 3000 })
      last = String(kind)
      if (last === 'object' || last === 'function') return true
    } catch (error) {
      last = error?.message ?? String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`红果页面在 ${timeoutMs}ms 内没有就绪（window.go.app.App: ${last}）`)
}

/** JSON literal safe to paste into an evaluated expression. */
export function literal(value) {
  return JSON.stringify(value ?? null)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}