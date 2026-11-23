/**
 * @xxue-z/dsh-skin — 工作区与归档管理（Host half）。
 *
 * 补上 DSH 刻意留空的两块能力：
 *   1. 改工作区的登记信息——名称与工作目录。运行时的 `WorkspaceRegistry`
 *      只提供 `create/delete/rename` 与归档/置顶，没有改 path 的接口，
 *      这里走实体自己的单写入路径 `entity.mutate()`（内部 `table.update`
 *      会重新过滤 sessionIds 并盖 `updatedAt`），因此改完立即生效、无需重启。
 *   2. 永久删除已归档会话。DSH 能归档但从不删除：会话目录、投影缓存、
 *      归档/置顶登记三处都留着，这里负责一次擦干净，并且只对**当前归档**
 *      的会话开放。
 *
 * 一次删除正好清掉：
 *   a. `<DSH_HOME>/sessions/<project>/<encoded-id>/` 整个会话目录（各代 JSONL
 *      与会话私有产物），
 *   b. `<DSH_HOME>/storages/session_projcache/sessions/<id>.json` 投影缓存，
 *   c. 工作区登记里的归档与置顶记录，并广播 `api-session/removed`。
 *
 * 有意保留附件：附件是内容寻址的，跨会话共享，删掉会波及别的会话。
 *
 * 拒绝是契约的一部分：进程里还有 agent（可能握着写句柄）的会话、或者
 * `workspace/session-activity` 仍报告有活的会话，一律不动。
 *
 * @module lib/archive-admin
 */
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'

/** Harness home 下存会话日志的目录。 */
const SESSIONS_SEGMENT = 'sessions'
/** Harness home 下存 storage domain 的目录。 */
const STORAGES_SEGMENT = 'storages'
/** 会话投影缓存的 domain / table。 */
const PROJ_CACHE_DOMAIN = 'session_projcache'
const PROJ_CACHE_TABLE = 'sessions'
/** 任何一个已发布代际的会话日志文件名。 */
const LOG_FILE = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/
/** 会话 id 是带品牌类型的字符串；只有这个形状能变成文件名。 */
const SAFE_FILE_ID = /^[A-Za-z0-9._-]+$/
/** 工作区名称上限，与侧栏的视觉宽度相称。 */
const MAX_TITLE_LENGTH = 80
/** 清单缓存时间：面板一次刷新会同时读两个页签。 */
const INVENTORY_TTL_MS = 1500
/** 工作区用过的旧目录记录在 dataDir 下的这个文件里。 */
const HISTORY_FILE = 'workspace-paths.json'
/** 记录文件的结构版本，便于以后改形状时认出旧文件。 */
const HISTORY_VERSION = 1
/** 每个工作区最多记住多少个旧目录。 */
const MAX_HISTORY_PATHS = 24

/**
 * 展开 harness home 唯一接受的波浪号写法。
 * @param {string} path 可能以 `~` 开头的路径
 * @returns {string} 展开后的路径
 */
function expandHome(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * 按 `@deepseek-ai/dsh-home-paths` 的规则解析 harness home：
 * `$DSH_HOME` 优先，否则 `~/.dsh`，两者都对 cwd 做 resolve。
 * @returns {string} 绝对路径
 */
function resolveHome() {
  const fromEnv = process.env.DSH_HOME
  const base = fromEnv !== undefined && fromEnv.trim().length > 0 ? fromEnv : join(homedir(), '.dsh')
  return resolve(expandHome(base))
}

/**
 * 把任意字符串编码成一个安全的路径段。
 *
 * 与 session-persistence 后端的 `encodeSegment` 逐字一致：删除会话就是命名
 * 后端自己建出来的目录，重新推导这个名字是唯一能到达它的办法。
 * @param {string} raw 待编码字符串，不能为空
 * @returns {string} 转义后的单段路径
 */
export function encodeSegment(raw) {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/**
 * 子路径是否就是父目录或在父目录之下。
 * @param {string} parent 必须包含目标目录的根
 * @param {string} child 候选路径
 * @returns {boolean} 在根内时为 true
 */
function isInside(parent, child) {
  const root = resolve(parent)
  const target = resolve(child)
  return target === root || target.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)
}

/**
 * 两个路径是否指向同一个目录。
 *
 * Windows 的路径比较不区分大小写，`fs.realpath` 也不保证保留调用方写的大小写，
 * 所以折成小写、抹掉尾部分隔符再比；其余平台上这个比较同样成立。
 * @param {string} left 路径
 * @param {string} right 路径
 * @returns {boolean} 视为同一目录时为 true
 */
function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const flatten = (value) => value.replace(/[\\/]+$/, '').toLowerCase()
  return flatten(left) === flatten(right)
}

/**
 * 去重（按 {@link samePath} 判等）、丢空值并截断。
 * @param {string[]} values 候选路径
 * @param {number} [limit] 最多保留多少条
 * @returns {string[]} 干净的列表
 */
function uniquePaths(values, limit = MAX_HISTORY_PATHS) {
  const kept = []
  for (const value of values) {
    if (typeof value !== 'string' || value === '') continue
    if (kept.some((seen) => samePath(seen, value))) continue
    kept.push(value)
    if (kept.length >= limit) break
  }
  return kept
}

/**
 * 本模块读写的三个目录。
 * @returns {{ home: string, sessionsRoot: string, projCacheDir: string }}
 */
function paths() {
  const home = resolveHome()
  return {
    home,
    sessionsRoot: join(home, SESSIONS_SEGMENT),
    projCacheDir: join(home, STORAGES_SEGMENT, PROJ_CACHE_DOMAIN, PROJ_CACHE_TABLE),
  }
}

/**
 * 一次枚举持久化根下的全部会话目录。
 *
 * 结果以**编码后的**会话 id 为键——那是后端选定的目录名——所以查找不依赖
 * 会话的 cwd 是否还已知；并且只有真正放着会话日志的目录才被收录。
 * @param {string} root 会话根目录
 * @returns {Promise<Map<string, string>>} 编码 id → 绝对目录
 */
async function scanSessionDirs(root) {
  const found = new Map()
  let projects
  try {
    projects = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectPath = join(root, project.name)
    let entries
    try {
      entries = await fs.readdir(projectPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(projectPath, entry.name)
      let files
      try {
        files = await fs.readdir(dir)
      } catch {
        continue
      }
      if (files.some((file) => LOG_FILE.test(file))) found.set(entry.name, dir)
    }
  }
  return found
}

/**
 * 量一个目录树。
 * @param {string} dir 待量目录
 * @returns {Promise<{ sizeBytes: number, fileCount: number }>} 读不到时为 0
 */
async function measureDir(dir) {
  let sizeBytes = 0
  let fileCount = 0
  async function walk(current) {
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(child)
        continue
      }
      try {
        const info = await fs.stat(child)
        sizeBytes += info.size
        fileCount += 1
      } catch {
        /* 正在消失的文件不计入 */
      }
    }
  }
  await walk(dir)
  return { sizeBytes, fileCount }
}

/**
 * 汇报会话是否已加载、是否被 agent 持有、是否在跑。
 *
 * 只有 `agent` 与 `running` 会阻止删除：agent 可能已经握着日志的写句柄。
 * 仅仅「加载进内存」的会话只是读镜像——浏览器给每个渲染过的行留一份且
 * 从不释放，按 `attached` 拒绝会让归档会话越浏览越删不掉，而
 * activity waterfall 已经覆盖了真正的运行状态。
 * @param {object} ctx 插件上下文
 * @param {string} id 会话 id
 * @returns {{ attached: boolean, agent: boolean, running: boolean }}
 */
function liveness(ctx, id) {
  const session = ctx.get('sessions')?.get(id)
  const agent = ctx.get('agents')?.get(id)
  return {
    attached: session !== undefined,
    agent: agent !== undefined,
    running: agent?.status === 'running',
  }
}

/**
 * 问每个 `workspace/session-activity` provider 这个会话还担着什么活——
 * 与官方归档动作前置校验的是同一个 waterfall。
 * @param {object} ctx 插件上下文
 * @param {string} id 会话 id
 * @returns {Promise<object[]>} 报告的活动条目；查询失败时也返回一条，让调用方拒绝
 */
async function activityOf(ctx, id) {
  try {
    const reported = await ctx.waterfall('workspace/session-activity', { sessionId: id }, () => Promise.resolve([]))
    return Array.isArray(reported) ? reported : []
  } catch (error) {
    return [{ kind: 'activity-check-failed', label: String(error) }]
  }
}

/**
 * 读取工作区实体的显示字段（`status()` 是异步的，单独取）。
 * @param {object} entity 工作区实体
 * @returns {Promise<object>} 清单里的一行
 */
async function describeWorkspace(entity) {
  let status = 'ok'
  try {
    status = typeof entity.status === 'function' ? await entity.status() : 'ok'
  } catch {
    status = 'missing-dir'
  }
  return {
    id: entity.id,
    title: entity.title,
    path: entity.path,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    status,
    sessionCount: entity.sessionIds.length,
  }
}

/**
 * 建一个工作区/归档管理器。
 * @param {{ ctx: object, log?: (message: string) => void, dataDir?: string }} options
 *   上下文、日志与旧目录记录的存放目录（默认 `<DSH_HOME>/skin`）
 * @returns {{ inventory: Function, updateWorkspace: Function, deleteSessions: Function, unarchiveSessions: Function }}
 */
export function createArchiveAdmin({ ctx, log = () => {}, dataDir = join(resolveHome(), 'skin') }) {
  /** 上一次清单与其到期时间，用来吸收同一轮刷新里的重复读取。 */
  let cached = null
  let cachedAt = 0
  /** 旧目录记录：`{ version, workspaces: { [id]: { current, previous } } }`。 */
  let history = null
  /** 正在读记录的 Promise，避免并发读到半截状态。 */
  let historyPending = null

  /**
   * 工作区服务；未就绪时给一句人话而不是 undefined 崩栈。
   * @returns {object} 注册表
   */
  function registry() {
    const service = ctx.get('workspaceRegistry')
    if (service === undefined) throw new Error('工作区服务尚未就绪，请稍后重试')
    return service
  }

  /**
   * 旧目录记录文件的位置。
   * @returns {string} 绝对路径
   */
  function historyFile() {
    return join(dataDir, HISTORY_FILE)
  }

  /**
   * 读旧目录记录；文件缺失或损坏都当作空记录，绝不让面板因此打不开。
   * @returns {Promise<{ version: number, workspaces: Record<string, { current: string, previous: string[] }> }>}
   */
  async function loadHistory() {
    if (history !== null) return history
    if (historyPending !== null) return historyPending
    historyPending = (async () => {
      let parsed = null
      try {
        parsed = JSON.parse(await fs.readFile(historyFile(), 'utf8'))
      } catch {
        parsed = null
      }
      const source = parsed !== null && typeof parsed === 'object' && parsed.workspaces !== null && typeof parsed.workspaces === 'object' ? parsed.workspaces : {}
      const workspaces = {}
      for (const [id, entry] of Object.entries(source)) {
        if (id === '' || entry === null || typeof entry !== 'object') continue
        workspaces[id] = {
          current: typeof entry.current === 'string' ? entry.current : '',
          previous: uniquePaths(Array.isArray(entry.previous) ? entry.previous : []),
        }
      }
      history = { version: HISTORY_VERSION, workspaces }
      return history
    })()
    try {
      return await historyPending
    } finally {
      historyPending = null
    }
  }

  /**
   * 原子写回旧目录记录（先写临时文件再改名）。
   * @returns {Promise<void>}
   */
  async function saveHistory() {
    if (history === null) return
    await fs.mkdir(dataDir, { recursive: true })
    const target = historyFile()
    const temp = `${target}.${process.pid}.tmp`
    await fs.writeFile(temp, `${JSON.stringify(history, null, 2)}\n`, 'utf8')
    await fs.rename(temp, target)
  }

  /**
   * 让记录与注册表对齐：第一次见到的工作区补登记，外部改过的路径归类成旧目录，
   * 已经消失的工作区清掉条目。
   * @param {object[]} described 当前工作区清单
   * @returns {Promise<object>} 对齐后的记录
   */
  async function reconcileHistory(described) {
    const state = await loadHistory()
    const live = new Set(described.map((workspace) => workspace.id))
    let dirty = false
    for (const id of Object.keys(state.workspaces)) {
      if (live.has(id)) continue
      delete state.workspaces[id]
      dirty = true
    }
    for (const workspace of described) {
      const entry = state.workspaces[workspace.id]
      if (entry === undefined) {
        state.workspaces[workspace.id] = { current: workspace.path, previous: [] }
        dirty = true
        continue
      }
      if (samePath(entry.current, workspace.path)) continue
      const previous = uniquePaths([entry.current, ...entry.previous].filter((value) => !samePath(value, workspace.path)))
      state.workspaces[workspace.id] = { current: workspace.path, previous }
      dirty = true
    }
    if (dirty) await saveHistory()
    return state
  }

  /**
   * 记下一次改目录：把改之前的当前目录归档成「旧目录」。
   * @param {string} workspaceId 工作区
   * @param {string} previousPath 改之前的路径
   * @param {string} currentPath 改之后的路径
   * @returns {Promise<{ current: string, previous: string[] }>} 更新后的条目
   */
  async function rememberPath(workspaceId, previousPath, currentPath) {
    const state = await loadHistory()
    const entry = state.workspaces[workspaceId] ?? { current: '', previous: [] }
    const previous = uniquePaths([previousPath, entry.current, ...entry.previous].filter((value) => !samePath(value, currentPath)))
    state.workspaces[workspaceId] = { current: currentPath, previous }
    await saveHistory()
    return state.workspaces[workspaceId]
  }

  /**
   * 工作区行 + 它的旧目录列表。
   * @param {object} entity 工作区实体
   * @returns {Promise<object>} 清单里的一行
   */
  async function describeWithHistory(entity) {
    const described = await describeWorkspace(entity)
    try {
      const state = await loadHistory()
      described.previousPaths = state.workspaces[described.id]?.previous ?? []
    } catch {
      described.previousPaths = []
    }
    return described
  }

  /**
   * 已归档清单：登记簿记账 + 磁盘真相 + 会话头信息。
   * @returns {Promise<object>} 面板一次渲染所需的全部数据
   */
  async function buildInventory() {
    const { home, sessionsRoot, projCacheDir } = paths()
    const workspaces = registry().list()
    const described = []
    for (const workspace of workspaces) described.push(await describeWorkspace(workspace))
    // 旧目录记录只影响「归档会话挂在哪」这一层的显示，读不出记录也不该让清单失败。
    try {
      const state = await reconcileHistory(described)
      for (const workspace of described) workspace.previousPaths = state.workspaces[workspace.id]?.previous ?? []
    } catch (error) {
      log(`旧目录记录不可用：${String(error)}`)
      for (const workspace of described) workspace.previousPaths = []
    }
    const archivedIds = [...registry().archivedSessionIds]

    let snapshots = []
    let listingError = null
    try {
      snapshots = await ctx.get('sessionPersistence')?.list() ?? []
    } catch (error) {
      listingError = String(error)
    }
    const byId = new Map()
    const childrenOf = new Map()
    for (const snapshot of snapshots) {
      const header = snapshot?.header
      if (!header || typeof header.id !== 'string') continue
      byId.set(header.id, snapshot)
      const parent = header.parentSession
      if (typeof parent !== 'string' || parent === '') continue
      const siblings = childrenOf.get(parent)
      if (siblings === undefined) childrenOf.set(parent, [header.id])
      else siblings.push(header.id)
    }

    const dirs = await scanSessionDirs(sessionsRoot)
    const entities = new Map(workspaces.map((workspace) => [workspace.id, workspace]))
    const rows = []
    let totalBytes = 0
    for (const id of archivedIds) {
      const snapshot = byId.get(id)
      let dir
      try {
        dir = dirs.get(encodeSegment(id))
      } catch {
        dir = undefined
      }
      const measured = dir === undefined ? { sizeBytes: 0, fileCount: 0 } : await measureDir(dir)
      totalBytes += measured.sizeBytes
      let cacheBytes = 0
      if (SAFE_FILE_ID.test(id)) {
        try {
          cacheBytes = (await fs.stat(join(projCacheDir, `${id}.json`))).size
        } catch {
          cacheBytes = 0
        }
      }
      const cwd = snapshot?.header?.cwd ?? null
      const owners = described.filter((workspace) => entities.get(workspace.id)?.sessionIds.includes(id) === true)
      // DSH 只在 `session.cwd === workspace.path` 时认这个会话，所以改过目录的
      // 工作区会把旧会话放回「未分组」。这里用自己记的旧目录把它们认回来，
      // 让面板里仍然挂在这个工作区名下（侧栏的归属不受影响）。
      let owner = owners[0] ?? null
      let stalePath = false
      if (owner === null && typeof cwd === 'string' && cwd !== '') {
        // 先认「cwd 正好是当前目录」的：注册表可能因为一次改目录把它从记账里
        // 摘掉，但它本来就在这个目录里，面板该把它认回来。
        const current = described.find((workspace) => samePath(workspace.path, cwd)) ?? null
        const historical = current ?? described.find((workspace) => (workspace.previousPaths ?? []).some((value) => samePath(value, cwd))) ?? null
        owner = historical
        stalePath = historical !== null && !samePath(historical.path, cwd)
      }
      rows.push({
        id,
        cwd,
        createdAt: snapshot?.header?.createdAt ?? null,
        logBytes: snapshot?.sizeBytes ?? null,
        dir: dir ?? null,
        sizeBytes: measured.sizeBytes,
        fileCount: measured.fileCount,
        cacheBytes,
        exists: dir !== undefined,
        known: snapshot !== undefined,
        live: liveness(ctx, id),
        childIds: childrenOf.get(id) ?? [],
        workspaceId: owner?.id ?? null,
        workspaceTitle: owner?.title ?? null,
        workspacePath: owner?.path ?? null,
        previousPath: stalePath ? cwd : null,
        stalePath,
      })
    }

    return {
      home,
      sessionsRoot,
      workspaces: described,
      archived: rows,
      totals: {
        workspaces: described.length,
        archived: rows.length,
        missing: rows.filter((row) => !row.exists).length,
        bytes: totalBytes,
      },
      listingError,
    }
  }

  /**
   * 带短缓存的清单。
   * @returns {Promise<object>}
   */
  async function inventory() {
    const now = Date.now()
    if (cached !== null && now - cachedAt < INVENTORY_TTL_MS) return cached
    const value = await buildInventory()
    cached = value
    cachedAt = Date.now()
    return value
  }

  /**
   * 改一个工作区的名称和/或工作目录。
   *
   * `path` 走 `entity.mutate()`：那是实体唯一的公开写入路径，内部会按新
   * path 重新过滤 sessionIds（cwd 不匹配的会话从该工作区的记账里脱落，
   * 但它们自己的日志与列表项都还在，会落到「未分组」）。改之前的目录会被
   * 记成「旧目录」，让面板能把这些会话继续挂在同一个工作区名下。
   * @param {{ workspaceId?: string, title?: string, path?: string }} input 改动
   * @returns {Promise<object>} 改动后的工作区与脱落的会话
   */
  async function updateWorkspace(input) {
    const body = input && typeof input === 'object' ? input : {}
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : ''
    if (workspaceId === '') throw new Error('缺少工作区标识')
    const service = registry()
    const entity = typeof service.get === 'function' ? service.get(workspaceId) : undefined
    if (entity === undefined || entity === null) throw new Error('工作区不存在')

    const patch = {}
    if (body.title !== undefined) {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      if (title === '') throw new Error('名称不能为空')
      if (title.length > MAX_TITLE_LENGTH) throw new Error(`名称最多 ${MAX_TITLE_LENGTH} 个字符`)
      if (title !== entity.title) patch.title = title
    }
    if (body.path !== undefined) {
      const raw = typeof body.path === 'string' ? body.path.trim() : ''
      if (raw === '') throw new Error('工作目录不能为空')
      if (!isAbsolute(raw)) throw new Error('工作目录必须是绝对路径')
      let canonical
      try {
        canonical = await fs.realpath(raw)
      } catch {
        throw new Error(`工作目录不存在或无法访问：${raw}`)
      }
      let stats
      try {
        stats = await fs.stat(canonical)
      } catch {
        throw new Error(`工作目录无法访问：${canonical}`)
      }
      if (!stats.isDirectory()) throw new Error(`工作目录不是文件夹：${canonical}`)
      const clash = service.list().find((candidate) => candidate.id !== workspaceId && candidate.path === canonical)
      if (clash !== undefined) throw new Error(`已有工作区指向该目录：${clash.title}`)
      if (canonical !== entity.path) patch.path = canonical
    }
    if (Object.keys(patch).length === 0) {
      cached = null
      return { workspace: await describeWithHistory(entity), detached: [], changed: false }
    }

    const beforePath = entity.path
    const before = [...entity.sessionIds]
    await entity.mutate((record) => ({ ...record, ...patch }))
    const after = new Set(entity.sessionIds)
    const detached = before.filter((id) => !after.has(id))
    let previousPaths = []
    if (patch.path !== undefined && !samePath(beforePath, entity.path)) {
      try {
        const entry = await rememberPath(workspaceId, beforePath, entity.path)
        previousPaths = entry.previous
      } catch (error) {
        // 记录写不进去最多让旧会话回到「未分组」，不该让改目录本身失败。
        log(`旧目录记录写入失败：${String(error)}`)
      }
    }
    cached = null
    log(`工作区已更新：${entity.title} → ${entity.path}${detached.length > 0 ? `（${detached.length} 个会话转为旧目录）` : ''}`)
    const workspace = await describeWithHistory(entity)
    workspace.previousPaths = previousPaths
    return { workspace, detached, changed: true }
  }

  /**
   * 擦掉一个已归档会话：日志目录、投影缓存、登记记账。全部拒绝判断都在
   * 第一次写之前完成。
   * @param {string} id 已归档会话
   * @param {Map<string, string>} dirs 预先扫好的会话目录表
   * @returns {Promise<object>} 单个会话的结果
   */
  async function eraseSession(id, dirs) {
    const service = registry()
    if (!service.archivedSessionIds.includes(id)) return { id, status: 'skipped', reason: 'not-archived' }
    const live = liveness(ctx, id)
    if (live.agent) return { id, status: 'refused', reason: 'live', live }
    const activity = await activityOf(ctx, id)
    if (activity.length > 0) return { id, status: 'refused', reason: 'active', activity }

    const { sessionsRoot, projCacheDir } = paths()
    let dir
    try {
      dir = dirs.get(encodeSegment(id))
    } catch {
      dir = undefined
    }
    // 只有在会话根下、且目录名正好是编码后 id 的目录才会被删。
    if (dir !== undefined && !isInside(sessionsRoot, dir)) return { id, status: 'failed', reason: 'outside-root', dir }

    const removed = { dir: null, sizeBytes: 0, fileCount: 0, cache: false, cacheBytes: 0 }
    if (dir !== undefined) {
      const measured = await measureDir(dir)
      await fs.rm(dir, { recursive: true, force: true })
      removed.dir = dir
      removed.sizeBytes = measured.sizeBytes
      removed.fileCount = measured.fileCount
    }
    if (SAFE_FILE_ID.test(id)) {
      const cacheFile = join(projCacheDir, `${id}.json`)
      try {
        const info = await fs.stat(cacheFile)
        await fs.rm(cacheFile, { force: true })
        removed.cache = true
        removed.cacheBytes = info.size
      } catch {
        removed.cache = false
      }
    }
    // 客户端的会话列表由 Host 事件喂养，自己没有删除路径：磁盘上悄悄消失的
    // 会话会留下一条还能点开的幽灵行。用 session controller 为这件事定义的
    // `api-session/removed` 广播，且放在登记簿写入之前——否则那一行会先解除
    // 隐藏再消失。
    try {
      ctx.emit('api-session/removed', id)
    } catch (error) {
      log(`无法广播会话删除（${id}）：${String(error)}`)
    }
    await service.unarchiveSession(id)
    await service.unpinSession(id)
    return { id, status: 'deleted', ...removed }
  }

  /**
   * 批量永久删除已归档会话。
   * @param {string[]} ids 会话 id
   * @returns {Promise<{ results: object[] }>}
   */
  async function deleteSessions(ids) {
    const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id !== '') : []
    if (list.length === 0) throw new Error('没有要删除的会话')
    const dirs = await scanSessionDirs(paths().sessionsRoot)
    const results = []
    for (const id of list) {
      try {
        results.push(await eraseSession(id, dirs))
      } catch (error) {
        results.push({ id, status: 'failed', reason: error instanceof Error ? error.message : String(error) })
      }
    }
    cached = null
    const deleted = results.filter((row) => row.status === 'deleted').length
    if (deleted > 0) log(`已永久删除 ${deleted} 个归档会话`)
    return { results }
  }

  /**
   * 批量取消归档（会话回到侧栏）。
   * @param {string[]} ids 会话 id
   * @returns {Promise<{ results: object[] }>}
   */
  async function unarchiveSessions(ids) {
    const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id !== '') : []
    if (list.length === 0) throw new Error('没有要恢复的会话')
    const service = registry()
    const results = []
    for (const id of list) {
      try {
        await service.unarchiveSession(id)
        results.push({ id, status: 'restored' })
      } catch (error) {
        results.push({ id, status: 'failed', reason: error instanceof Error ? error.message : String(error) })
      }
    }
    cached = null
    return { results }
  }

  return { inventory, updateWorkspace, deleteSessions, unarchiveSessions }
}