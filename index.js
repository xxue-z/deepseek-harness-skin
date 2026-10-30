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
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
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

/* -------------------------------------------------------------------------- */
/* release bundle unpacking                                                    */
/* -------------------------------------------------------------------------- */

/** A release bundle is source only; anything larger than this is not one. */
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024

/**
 * Split a gzip'd tar archive into its entries.
 *
 * The release asset is `<name>-vX.Y.Z.tar.gz` (possibly with a leading `./` on
 * every path); `.zip` is not handled here because the release is always a
 * tarball. Only regular files and directories are accepted — links and device
 * entries in an "update" are never something to write out.
 *
 * @param {Buffer} bytes
 * @returns {{ path: string, data: Buffer | null }[]}
 */
export function readTarGz(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) throw new Error('更新包为空')
  let tar
  try {
    tar = gunzipSync(bytes)
  } catch {
    throw new Error('更新包不是有效的 gzip 文件')
  }
  const entries = []
  let offset = 0
  let total = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    // Two zero blocks end the archive; a zero block on its own is padding.
    if (header.every((byte) => byte === 0)) break
    const readString = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '')
    const name = readString(0, 100)
    const prefix = readString(345, 155)
    const full = prefix === '' ? name : `${prefix}/${name}`
    const sizeField = readString(124, 12).trim()
    const size = sizeField === '' ? 0 : parseInt(sizeField, 8)
    if (!Number.isFinite(size) || size < 0) throw new Error('更新包的目录项损坏')
    const typeflag = String.fromCharCode(header[156] || 48)
    const dataStart = offset + 512
    const dataEnd = dataStart + size
    if (dataEnd > tar.length) throw new Error('更新包被截断')
    total += size
    if (total > MAX_UNPACKED_BYTES) throw new Error('更新包解压后过大')
    if (typeflag === '0' || typeflag === '\0' || typeflag === '7') {
      entries.push({ path: full, data: tar.subarray(dataStart, dataEnd) })
    } else if (typeflag === '5') {
      entries.push({ path: full, data: null })
    } else {
      throw new Error(`更新包里有不支持的条目类型：${full}`)
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  if (entries.length === 0) throw new Error('更新包是空的')
  return entries
}

/**
 * Unpack a release bundle into a directory.
 *
 * Paths are resolved under `directory` and refused when they escape it, so a
 * `../` in an archive cannot write outside the staging area.
 *
 * @param {Buffer} bytes
 * @param {string} directory
 * @returns {{ files: number, root: string }}
 */
export function unpackBundle(bytes, directory) {
  const target = resolve(directory)
  const entries = readTarGz(bytes)
  let files = 0
  for (const entry of entries) {
    const relative = entry.path.replace(/^\.\//, '').replace(/\/+$/, '')
    if (relative === '' || relative === '.') continue
    const destination = resolve(target, relative)
    if (destination !== target && !destination.startsWith(target + sep)) {
      throw new Error(`更新包里有越界路径：${entry.path}`)
    }
    if (entry.data === null) {
      mkdirSync(destination, { recursive: true })
      continue
    }
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, entry.data)
    files += 1
  }
  if (!existsSync(join(target, 'package.json'))) throw new Error('更新包缺少 package.json')
  return { files, root: target }
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
    // The bundle is a tarball, so it has to be unpacked before it can be
    // swapped in: the installed directory is a real tree, and the swap below
    // only ever renames. Keep the archive too, so a failed unpack leaves the
    // bytes for a bug report without a second download.
    writeFileSync(join(directory, 'bundle.tgz'), bytes)
    const unpacked = join(directory, 'unpacked')
    mkdirSync(unpacked, { recursive: true })
    try {
      unpackBundle(bytes, unpacked)
    } catch (error) {
      throw new Error(`更新包无法解压：${error instanceof Error ? error.message : String(error)}`)
    }
    return unpacked
  }

  service.installStagedUpdate = async (directory) => {
    const installed = await installStagedBundle({ directory, target: PACKAGE_DIR, root: store.root, log })
    // Read the version the new tree carries, so the page can say what changed.
    // The Host itself keeps running the build it loaded at start: `meta.version`
    // is not touched, because nothing in memory has been replaced.
    const version = readVersion(join(PACKAGE_DIR, 'package.json'))
    return {
      ...installed,
      version,
      previousVersion: meta.version,
      restartMessage: `已替换为 ${version}（当前运行的是 ${meta.version}）：重启一次应用后生效，版本号才会更新。`,
    }
  }

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