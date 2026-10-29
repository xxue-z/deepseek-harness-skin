/**
 * Bundled default themes.
 *
 * The plugin ships two ready-to-use skins so a fresh install is not an empty
 * list: a static one and a dynamic one. They are copied into the skin library
 * once, on first start, and left alone afterwards — deleting one in the UI must
 * stay deleted, so the marker in `state.json` records that the seeding already
 * happened rather than relying on the themes being present.
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isSkinId } from './store.js'

const BUNDLE_DIR = 'bundled-themes'
const MARKER = 'seed'

/** Themes that ship with the plugin, by directory name under {@link BUNDLE_DIR}. */
export function listBundled(root) {
  const directory = join(resolve(root), BUNDLE_DIR)
  if (!existsSync(directory)) return []
  const themes = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const themeDir = join(directory, entry.name)
    let document = null
    try {
      document = JSON.parse(readFileSync(join(themeDir, 'theme.json'), 'utf8').replace(/^\uFEFF/, ''))
    } catch {
      continue
    }
    if (!document || !isSkinId(document.id)) continue
    if (document.video?.file && !existsSync(join(themeDir, String(document.video.file)))) document.video = null
    if (document.wallpaper?.file && !existsSync(join(themeDir, String(document.wallpaper.file)))) document.wallpaper = null
    const size = readdirSync(themeDir).reduce((sum, name) => {
      try {
        return sum + statSync(join(themeDir, name)).size
      } catch {
        return sum
      }
    }, 0)
    themes.push({ id: document.id, name: document.name, document, directory: themeDir, bytes: size })
  }
  return themes.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'))
}

/**
 * Copy the bundled themes into the library.
 *
 * @param {{ root: string }} store the skin store root (its `themes/` receives them)
 * @param {string} packageRoot the installed package directory
 * @returns {{ seeded: string[], skipped: string[], alreadySeeded: boolean }}
 */
export function seedBundledThemes(store, packageRoot) {
  const state = store.readState()
  if (state.seeded) return { seeded: [], skipped: [], alreadySeeded: true }
  const seeded = []
  const skipped = []
  for (const theme of listBundled(packageRoot)) {
    const target = join(store.themesDir, theme.id)
    if (existsSync(target)) {
      // A library imported before this existed keeps the user's copy.
      skipped.push(theme.id)
      continue
    }
    cpSync(theme.directory, target, { recursive: true })
    seeded.push(theme.id)
  }
  store.writeState({ seeded: true })
  return { seeded, skipped, alreadySeeded: false }
}