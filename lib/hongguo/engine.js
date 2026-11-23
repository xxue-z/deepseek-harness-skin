/**
 * Locating, launching and reusing the 红果短剧 desktop engine.
 *
 * The app is the only component that can sign upstream requests, so the skill
 * runs it as an engine rather than reimplementing the API. Three rules matter:
 *
 * 1. **Reuse before launch.** A second instance would refuse to start anyway
 *    (the app takes a named mutex), so a live CDP port from our own state file
 *    is always preferred.
 * 2. **Launch hidden.** The window geometry is remembered in
 *    `%APPDATA%\hgplayer\window.json`; moving it off-screen before the launch
 *    keeps the app out of the way without patching it. The user's own geometry
 *    is saved once and restored when we stop the instance we started.
 * 3. **Own what we started.** `stop()` only kills the process we spawned, and
 *    only if it is still that process.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { probePort, waitReady } from './cdp.js'
import { readZip } from '../zip.js'

const UPSTREAM_REPO = 'yangbin1322/hongguo-player'
const WIN_ASSET = /windows-amd64\.zip$/i
const EXE_NAME = /\.exe$/i

/** Process names both known builds use; the mutex is per-app, not per-file. */
const PROCESS_NAMES = ['短剧播放器.exe', '红果短剧.exe']

/** Kill the launch attempt when the window never opens. */
const LAUNCH_TIMEOUT_MS = 45000
/** How long one release download may stall before we give up. */
const DOWNLOAD_TIMEOUT_MS = 180000

/** Off-screen geometry: far enough left that no monitor shows it. */
const OFFSCREEN_WINDOW = { main: { x: -3200, y: 0, w: 1280, h: 800 }, mini: { x: -3200, y: 0, w: 960, h: 600 } }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Every 红果/短剧播放器 process currently visible, whoever started it.
 *
 * `tasklist` ships with Windows and needs no shell, unlike `Get-Process`. Its
 * columns come back in the OEM code page, so image names arrive as mojibake —
 * they are matched on the Windows side through `/FI` and only the ASCII PID
 * column is parsed here.
 */
function runningProcesses() {
  const found = []
  for (const name of PROCESS_NAMES) {
    const result = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.status !== 0 || typeof result.stdout !== 'string') continue
    for (const line of result.stdout.split(/\r?\n/)) {
      const cells = line.match(/"([^"]*)"/g)
      if (!cells || cells.length < 2) continue
      const pid = Number(cells[1].replaceAll('"', ''))
      if (Number.isInteger(pid) && pid > 0) found.push({ name, pid })
    }
  }
  return found
}

/** Close every running instance so a fresh one can take the debug port. */
function closeRunning() {
  const running = runningProcesses()
  for (const entry of running) {
    try {
      spawnSync('taskkill', ['/PID', String(entry.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      /* the process may have exited between the list and the kill */
    }
  }
  return running
}

/**
 * @param {object} options
 * @param {string} options.root           our own data directory
 * @param {(message: string) => void} [options.log]
 */
export function createEngine(options) {
  const root = options.root
  const log = typeof options.log === 'function' ? options.log : () => {}
  const stateFile = join(root, 'engine.json')
  const engineDir = join(root, 'engine')
  /** @type {{exePath?: string, port?: number, pid?: number}} */
  let state = readState()

  function readState() {
    try {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8'))
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  function writeState(patch) {
    state = { ...state, ...patch }
    try {
      mkdirSync(root, { recursive: true })
      writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    } catch (error) {
      log(`引擎状态写入失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Port the engine should listen on; a fixed default keeps reuse simple. */
  function port(override) {
    const wanted = Number(override) > 0 ? Number(override) : Number(process.env.DSH_HONGGUO_CDP_PORT ?? 9315)
    return Number.isInteger(wanted) && wanted > 1024 && wanted < 65536 ? wanted : 9315
  }

  /**
   * Candidate executables, cheapest first.
   *
   * `DSH_HONGGUO_ENGINE` wins so a developer (or a user with a custom install)
   * can point at the binary without editing anything.
   */
  function candidates() {
    const list = []
    const env = process.env.DSH_HONGGUO_ENGINE
    if (typeof env === 'string' && env.trim() !== '') list.push(env.trim())
    if (typeof state.exePath === 'string' && state.exePath !== '') list.push(state.exePath)
    list.push(join(engineDir, '短剧播放器.exe'), join(engineDir, '红果短剧.exe'))
    const local = process.env.LOCALAPPDATA
    const roaming = process.env.APPDATA
    if (local) {
      for (const dir of ['Programs\\hgplayer', 'hgplayer', 'Programs\\hongguo-player', 'Programs\\红果短剧']) {
        list.push(join(local, dir, '短剧播放器.exe'), join(local, dir, '红果短剧.exe'))
      }
    }
    if (roaming) list.push(join(dirname(roaming), 'Local', 'Programs', 'hgplayer', '短剧播放器.exe'))
    list.push('C:\\ProgramCustom\\hongguo-player\\红果短剧.exe')
    // A development checkout keeps a portable copy under .temp/.
    if (options.packageDir) {
      const temp = join(options.packageDir, '.temp')
      try {
        for (const entry of readdirSync(temp, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          list.push(join(temp, entry.name, '短剧播放器.exe'), join(temp, entry.name, '红果短剧.exe'))
        }
      } catch {
        /* no .temp: a normal install */
      }
    }
    return [...new Set(list)]
  }

  function findInstalled() {
    for (const candidate of candidates()) {
      if (existsSync(candidate)) return candidate
    }
    return null
  }

  /**
   * Download the upstream portable build once and unpack it beside our state.
   *
   * The archive carries the engine plus the optional ffmpeg/WebView2 helpers, so
   * one download covers a machine that has never seen this app.
   */
  async function download(onProgress) {
    if (process.platform !== 'win32') throw new Error('红果引擎只支持 Windows')
    mkdirSync(engineDir, { recursive: true })
    log('未找到红果引擎，正在下载便携版…')
    const release = await fetchRelease()
    const asset = release.assets.find((entry) => WIN_ASSET.test(String(entry.name ?? '')))
    if (!asset) throw new Error(`上游 ${release.tag} 没有 Windows 便携包`)
    onProgress?.(`正在下载 ${asset.name}（${Math.round(Number(asset.size ?? 0) / 1048576)} MB）…`)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
    let bytes
    try {
      const response = await fetch(asset.browser_download_url, {
        signal: controller.signal,
        headers: { 'user-agent': 'dsh-skin' },
      })
      if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
      bytes = Buffer.from(await response.arrayBuffer())
    } finally {
      clearTimeout(timer)
    }
    const files = readZip(bytes)
    let exe = null
    for (const [name, contents] of files) {
      const target = join(engineDir, name)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents)
      if (EXE_NAME.test(name) && /播放器|红果/.test(name)) exe = target
    }
    if (!exe) {
      const anyExe = [...files.keys()].find((name) => EXE_NAME.test(name))
      if (!anyExe) throw new Error('便携包里没有可执行文件')
      exe = join(engineDir, anyExe)
    }
    writeFileSync(join(engineDir, 'VERSION'), `${release.tag}\n`, 'utf8')
    writeState({ exePath: exe, version: release.tag })
    log(`红果引擎已就绪：${release.tag} → ${exe}`)
    return exe
  }

  async function fetchRelease() {
    const response = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest`, {
      headers: { 'user-agent': 'dsh-skin', accept: 'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error(`查询上游版本失败：HTTP ${response.status}`)
    const release = await response.json()
    if (!Array.isArray(release?.assets)) throw new Error('上游版本信息缺少 assets')
    return release
  }

  /** Hide the window we are about to open, saving the user's geometry once. */
  function hideWindow() {
    const file = join(process.env.APPDATA ?? '', 'hgplayer', 'window.json')
    if (!file.startsWith(process.env.APPDATA ?? '\u0000')) return null
    const backup = `${file}.dsh-skin.json`
    try {
      if (existsSync(file) && !existsSync(backup)) writeFileSync(backup, readFileSync(file))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, `${JSON.stringify(OFFSCREEN_WINDOW, null, 2)}\n`, 'utf8')
      return file
    } catch (error) {
      log(`窗口位置写入失败（仍会启动，可能弹窗）：${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  function restoreWindow() {
    const file = join(process.env.APPDATA ?? '', 'hgplayer', 'window.json')
    const backup = `${file}.dsh-skin.json`
    try {
      if (!existsSync(backup)) return
      writeFileSync(file, readFileSync(backup))
      writeFileSync(backup, '', 'utf8')
    } catch {
      /* geometry is cosmetic */
    }
  }

  /**
   * Ensure a usable engine and return its CDP port.
   *
   * @param {{port?: number, hidden?: boolean, onProgress?: (text: string) => void}} [wanted]
   * @returns {Promise<{port: number, exe: string, pid: number|null, reused: boolean}>}
   */
  async function ensure(wanted = {}) {
    if (process.platform !== 'win32') throw new Error('红果引擎只支持 Windows')
    const listen = port(wanted.port)
    const alive = await probePort(listen)
    if (alive) {
      log(`复用已在运行的红果引擎（CDP ${listen}）`)
      await waitReady(listen)
      return { port: listen, exe: state.exePath ?? '', pid: Number(state.pid) || null, reused: true }
    }
    // The port may be open on a *different* app instance started from our own
    // state: prefer whatever the state file recorded over launching again.
    const recorded = port(state.port)
    if (recorded !== listen) {
      const other = await probePort(recorded)
      if (other) {
        await waitReady(recorded)
        return { port: recorded, exe: state.exePath ?? '', pid: Number(state.pid) || null, reused: true }
      }
    }

    let exe = findInstalled()
    if (!exe) exe = await download(wanted.onProgress)

    // The app holds a named mutex, so launching while another copy runs only
    // makes our child exit immediately and the port never opens. An instance
    // that is already serving a debug port was handled above; anything else has
    // to go before we can own the port.
    const stale = runningProcesses()
    if (stale.length > 0) {
      log(`关闭已在运行的红果实例（pid ${stale.map((entry) => entry.pid).join(', ')}），以便带调试端口重启`)
      closeRunning()
      await sleep(1500)
    }

    const hidden = wanted.hidden !== false
    if (hidden) hideWindow()
    log(`启动红果引擎：${exe}（CDP ${listen}${hidden ? '，离屏' : ''}）`)
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      cwd: dirname(exe),
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${listen}` },
    })
    child.unref()

    const deadline = Date.now() + LAUNCH_TIMEOUT_MS
    while (Date.now() < deadline) {
      const probe = await probePort(listen, 800)
      if (probe) {
        await waitReady(listen)
        writeState({ exePath: exe, port: listen, pid: child.pid ?? null })
        return { port: listen, exe, pid: child.pid ?? null, reused: false }
      }
      await sleep(350)
    }
    throw new Error(
      '红果引擎启动后没有打开调试端口。若 App 已经在运行（单实例），请先关闭它再试；' +
        '或者给系统环境变量 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 设置 "--remote-debugging-port=9315" 后手动启动一次。',
    )
  }

  /** Stop the instance we started, if it is still the same process. */
  function stop() {
    const pid = Number(state.pid)
    if (!Number.isInteger(pid) || pid <= 0) {
      restoreWindow()
      return false
    }
    try {
      process.kill(pid)
    } catch {
      /* already gone */
    }
    restoreWindow()
    writeState({ pid: null, port: null })
    return true
  }

  return { ensure, stop, findInstalled, download, stateFile, engineDir, restoreWindow, runningProcesses }
}