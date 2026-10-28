/**
 * Durable skin library.
 *
 * Everything lives under one directory (`<DSH_HOME>/skin` by default):
 *
 *   state.json                    active skin id + per-skin transparency
 *   themes/<id>/theme.json        the skin document
 *   themes/<id>/wallpaper.<ext>   its wallpaper
 *
 * Writes are atomic (temp file + rename) so a crash cannot leave a half-written
 * theme, and every id is validated before it is joined into a path.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { mediaTypeFor } from './convert.js'

const ID_PATTERN = /^skin\.[a-z0-9][a-z0-9._-]{0,80}$/
const WALLPAPER_PATTERN = /^wallpaper\.(jpe?g|png|webp|gif|avif)$/i
const VIDEO_PATTERN = /^video\.mp4$/i

/** Defaults for the dynamic-background settings stored in `state.json`. */
export const DEFAULT_VIDEO_SETTINGS = { autoplay: true, muted: true }

/** Whether an id is a well-formed skin id. */
export function isSkinId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id)
}

function readJsonFile(file, fallback) {
  try {
    const text = readFileSync(file, 'utf8')
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

function emptyState() {
  return { schemaVersion: 1, activeId: null, transparency: {}, video: { ...DEFAULT_VIDEO_SETTINGS } }
}

export class SkinStore {
  constructor(root) {
    this.root = resolve(root)
    this.themesDir = join(this.root, 'themes')
    this.stateFile = join(this.root, 'state.json')
  }

  ensure() {
    mkdirSync(this.themesDir, { recursive: true })
  }

  themeDir(id) {
    if (!isSkinId(id)) throw new Error(`非法皮肤 id：${id}`)
    return join(this.themesDir, id)
  }

  readState() {
    const state = readJsonFile(this.stateFile, null)
    if (!state || typeof state !== 'object') return emptyState()
    const transparency = {}
    if (state.transparency && typeof state.transparency === 'object') {
      for (const [id, value] of Object.entries(state.transparency)) {
        if (isSkinId(id) && Number.isFinite(value) && value >= 0 && value <= 100) transparency[id] = Math.round(value)
      }
    }
    const video = state.video && typeof state.video === 'object' ? state.video : {}
    return {
      schemaVersion: 1,
      activeId: isSkinId(state.activeId) ? state.activeId : null,
      transparency,
      video: {
        autoplay: video.autoplay !== false,
        muted: video.muted !== false,
      },
    }
  }

  writeState(patch) {
    const current = this.readState()
    const next = {
      schemaVersion: 1,
      activeId: 'activeId' in patch ? patch.activeId : current.activeId,
      transparency: patch.transparency ? { ...current.transparency, ...patch.transparency } : current.transparency,
      video: patch.video ? { ...current.video, ...patch.video } : current.video,
    }
    if ('removeTransparency' in patch) delete next.transparency[patch.removeTransparency]
    this.ensure()
    writeJsonAtomic(this.stateFile, next)
    return next
  }

  /** Read one skin document, or null when missing or malformed. */
  get(id) {
    if (!isSkinId(id)) return null
    const file = join(this.themeDir(id), 'theme.json')
    const skin = readJsonFile(file, null)
    if (!skin || typeof skin !== 'object' || skin.id !== id) return null
    return skin
  }

  /** Every readable skin, sorted by name. */
  list() {
    if (!existsSync(this.themesDir)) return []
    const skins = []
    for (const entry of readdirSync(this.themesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skin = this.get(entry.name)
      if (skin) skins.push(skin)
    }
    return skins.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'))
  }

  /**
   * Persist a skin document, optionally replacing its wallpaper and video.
   * @param {object} skin
   * @param {{ bytes: Buffer, extension: string } | null} wallpaper
   * @param {{ bytes: Buffer } | null} video
   */
  save(skin, wallpaper = null, video = null) {
    if (!isSkinId(skin.id)) throw new Error(`非法皮肤 id：${skin.id}`)
    const directory = this.themeDir(skin.id)
    mkdirSync(directory, { recursive: true })
    const document = { ...skin }
    if (wallpaper) {
      const extension = normalizeExtension(wallpaper.extension)
      const fileName = `wallpaper${extension}`
      const file = join(directory, fileName)
      const temporary = `${file}.${process.pid}.tmp`
      writeFileSync(temporary, wallpaper.bytes)
      renameSync(temporary, file)
      document.wallpaper = { ...(document.wallpaper ?? {}), file: fileName }
      for (const stale of readdirSync(directory)) {
        if (stale !== fileName && WALLPAPER_PATTERN.test(stale)) rmSync(join(directory, stale), { force: true })
      }
    } else if (document.wallpaper?.file && !existsSync(join(directory, String(document.wallpaper.file)))) {
      document.wallpaper = null
    }
    if (video) {
      const file = join(directory, 'video.mp4')
      const temporary = `${file}.${process.pid}.tmp`
      writeFileSync(temporary, video.bytes)
      renameSync(temporary, file)
      document.video = { ...(document.video ?? {}), file: 'video.mp4', bytes: video.bytes.byteLength }
      for (const stale of readdirSync(directory)) {
        if (stale !== 'video.mp4' && VIDEO_PATTERN.test(stale)) rmSync(join(directory, stale), { force: true })
      }
    } else if (document.video?.file && !existsSync(join(directory, 'video.mp4'))) {
      document.video = null
    } else if (!video && skin.video === null) {
      // The caller explicitly imported a theme without a usable video: drop the
      // previous file instead of leaving an orphan no document points at.
      rmSync(join(directory, 'video.mp4'), { force: true })
      document.video = null
    }
    writeJsonAtomic(join(directory, 'theme.json'), document)
    return document
  }

  remove(id) {
    const state = this.readState()
    if (state.activeId === id) throw new Error('这是当前正在使用的皮肤，请先切换到其他主题')
    const directory = this.themeDir(id)
    if (!existsSync(directory)) throw new Error('皮肤不存在')
    rmSync(directory, { recursive: true, force: true })
    const transparency = { ...state.transparency }
    delete transparency[id]
    writeJsonAtomic(this.stateFile, { schemaVersion: 1, activeId: state.activeId, transparency })
  }

  /** Absolute path of one wallpaper, refusing anything outside the skin directory. */
  wallpaperPath(id) {
    const skin = this.get(id)
    const file = skin?.wallpaper?.file
    if (!file || typeof file !== 'string' || !WALLPAPER_PATTERN.test(file)) return null
    const directory = this.themeDir(id)
    const candidate = resolve(directory, file)
    if (!candidate.startsWith(directory + sep) && candidate !== directory) return null
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return null
    return candidate
  }

  wallpaperType(id) {
    const file = this.get(id)?.wallpaper?.file
    return typeof file === 'string' ? mediaTypeFor(file) : 'application/octet-stream'
  }

  /** Absolute path of one skin's background video, refusing paths outside its directory. */
  videoPath(id) {
    const skin = this.get(id)
    const file = skin?.video?.file
    if (!file || typeof file !== 'string' || !VIDEO_PATTERN.test(file)) return null
    const directory = this.themeDir(id)
    const candidate = resolve(directory, file)
    if (!candidate.startsWith(directory + sep) && candidate !== directory) return null
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return null
    return candidate
  }

  videoType(id) {
    const file = this.get(id)?.video?.file
    return typeof file === 'string' ? mediaTypeFor(file) : 'application/octet-stream'
  }

  /** Remove a leftover temp file (only used by tests and recovery). */
  static cleanup(file) {
    try {
      unlinkSync(file)
    } catch {
      /* nothing to clean */
    }
  }
}

function normalizeExtension(extension) {
  const value = String(extension ?? '').toLowerCase()
  if (value === '.jpg' || value === '.jpeg') return '.jpg'
  if (value === '.png' || value === '.webp' || value === '.gif' || value === '.avif') return value
  return '.jpg'
}

/** Preferred on-disk extension for an uploaded wallpaper's media type. */
export function extensionForMediaType(mediaType) {
  if (mediaType === 'image/png') return '.png'
  if (mediaType === 'image/webp') return '.webp'
  if (mediaType === 'image/gif') return '.gif'
  if (mediaType === 'image/avif') return '.avif'
  if (mediaType === 'image/jpeg') return '.jpg'
  const match = /\.(jpe?g|png|webp|gif|avif)$/i.exec(String(mediaType))
  return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : ''
}

/** File extension including the dot, for a path. */
export function extensionOf(file) {
  return extname(String(file)).toLowerCase()
}