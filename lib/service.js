/**
 * Skin operations shared by the settings UI (over HTTP) and the agent tool.
 *
 * The service owns the conversions, the library writes, the active-skin state,
 * and the designer call. The HTTP layer and the tool layer only validate
 * their own inputs and format results, so both callers always see the same
 * behaviour and the same failures.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { convertCodexTheme, findThemeRoot, mediaTypeFor, skinIdFor } from './convert.js'
import { generateSkin, skinFromDesign } from './designer.js'
import { analyzeImageColors, derivePalette, relativeLuminance, toHex } from './palette.js'
import { isSkinId } from './store.js'
import { readZip } from './zip.js'

/** Default Codex Dream Skin theme directories for the current platform. */
export function defaultCodexDirs() {
  const list = []
  const home = homedir()
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    list.push(join(local, 'CodexDreamSkin', 'themes'))
  } else if (process.platform === 'darwin') {
    list.push(join(home, 'Library', 'Application Support', 'CodexDreamSkin', 'themes'))
  } else {
    list.push(join(home, '.local', 'share', 'CodexDreamSkin', 'themes'))
  }
  list.push(join(home, '.codex-dream-skin', 'themes'))
  return list
}

/**
 * Which built-in palette a skin's surfaces sit on.
 *
 * Only alias tokens are replaced, so every other surface comes from the light
 * or dark built-in set; the skin's own panel and canvas decide which one keeps
 * the untouched surfaces consistent.
 */
function schemeFor(colors) {
  const panel = relativeLuminance(colors?.panel)
  const canvas = relativeLuminance(colors?.background)
  const surface = Number.isFinite(panel) ? panel * 0.65 + (Number.isFinite(canvas) ? canvas * 0.35 : panel * 0.35) : 0
  return surface > 0.42 ? 'light' : 'dark'
}

function uniqueId(baseId, taken) {
  if (!taken.has(baseId)) return baseId
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseId}-${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `${baseId}-${Date.now().toString(36)}`
}

function safeString(value, max = 200) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

export class SkinService {
  constructor({ store, config, getLlm, getSelection, getDefaultDir, getClientModules }) {
    this.store = store
    this.config = config
    this.getLlm = getLlm
    this.getSelection = getSelection
    this.getDefaultDir = getDefaultDir
    this.getClientModules = getClientModules
    this.clientSeen = null
    this.clientStatus = null
  }

  /** Record that the Web half talked to this Host (diagnostics only). */
  noteClient(status) {
    const seen = new Date().toISOString()
    this.clientSeen = seen
    if (status && typeof status === 'object') {
      this.clientStatus = {
        seen,
        slot: typeof status.slot === 'string' ? status.slot : null,
        activeId: typeof status.activeId === 'string' ? status.activeId : null,
        themeCount: Number.isFinite(status.themeCount) ? status.themeCount : null,
        scheme: typeof status.scheme === 'string' ? status.scheme : null,
        version: typeof status.version === 'string' ? status.version : null,
      }
    }
  }

  /** Whether the Web half is part of the served boot graph. */
  clientDiagnostics() {
    let bundled = null
    let url = null
    try {
      const graph = this.getClientModules?.()?.graph?.()
      const rows = Array.isArray(graph?.entries) ? graph.entries : []
      const row = rows.find((entry) => (typeof entry === 'string' ? entry === '@local/dsh-skin' : entry?.id === '@local/dsh-skin'))
      if (row !== undefined) {
        bundled = true
        url = typeof row === 'object' && row !== null ? row.url ?? null : null
      } else if (rows.length > 0) bundled = false
    } catch {
      bundled = null
    }
    return { bundled, url, lastSeen: this.clientSeen, status: this.clientStatus ?? null }
  }

  /** Where Codex themes are looked for. */
  codexDirs() {
    const configured = Array.isArray(this.config.codexDirs) ? this.config.codexDirs.filter((dir) => typeof dir === 'string' && dir !== '') : []
    return configured.length > 0 ? configured : defaultCodexDirs()
  }

  /** Resolve the model route used by the designer (config override wins). */
  model() {
    const override = this.config.designerModel
    if (override && typeof override.provider === 'string' && typeof override.model === 'string') {
      return { provider: override.provider, model: override.model }
    }
    try {
      const selection = this.getSelection?.()
      if (selection && typeof selection.provider === 'string' && typeof selection.model === 'string') {
        return { provider: selection.provider, model: selection.model }
      }
    } catch {
      /* no default model configured */
    }
    return null
  }

  /** Effective surface alphas for a skin, honouring a user transparency override. */
  resolveAlpha(skin, override) {
    const clamp = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback)
    // Floors mirror the client's policy: the canvas and sidebar carry the
    // wallpaper, while cards, dialogs and floating panels stay readable. The
    // canvas/sidebar floors are only a whisper so 100% really means "wallpaper
    // everywhere"; the theme's own scrim keeps text legs against the art.
    const floor = { canvas: 0.08, sidebar: 0.1, card: 0.86, dialog: 0.95 }
    const shape = (values) => ({
      canvas: Math.max(floor.canvas, values.canvas),
      sidebar: Math.max(floor.sidebar, values.sidebar),
      panel: Math.max(floor.card, values.panel),
      panelAlt: Math.max(floor.dialog, values.panelAlt),
    })
    if (Number.isFinite(override)) {
      const base = (100 - override) / 100
      return { ...shape({ canvas: base, sidebar: base, panel: base, panelAlt: base }), overridden: true }
    }
    // Stored alphas only count when the theme itself authored them; a theme
    // without one follows the default visibility (100%) instead of whatever the
    // default happened to be at import time.
    const alpha = skin.surface?.alpha ?? {}
    const authored = alpha.authored === true
    const base = authored
      ? {
          canvas: clamp(alpha.canvas, 0),
          sidebar: clamp(alpha.sidebar, 0),
          panel: clamp(alpha.panel, 0),
          panelAlt: clamp(alpha.panelAlt, 0),
        }
      : { canvas: 0, sidebar: 0, panel: 0, panelAlt: 0 }
    return { ...shape(base), overridden: false }
  }

  /** One skin plus everything the client needs to render and activate it. */
  present(skin, state) {
    const override = state.transparency[skin.id]
    const alpha = this.resolveAlpha(skin, override)
    const authoredAlpha = skin.surface?.alpha?.authored === true ? skin.surface.alpha.sidebar : null
    const effectiveTransparency = Number.isFinite(override)
      ? Math.round(override)
      : Number.isFinite(authoredAlpha)
        ? Math.round((1 - authoredAlpha) * 100)
        : 100
    const scheme = schemeFor(skin.colors)
    return {
      id: skin.id,
      name: skin.name,
      description: skin.description ?? '',
      appearance: skin.appearance === 'light' || skin.appearance === 'auto' ? skin.appearance : 'dark',
      scheme,
      colors: skin.colors,
      typography: skin.typography ?? { fontFamily: null },
      surface: { radius: skin.surface?.radius ?? 16, blur: skin.surface?.blur ?? 0, alpha },
      wallpaper: skin.wallpaper
        ? {
            url: `/skin/assets/${encodeURIComponent(skin.id)}/wallpaper?v=${encodeURIComponent(skin.createdAt ?? '')}`,
            focusX: skin.wallpaper.focusX ?? 0.5,
            focusY: skin.wallpaper.focusY ?? 0.5,
            dim: skin.wallpaper.dim ?? 0.25,
          }
        : null,
      origin: skin.origin ?? { kind: 'manual' },
      codex: skin.codex
        ? {
            brandSubtitle: skin.codex.brandSubtitle ?? null,
            tagline: skin.codex.tagline ?? null,
            statusText: skin.codex.statusText ?? null,
            quote: skin.codex.quote ?? null,
            promoUrl: skin.codex.promoUrl ?? null,
            video: skin.codex.video ?? null,
            hasSafeCss: typeof skin.codex.themeCss === 'string',
          }
        : null,
      css: skin.css ?? '',
      createdAt: skin.createdAt ?? null,
      transparency: effectiveTransparency,
      transparencyOverridden: Number.isFinite(override),
    }
  }

  snapshot() {
    const state = this.store.readState()
    const themes = this.store.list().map((skin) => this.present(skin, state))
    return {
      version: 1,
      activeId: state.activeId,
      themes,
      sources: this.codexDirs().map((dir) => {
        let count = 0
        try {
          count = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && findThemeRoot(join(dir, entry.name)) !== null).length
        } catch {
          count = 0
        }
        return { path: dir, exists: existsSync(dir), count }
      }),
      dataDir: this.store.root,
      model: this.model(),
      client: this.clientDiagnostics(),
      tool: this.getToolState?.() ?? null,
      limits: { maxThemes: 200 },
    }
  }

  /** Import every theme found under the configured Codex directories. */
  scanCodexDirs() {
    const results = []
    for (const dir of this.codexDirs()) {
      if (!existsSync(dir)) {
        results.push({ source: dir, status: 'missing', imported: [], skipped: [], warnings: [] })
        continue
      }
      let entries = []
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch (error) {
        results.push({ source: dir, status: 'error', imported: [], skipped: [], warnings: [String(error)] })
        continue
      }
      const imported = []
      const skipped = []
      const warnings = []
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const root = findThemeRoot(join(dir, entry.name))
        if (root === null) continue
        const outcome = this.importDirectory(root, { replaceSameSource: true })
        if (outcome.status === 'imported') imported.push(outcome.id)
        else skipped.push(outcome.id ?? entry.name)
        warnings.push(...outcome.warnings)
      }
      results.push({ source: dir, status: 'ok', imported, skipped, warnings })
    }
    return results
  }

  /** Convert and store one theme directory. */
  importDirectory(root, { replaceSameSource = false } = {}) {
    const { skin, wallpaper, warnings } = convertCodexTheme(root)
    const existing = this.store.get(skin.id)
    const taken = new Set(this.store.list().map((entry) => entry.id))
    if (existing) {
      const sameSource = existing.origin?.codexId === skin.origin.codexId
      if (replaceSameSource && sameSource) {
        const saved = this.store.save(
          { ...skin, id: existing.id, createdAt: existing.createdAt },
          wallpaper ? { bytes: wallpaper.bytes, extension: extname(wallpaper.name) } : null,
        )
        return { status: 'imported', id: saved.id, name: saved.name, updated: true, warnings }
      }
      if (sameSource) return { status: 'skipped', id: existing.id, name: existing.name, warnings: [...warnings, '已导入过'] }
      skin.id = uniqueId(skin.id, taken)
    }
    const saved = this.store.save(skin, wallpaper ? { bytes: wallpaper.bytes, extension: extname(wallpaper.name) } : null)
    return { status: 'imported', id: saved.id, name: saved.name, updated: false, warnings }
  }

  /** Import a filesystem path: a theme directory or a `.zip` theme pack. */
  importPath(rawPath) {
    const path = safeString(rawPath, 4096).trim()
    if (path === '') throw new Error('请提供主题文件夹或 ZIP 的路径')
    const absolute = resolve(path)
    if (!existsSync(absolute)) throw new Error(`路径不存在：${absolute}`)
    const stats = statSync(absolute)
    if (stats.isDirectory()) return this.importDirectory(findThemeRoot(absolute) ?? absolute)
    if (extname(absolute).toLowerCase() === '.zip') return this.importZip(readFileSync(absolute), absolute)
    throw new Error('请选择主题文件夹或 .zip 主题包')
  }

  /** Import a ZIP archive from memory (folder scan, drag-drop, or HTTP upload). */
  importZip(buffer, label = 'theme.zip') {
    const files = readZip(buffer)
    const directory = mkdtempSync(join(tmpdir(), 'dsh-skin-'))
    try {
      for (const [name, contents] of files) {
        const target = resolve(directory, name)
        if (!target.startsWith(directory)) continue
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, contents)
      }
      const root = findThemeRoot(directory)
      if (root === null) throw new Error(`ZIP 里没有 theme.json：${label}`)
      return this.importDirectory(root)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }

  /** Activate a skin; the client applies it when it receives the new snapshot. */
  apply(id) {
    if (!isSkinId(id)) throw new Error('非法皮肤 id')
    if (this.store.get(id) === null) throw new Error('皮肤不存在')
    this.store.writeState({ activeId: id })
    return this.snapshot()
  }

  deactivate() {
    this.store.writeState({ activeId: null })
    return this.snapshot()
  }

  setTransparency(id, value) {
    if (!isSkinId(id)) throw new Error('非法皮肤 id')
    if (this.store.get(id) === null) throw new Error('皮肤不存在')
    if (value === null) return { state: this.store.writeState({ removeTransparency: id }), snapshot: this.snapshot() }
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('透明度必须是 0-100')
    const state = this.store.writeState({ transparency: { [id]: Math.round(number) } })
    return { state, snapshot: this.snapshot() }
  }

  remove(id) {
    this.store.remove(id)
    return this.snapshot()
  }

  /** Export one skin as a portable JSON document. */
  exportTheme(id) {
    const skin = this.store.get(id)
    if (skin === null) throw new Error('皮肤不存在')
    return skin
  }

  /** Re-derive colours from the stored wallpaper (used for presets without colors). */
  recolor(id, palette) {
    const skin = this.store.get(id)
    if (skin === null) throw new Error('皮肤不存在')
    const analyzed = analyzeImageColors(palette)
    if (analyzed === null) throw new Error('没有可用的取色结果')
    const colors = derivePalette({ ...analyzed, appearance: analyzed.appearance })
    const next = { ...skin, colors }
    this.store.save(next)
    return this.snapshot()
  }

  /**
   * Design (or restyle) a skin from a description and optional image.
   *
   * @param {{ description?: string, palette?: string[], imageDataUrl?: string, baseId?: string|null, save?: boolean }} input
   */
  async design({ description = '', palette = [], imageDataUrl = null, baseId = null, modelProvider = null, modelModel = null, save = true }) {
    const base = baseId ? this.store.get(baseId) : null
    // Per-request override wins over the saved designerModel config.
    const selection =
      modelProvider && modelModel ? { provider: modelProvider, model: modelModel } : this.model()
    const proposal = await generateSkin({
      llm: this.getLlm(),
      selection,
      description,
      palette: Array.isArray(palette) ? palette : [],
      base,
    })
    const design = proposal.design
    const taken = new Set(this.store.list().map((entry) => entry.id))
    const id = uniqueId(skinIdFor(`gen-${slugName(design.name)}`), taken)
    const wallpaper = imageDataUrl ? decodeDataUrl(imageDataUrl) : null
    const skin = skinFromDesign(design, {
      id,
      origin: 'generated',
      wallpaper: wallpaper ? { file: `wallpaper${wallpaper.extension}` } : null,
      css: '',
    })
    if (base?.wallpaper && wallpaper === null) skin.wallpaper = { ...base.wallpaper }
    if (save) this.store.save(skin, wallpaper ? { bytes: wallpaper.bytes, extension: wallpaper.extension } : null)
    return {
      skin: this.present(skin, this.store.readState()),
      usedModel: proposal.usedModel,
      warning: proposal.warning,
      design,
    }
  }
}

function slugName(name) {
  const ascii = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii !== '') return ascii.slice(0, 40)
  let hash = 0
  for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) % 0xffffff
  return `t${hash.toString(36)}`
}

/** Decode a `data:` URL into bytes plus the matching wallpaper extension. */
export function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  const mediaType = match[1].toLowerCase()
  if (!mediaType.startsWith('image/')) return null
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > 48 * 1024 * 1024) return null
  const extensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
  }
  const extension = extensions[mediaType] ?? '.jpg'
  return { bytes, extension, mediaType: mediaTypeFor(`x${extension}`) }
}