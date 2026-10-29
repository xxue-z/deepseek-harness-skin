/**
 * Folder playlists for the dynamic-background "advanced settings".
 *
 * A playlist is nothing but a folder the user picked: the Host lists the videos
 * it contains in the order Explorer shows them (`第2集` before `第10集`), and the
 * client plays them one after another behind the UI. Only a listing and a
 * single named file are ever handed out — no recursive walks, no reading the
 * bytes of anything the user did not put in that folder.
 */
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

/** Extensions a media element can plausibly decode; anything else is skipped early. */
const VIDEO_PATTERN = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i

/** How long a directory listing is reused, so many Range requests cost one readdir. */
const LIST_TTL_MS = 1000

function isVideoFile(name) {
  return VIDEO_PATTERN.test(name)
}

/**
 * List the playable videos of one folder, in the natural order Explorer uses.
 *
 * Hidden entries (leading dot) and subdirectories are skipped: a playlist is one
 * flat folder, and `第10集` must not sort before `第2集`.
 *
 * @param {string} folder absolute folder path
 * @returns {{ name: string, size: number, mtimeMs: number }[]}
 */
export function listFolderVideos(folder) {
  if (typeof folder !== 'string' || folder.trim() === '' || !isAbsolute(folder)) throw new Error('请先填写视频列表文件夹的绝对路径')
  const directory = resolve(folder)
  if (!existsSync(directory) || !statSync(directory).isDirectory()) throw new Error(`文件夹不存在：${directory}`)
  const entries = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith('.') || !isVideoFile(entry.name)) continue
    let stats = null
    try {
      stats = statSync(resolve(directory, entry.name))
    } catch {
      continue // vanished between readdir and stat
    }
    entries.push({ name: entry.name, size: stats.size, mtimeMs: Math.round(stats.mtimeMs) })
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
}

/**
 * Identity of one video for progress restore.
 *
 * The name alone would keep a stale index when the file was replaced by a
 * different clip of the same name, so size and mtime are part of the key; a
 * changed file simply restarts at second zero.
 */
export function videoSignature(entry) {
  return `${entry.name}\u0000${entry.size}\u0000${entry.mtimeMs}`
}

/**
 * Resolve one playlist file, refusing anything that escapes the folder.
 *
 * `name` comes from the URL, so it is treated as untrusted: no separators, no
 * dot-dot, and the real path (after following symlinks) must still live inside
 * the real folder.
 *
 * @param {string} folder
 * @param {string} name
 * @returns {string | null} absolute path, or null when it is not a regular file in that folder
 */
export function resolveFile(folder, name) {
  if (typeof folder !== 'string' || !isAbsolute(folder)) return null
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..') return null
  if (/[\\/]/.test(name) || name.includes('\u0000')) return null
  const directory = resolve(folder)
  if (!existsSync(directory)) return null
  const candidate = resolve(directory, name)
  if (candidate !== directory + sep + name) return null
  if (!existsSync(candidate)) return null
  let real = null
  let realDirectory = null
  try {
    real = realpathSync(candidate)
    realDirectory = realpathSync(directory)
  } catch {
    return null
  }
  if (real !== realDirectory + sep + name) return null
  try {
    if (!statSync(real).isFile()) return null
  } catch {
    return null
  }
  return real
}

/** Media type for a playlist file, derived from its extension. */
export function videoType(name) {
  const value = String(name).toLowerCase()
  if (value.endsWith('.mp4') || value.endsWith('.m4v')) return 'video/mp4'
  if (value.endsWith('.webm')) return 'video/webm'
  if (value.endsWith('.ogv') || value.endsWith('.ogg')) return 'video/ogg'
  if (value.endsWith('.mov')) return 'video/quicktime'
  return 'application/octet-stream'
}

/**
 * Directory listing cache shared by every request.
 *
 * A playing element issues a Range request per seek, and each of those would
 * otherwise readdir the folder again. One second is short enough that adding a
 * file shows up while the settings sheet is open.
 */
const cache = new Map()

/**
 * @param {string} folder
 * @returns {{ folder: string, entries: { name: string, size: number, mtimeMs: number }[] }}
 */
export function cachedListing(folder) {
  const key = String(folder ?? '')
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < LIST_TTL_MS) return hit.value
  const value = { folder: key, entries: listFolderVideos(key) }
  cache.set(key, { at: now, value })
  return value
}

/** Drop the cached listing of one folder (after a settings change or a refresh). */
export function invalidateListing(folder) {
  if (folder === undefined) cache.clear()
  else cache.delete(String(folder))
}