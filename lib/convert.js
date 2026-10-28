/**
 * Codex Dream Skin → DeepSeek Harness skin conversion.
 *
 * A Codex theme directory holds `theme.json` (colours, copy, art focus), an
 * optional `theme.css` (Safe CSS written against Codex's own `data-ds-part`
 * hooks), `manifest.json`, and a wallpaper image. Only content that has a
 * stable meaning in this app is carried over; Codex's per-part CSS selectors
 * are read for the handful of DOM-independent hints they contain (radius,
 * surface alpha, blur, font family) and are otherwise kept as metadata.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { derivePalette, isColor, normalizePalette, parseColor } from './palette.js'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']
const MEDIA_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
}

/** Media type for a file name, defaulting to a safe binary type. */
export function mediaTypeFor(file) {
  return MEDIA_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function slug(text) {
  const ascii = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii.length > 0) return ascii
  return createHash('sha1').update(String(text)).digest('hex').slice(0, 10)
}

/** Public skin id for a Codex theme id, keeping collisions predictable. */
export function skinIdFor(codexId) {
  const withoutVendor = String(codexId).replace(/^(studio|usr-[0-9a-f]+)\./i, '')
  return `skin.${slug(withoutVendor)}`
}

function readJson(file) {
  const text = readFileSync(file, 'utf8')
  if (text.length > 512 * 1024) throw new Error('theme.json 超过 512 KB')
  return JSON.parse(text.replace(/^\uFEFF/, ''))
}

/** Locate the theme root inside a directory or an unpacked archive tree. */
export function findThemeRoot(directory) {
  const direct = join(directory, 'theme.json')
  if (existsSync(direct) && statSync(direct).isFile()) return directory
  let entries = []
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('__MACOSX') || entry.name.startsWith('.')) continue
    const nested = join(directory, entry.name, 'theme.json')
    if (existsSync(nested) && statSync(nested).isFile()) return join(directory, entry.name)
  }
  return null
}

/** Read one `selector { ... }` block's declarations. */
function parseBlocks(css) {
  const blocks = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = pattern.exec(css)) !== null) {
    const selector = match[1].trim()
    const declarations = {}
    for (const line of match[2].split(';')) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const name = line.slice(0, colon).trim().toLowerCase()
      const value = line.slice(colon + 1).trim()
      if (name !== '' && value !== '') declarations[name] = value
    }
    blocks.push({ selector, declarations })
  }
  return blocks
}

function partOf(selector) {
  const match = /\[data-ds-part\s*=\s*"([a-z-]+)"\]/i.exec(selector)
  return match ? match[1].toLowerCase() : null
}

function px(value, fallback) {
  const match = /(-?[0-9.]+)\s*px/i.exec(String(value ?? ''))
  if (!match) return fallback
  const number = Number.parseFloat(match[1])
  return Number.isFinite(number) ? number : fallback
}

function blurOf(declarations) {
  const filter = declarations['backdrop-filter'] ?? declarations['-webkit-backdrop-filter']
  return px(/blur\(([^)]+)\)/i.exec(String(filter ?? ''))?.[1], 0)
}

function alphaOf(color) {
  const parsed = parseColor(color)
  if (!parsed) return null
  return parsed.a
}

/**
 * Summarize the DOM-independent hints of a Codex Safe CSS file.
 *
 * Codex's own parts (`sidebar`, `composer`, `dialog`, `main`, `root`) map onto
 * the four surfaces this app has: the window canvas, the sidebar column, the
 * raised content surface, and the overlay layer.
 */
export function cssHints(css) {
  if (typeof css !== 'string' || css.trim() === '') return null
  const hints = { canvas: null, sidebar: null, panel: null, panelAlt: null, radius: null, blur: 0, fontFamily: null, dim: null }
  for (const { selector, declarations } of parseBlocks(css)) {
    const part = partOf(selector)
    if (part === null) continue
    const background = declarations['background-color'] ?? declarations['background']
    const alpha = background ? alphaOf(background) : null
    const radius = px(declarations['border-radius'], null)
    const blur = blurOf(declarations)
    if (blur > 0) hints.blur = Math.max(hints.blur, blur)
    if (part === 'root' || part === 'main' || part === 'home') {
      if (alpha !== null) hints.canvas = hints.canvas === null ? alpha : Math.min(hints.canvas, alpha)
      if (declarations['font-family'] && hints.fontFamily === null) hints.fontFamily = declarations['font-family']
    }
    if (part === 'sidebar' && alpha !== null) hints.sidebar = alpha
    if (part === 'composer' && alpha !== null) hints.panel = alpha
    if (part === 'dialog' && alpha !== null) hints.panelAlt = alpha
    if ((part === 'composer' || part === 'dialog' || part === 'message') && radius !== null) {
      hints.radius = hints.radius === null ? radius : Math.max(hints.radius, radius)
    }
  }
  const dimMatch = /--ds-theme-image-dim\s*:\s*([0-9.]+)/i.exec(css)
  if (dimMatch) {
    const value = Number.parseFloat(dimMatch[1])
    if (Number.isFinite(value)) hints.dim = Math.max(0, Math.min(0.85, value))
  }
  return hints
}

function findWallpaper(root, theme) {
  const declared = typeof theme.image === 'string' ? theme.image : null
  if (declared) {
    const name = basename(declared)
    const candidate = join(root, name)
    if (existsSync(candidate) && statSync(candidate).isFile()) return name
  }
  let entries = []
  try {
    entries = readdirSync(root)
  } catch {
    return null
  }
  const named = entries.find((entry) => /^background\.(jpe?g|png|webp|gif|avif)$/i.test(entry))
  if (named) return named
  return entries.find((entry) => IMAGE_EXTENSIONS.includes(extname(entry).toLowerCase())) ?? null
}

/**
 * Transparency implied by an authored panel alpha.
 *
 * Only an explicitly written alpha counts, so a plain `#101d20` falls back to
 * the default wallpaper visibility (60%) rather than claiming to be opaque.
 */
export function authoredTransparency(panel) {
  if (typeof panel !== 'string') return 60
  const value = panel.trim().toLowerCase()
  const authored =
    /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/.test(value) ||
    /^rgba\(/.test(value) ||
    /^rgb\([^)]*\//.test(value)
  if (!authored) return 60
  const alpha = alphaOf(value)
  if (alpha === null) return 60
  return Math.round((1 - alpha) * 100)
}

/**
 * Convert one Codex theme directory.
 *
 * @param {string} root directory containing `theme.json`
 * @param {{ now?: Date }} [options]
 * @returns {{ skin: object, wallpaper: { name: string, bytes: Buffer, mediaType: string } | null, warnings: string[] }}
 */
export function convertCodexTheme(root, options = {}) {
  const themeFile = join(root, 'theme.json')
  if (!existsSync(themeFile)) throw new Error('目录中没有 theme.json')
  const theme = readJson(themeFile)
  if (!theme || typeof theme !== 'object') throw new Error('theme.json 不是对象')
  const warnings = []

  const codexId = typeof theme.id === 'string' && theme.id.trim() !== '' ? theme.id.trim() : basename(root)
  const name = typeof theme.name === 'string' && theme.name.trim() !== '' ? theme.name.trim() : basename(root)
  const appearance = theme.appearance === 'light' ? 'light' : theme.appearance === 'auto' ? 'auto' : 'dark'

  const rawColors = theme.colors && typeof theme.colors === 'object' ? theme.colors : {}
  const hasExplicitColors = Object.values(rawColors).some((value) => isColor(value))
  let colors
  if (hasExplicitColors) {
    const normalized = normalizePalette(rawColors, {
      appearance: appearance === 'light' ? 'light' : 'dark',
    })
    colors = normalized.colors
    const missing = ['background', 'panel', 'panelAlt', 'accent', 'accentAlt', 'secondary', 'highlight', 'text', 'muted', 'line'].filter(
      (key) => !isColor(rawColors[key]),
    )
    if (missing.length > 0) warnings.push(`原主题缺少配色 ${missing.join(', ')}，已按可读性补全`)
  } else {
    colors = derivePalette({ appearance: appearance === 'light' ? 'light' : 'dark' })
    warnings.push('原主题未声明 colors，已生成中性配色（可在 AI 设计中重新上色）')
  }

  const wallpaperName = findWallpaper(root, theme)
  let wallpaper = null
  if (wallpaperName) {
    const bytes = readFileSync(join(root, wallpaperName))
    if (bytes.byteLength > 48 * 1024 * 1024) throw new Error('壁纸超过 48 MB')
    wallpaper = { name: wallpaperName, bytes, mediaType: mediaTypeFor(wallpaperName) }
  } else {
    warnings.push('主题目录中没有找到壁纸图片，皮肤将只应用配色')
  }

  const cssFile = join(root, 'theme.css')
  const themeCss = existsSync(cssFile) ? readFileSync(cssFile, 'utf8').slice(0, 256 * 1024) : ''
  const hints = cssHints(themeCss)

  const art = theme.art && typeof theme.art === 'object' ? theme.art : {}
  const focusX = Number.isFinite(art.focusX) ? Math.max(0, Math.min(1, art.focusX)) : 0.5
  const focusY = Number.isFinite(art.focusY) ? Math.max(0, Math.min(1, art.focusY)) : 0.5

  const baseAlpha = 1 - authoredTransparency(rawColors.panel) / 100
  const clampAlpha = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback)
  // Only an alpha the theme actually wrote is stored; without one the skin
  // follows the default wallpaper visibility (100%) at render time, so changing
  // that default later applies to every such theme instead of freezing it here.
  const authored = hints !== null && [hints.canvas, hints.sidebar, hints.panel, hints.panelAlt].some((value) => typeof value === 'number')
  const alpha = authored
    ? {
        canvas: clampAlpha(hints.canvas, baseAlpha),
        sidebar: clampAlpha(hints.sidebar, baseAlpha),
        panel: clampAlpha(hints.panel, baseAlpha),
        panelAlt: clampAlpha(hints.panelAlt, baseAlpha),
        authored: true,
      }
    : { canvas: null, sidebar: null, panel: null, panelAlt: null, authored: false }

  const schemaVersion = Number.isInteger(theme.schemaVersion) ? theme.schemaVersion : 1
  const skin = {
    schemaVersion: 1,
    id: skinIdFor(codexId),
    name,
    description: typeof theme.tagline === 'string' && theme.tagline.trim() !== '' ? theme.tagline.trim() : '',
    appearance,
    origin: {
      kind: 'codex-import',
      codexId,
      path: root,
      codexSchemaVersion: schemaVersion,
    },
    wallpaper: wallpaper
      ? {
          file: `wallpaper${extname(wallpaper.name).toLowerCase()}`,
          focusX,
          focusY,
          dim: typeof hints?.dim === 'number' ? hints.dim : 0,
        }
      : null,
    colors,
    typography: { fontFamily: hints?.fontFamily ?? null },
    surface: {
      radius: hints?.radius ?? 16,
      blur: hints?.blur ?? 0,
      alpha,
    },
    codex: {
      brandSubtitle: text(theme.brandSubtitle),
      tagline: text(theme.tagline),
      statusText: text(theme.statusText),
      quote: text(theme.quote),
      projectPrefix: text(theme.projectPrefix),
      projectLabel: text(theme.projectLabel),
      promoTitle: text(theme.promoTitle),
      promoSub: text(theme.promoSub),
      promoUrl: text(theme.promoUrl),
      safeArea: text(art.safeArea),
      taskMode: text(art.taskMode),
      video: typeof theme.video?.file === 'string' ? theme.video.file : theme.videoPlaylist ? 'playlist' : null,
      themeCss: themeCss === '' ? null : themeCss,
    },
    css: '',
    createdAt: (options.now ?? new Date()).toISOString(),
  }
  return { skin, wallpaper, warnings }
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}