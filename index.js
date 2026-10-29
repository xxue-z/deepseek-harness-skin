/**
 * @xxue-z/dsh-skin — Host half.
 *
 * Owns the skin library on disk, serves the `/skin` HTTP surface the Web client
 * calls, and registers the `skin_theme` agent tool. The Web half (client.js)
 * renders the manager and applies the selected skin through `ctx.theme`.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkinHandler } from './lib/api.js'
import { seedBundledThemes } from './lib/bundled.js'
import { defaultCodexDirs, SkinService } from './lib/service.js'
import { SkinStore } from './lib/store.js'
import { createSkinTool } from './lib/tool.js'
import { checkForUpdate, readVersion } from './lib/update.js'

// Must match package.json `name` and the `name` in cordis.patch.yml: the loader
// resolves that row through node_modules, so a mismatch is ERR_MODULE_NOT_FOUND.
export const name = '@xxue-z/dsh-skin'

/** The package directory this module was loaded from. */
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))

/** Where the client stages a downloaded release before it is installed. */
const UPDATE_DIR = 'update'

function isSymlink(path) {
  try {
    const stats = lstatSync(path)
    return stats.isSymbolicLink() || (typeof stats.isJunction === 'function' && stats.isJunction())
  } catch {
    return false
  }
}

function readRealpath(path) {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/**
 * Swap a staged release into the installed directory.
 *
 * The staging check keeps a stray path from being promoted; the link check
 * keeps a `plugin_manager install_bundle` install (a profile entry that points
 * at the user's checkout) from being "updated" by renaming, which would move
 * the link aside and leave the plugin on its old version.
 *
 * @param {{ directory: string, target: string, root: string, log?: (message: string) => void }} options
 */
export async function installStagedBundle({ directory, target, root, log }) {
  const backup = `${target}.previous-${Date.now()}`
  const staged = resolve(directory)
  if (!staged.startsWith(resolve(root))) throw new Error('更新包不在暂存目录里')
  if (!existsSync(join(staged, 'package.json'))) throw new Error('更新包缺少 package.json')
  if (isSymlink(target)) {
    const link = readRealpath(target) ?? target
    throw new Error(`当前插件目录是符号链接，指向 ${link}：请到那个目录执行 git pull 更新，或重新 install_bundle`)
  }
  await rename(target, backup)
  try {
    await rename(staged, target)
  } catch (error) {
    // A half-swapped directory would break the next start: put it back.
    await rename(backup, target).catch(() => log?.(`回滚失败，原目录备份在 ${backup}`))
    throw error
  }
  return { target, backup }
}

function normalizeConfig(config) {
  const input = config && typeof config === 'object' ? config : {}
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  const dataDir = typeof input.dataDir === 'string' && input.dataDir.trim() !== '' ? resolve(input.dataDir) : join(home, 'skin')
  const codexDirs = Array.isArray(input.codexDirs)
    ? input.codexDirs.filter((entry) => typeof entry === 'string' && entry.trim() !== '').map((entry) => resolve(entry))
    : []
  const model = input.designerModel
  const designerModel =
    model && typeof model === 'object' && typeof model.provider === 'string' && typeof model.model === 'string'
      ? { provider: model.provider, model: model.model }
      : null
  return {
    dataDir,
    codexDirs: codexDirs.length > 0 ? codexDirs : defaultCodexDirs(),
    designerModel,
    enableTool: input.enableTool !== false,
  }
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return {}
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function apply(ctx, config) {
  const options = normalizeConfig(config)
  const store = new SkinStore(options.dataDir)
  store.ensure()

  const log = (message) => {
    try {
      ctx.logger?.warn?.(`[dsh-skin] ${message}`)
    } catch {
      /* no logger on this context */
    }
    if (ctx.logger === undefined) console.log(`[dsh-skin] ${message}`)
  }

  // Version and release identity come from the package manifest, so the number
  // shown in Settings is the same one the tag and the release note carry.
  const manifest = readManifest()
  const meta = {
    version: readVersion(join(PACKAGE_DIR, 'package.json')),
    repository:
      typeof manifest.repository?.url === 'string'
        ? manifest.repository.url.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '')
        : 'xxue-z/deepseek-harness-skin',
  }

  const service = new SkinService({
    store,
    config: options,
    getLlm: () => ctx.get('llm'),
    getSelection: () => ctx.get('agentDefaultModel')?.currentSelection(),
    getClientModules: () => ctx.get('clientModules'),
    meta,
  })

  const handler = createSkinHandler(service, { store, log, meta })

  // Fold the playlist position into state.json on the way out, so a quit that
  // lands between two client reports still resumes on the right clip. The
  // playlist switch itself is memory-only and is off again on the next start.
  ctx.effect(() => () => service.stop())

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({ kind: 'prefix', path: '/skin', handler }))
  })

  // ---- one-click update ------------------------------------------------------
  // The client downloads the tagged tarball, unpacks it under <DSH_HOME>/skin/
  // update/<dir>, then asks the Host to swap it with the installed directory.
  // A plain `git pull` is the other, equally supported path: nothing here
  // depends on the install being pristine.

  service.updateCheck = (extra = {}) => checkForUpdate({ version: meta.version, repository: meta.repository, ...extra })

  service.stageUpdate = (bytes) => {
    if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) throw new Error('更新包为空')
    const staging = join(store.root, UPDATE_DIR)
    const directory = join(staging, `v-${meta.version}-${Date.now().toString(36)}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'bundle.tgz'), bytes)
    return directory
  }

  service.installStagedUpdate = (directory) => installStagedBundle({ directory, target: PACKAGE_DIR, root: store.root, log })

  // Bundled themes: copied into the library once, so a fresh install opens on
  // two ready-made skins instead of an empty list. Deleting one stays deleted.
  try {
    const seeded = seedBundledThemes(store, PACKAGE_DIR)
    if (seeded.seeded.length > 0) log(`已导入自带主题：${seeded.seeded.join(', ')}`)
  } catch (error) {
    log(`自带主题导入失败：${error instanceof Error ? error.message : String(error)}`)
  }

  const toolState = { registered: false, error: null }
  service.getToolState = () => toolState
  if (options.enableTool) {
    ctx.inject(['tools'], (toolCtx) => {
      try {
        const disposer = toolCtx.tools.register(createSkinTool(service))
        toolState.registered = true
        toolState.error = null
        toolCtx.effect(() => disposer)
      } catch (error) {
        toolState.registered = false
        toolState.error = error instanceof Error ? error.message : String(error)
        log(`skin_theme 注册失败：${toolState.error}`)
      }
    })
  }
}