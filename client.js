/**
 * @local/dsh-skin — Web client half.
 *
 * Two jobs:
 *   1. apply the selected wallpaper skin to the running app (alias tokens +
 *      a plugin-owned stylesheet for the wallpaper layer), and
 *   2. render the skin manager inside Settings → Theme Skins.
 *
 * The Host half owns the library; this half talks to it over `/skin/api`.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-skin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PLUGIN_ID = '@local/dsh-skin'
    const API_ROOT = '/skin/api'

    /* ------------------------------------------------------------------ */
    /* locale                                                              */
    /* ------------------------------------------------------------------ */

    const STRINGS = {
      zh: {
        'section.title': '主题皮肤',
        'section.desc': '把 Codex Dream Skin 主题包转换成应用皮肤，或按描述生成。',
        'action.refresh': '刷新',
        'action.scan': '扫描本机主题',
        'action.importZip': '导入 ZIP',
        'action.importPath': '从文件夹导入',
        'action.design': 'AI 设计',
        'action.apply': '应用',
        'action.applied': '使用中',
        'action.deactivate': '关闭皮肤',
        'action.delete': '删除',
        'action.export': '导出 JSON',
        'action.cancel': '取消',
        'action.default': '恢复默认',
        'action.close': '关闭',
        'action.generate': '生成主题',
        'action.recolor': '按壁纸重新取色',
        'action.confirmDelete': '删除皮肤',
        'state.loading': '正在读取皮肤库…',
        'state.empty': '还没有皮肤。扫描本机的 Codex 主题，或导入一个主题包。',
        'state.emptyHint': '主题包可以是一个包含 theme.json 的文件夹，或 Codex 的分发 ZIP。',
        'label.sources': 'Codex 主题目录',
        'label.transparency': '壁纸可见度',
        'label.transparencyHint': '数值越大，壁纸在画布和侧栏越明显；卡片与设置面板始终保持可读。',
        'label.palette': '配色',
        'label.source': '来源',
        'label.created': '导入时间',
        'label.safeCss': 'Safe CSS',
        'label.tagline': '标语',
        'label.quote': '文案',
        'label.wallpaper': '壁纸焦点',
        'label.model': '设计模型',
        'origin.codex-import': 'Codex 导入',
        'origin.generated': 'AI 生成',
        'origin.manual': '本地',
        'appearance.dark': '深色',
        'appearance.light': '浅色',
        'appearance.auto': '自适应',
        'design.title': 'AI 主题设计',
        'design.desc': '描述你想要的风格；可以附一张图作为壁纸与配色来源。',
        'design.placeholder': '例如：赛博霓虹，暗紫底色，一点电光青，适合深夜写代码',
        'design.image': '选择图片（可选）',
        'design.imageHint': '图片会作为新皮肤的壁纸，并从中取样配色',
        'design.base': '以当前主题为基底微调',
        'design.working': '正在设计…',
        'design.done': '已生成',
        'design.fallback': '模型不可用，已用离线配色生成',
        'design.empty': '请先写一句描述，或选一张图片。',
        'import.title': '从文件夹导入',
        'import.desc': '输入 Codex 主题文件夹（含 theme.json），或 .zip 主题包的完整路径。',
        'import.placeholder': 'C:\\Users\\you\\AppData\\Local\\CodexDreamSkin\\themes\\studio.crimson-mecha-nova',
        'import.working': '正在导入…',
        'delete.title': '删除这个皮肤？',
        'delete.desc': '皮肤文件会从本机皮肤库移除，无法撤销。',
        'notice.scan': '扫描完成',
        'notice.imported': '已导入',
        'notice.deleted': '已删除',
        'notice.applied': '已应用',
        'notice.deactivated': '已关闭皮肤',
        'notice.saved': '已保存',
        'notice.importedCount': '导入 {n} 个',
        'notice.skippedCount': '跳过 {n} 个',
        'notice.noThemes': '没有找到新的主题',
        'error.generic': '操作失败',
        'meta.panel': '面板',
        'meta.canvas': '画布',
        'meta.active': '当前',
      },
      en: {
        'section.title': 'Theme Skins',
        'section.desc': 'Convert Codex Dream Skin packs into app skins, or generate one from a description.',
        'action.refresh': 'Refresh',
        'action.scan': 'Scan this machine',
        'action.importZip': 'Import ZIP',
        'action.importPath': 'Import folder',
        'action.design': 'AI design',
        'action.apply': 'Apply',
        'action.applied': 'In use',
        'action.deactivate': 'Turn off',
        'action.delete': 'Delete',
        'action.export': 'Export JSON',
        'action.cancel': 'Cancel',
        'action.default': 'Use default',
        'action.close': 'Close',
        'action.generate': 'Generate',
        'action.recolor': 'Recolour from wallpaper',
        'action.confirmDelete': 'Delete skin',
        'state.loading': 'Reading the skin library…',
        'state.empty': 'No skins yet. Scan the local Codex themes, or import a pack.',
        'state.emptyHint': 'A pack is a folder containing theme.json, or a Codex distribution ZIP.',
        'label.sources': 'Codex theme folders',
        'label.transparency': 'Wallpaper visibility',
        'label.transparencyHint': 'Higher values show more wallpaper in the canvas and sidebar; cards and dialogs stay readable.',
        'label.palette': 'Palette',
        'label.source': 'Source',
        'label.created': 'Imported',
        'label.safeCss': 'Safe CSS',
        'label.tagline': 'Tagline',
        'label.quote': 'Quote',
        'label.wallpaper': 'Wallpaper focus',
        'label.model': 'Design model',
        'origin.codex-import': 'Codex import',
        'origin.generated': 'AI generated',
        'origin.manual': 'Local',
        'appearance.dark': 'Dark',
        'appearance.light': 'Light',
        'appearance.auto': 'Adaptive',
        'design.title': 'AI theme design',
        'design.desc': 'Describe the look you want; add an image to use as wallpaper and palette source.',
        'design.placeholder': 'e.g. cyber neon, dark violet base, a touch of electric cyan, for late-night coding',
        'design.image': 'Choose an image (optional)',
        'design.imageHint': 'The image becomes the wallpaper and the palette source',
        'design.base': 'Restyle the selected skin',
        'design.working': 'Designing…',
        'design.done': 'Created',
        'design.fallback': 'No model available — used the offline palette',
        'design.empty': 'Write a description or pick an image first.',
        'import.title': 'Import from a folder',
        'import.desc': 'Enter the full path of a Codex theme folder (with theme.json) or a .zip pack.',
        'import.placeholder': 'C:\\Users\\you\\AppData\\Local\\CodexDreamSkin\\themes\\studio.crimson-mecha-nova',
        'import.working': 'Importing…',
        'delete.title': 'Delete this skin?',
        'delete.desc': 'Its files are removed from the local library. This cannot be undone.',
        'notice.scan': 'Scan finished',
        'notice.imported': 'Imported',
        'notice.deleted': 'Deleted',
        'notice.applied': 'Applied',
        'notice.deactivated': 'Skin turned off',
        'notice.saved': 'Saved',
        'notice.importedCount': '{n} imported',
        'notice.skippedCount': '{n} skipped',
        'notice.noThemes': 'No new themes found',
        'error.generic': 'Something failed',
        'meta.panel': 'Panel',
        'meta.canvas': 'Canvas',
        'meta.active': 'Active',
      },
    }

    function currentLanguage(ctx) {
      try {
        const active = ctx.get('locale')?.getLocale()?.active ?? ''
        return String(active).toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        return 'zh'
      }
    }

    function translate(ctx, key, params) {
      const table = STRINGS[currentLanguage(ctx)] ?? STRINGS.zh
      let value = table[key] ?? STRINGS.en[key] ?? key
      if (params) for (const [name, replacement] of Object.entries(params)) value = value.replace(`{${name}}`, String(replacement))
      return value
    }

    function useLocale(ctx) {
      const [language, setLanguage] = useState(() => currentLanguage(ctx))
      useEffect(() => {
        const locale = ctx.get('locale')
        if (!locale?.subscribe) return undefined
        return locale.subscribe(() => setLanguage(currentLanguage(ctx)))
      }, [ctx])
      const t = useCallback((key, params) => (STRINGS[language] ?? STRINGS.zh)[key]?.replace(/\{(\w+)\}/g, (match, name) => (params && name in params ? String(params[name]) : match)) ?? STRINGS.en[key] ?? key, [language])
      return { t, language }
    }

    /* ------------------------------------------------------------------ */
    /* colour helpers (client side, no imports)                            */
    /* ------------------------------------------------------------------ */

    function parseColor(input) {
      if (typeof input !== 'string') return null
      const value = input.trim().toLowerCase()
      if (value.startsWith('#') && (value.length === 7 || value.length === 9 || value.length === 4)) {
        const hex = value.length === 4 ? value.slice(1).split('').map((c) => c + c).join('') : value.slice(1)
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
        }
      }
      const match = /^rgba?\(([^)]+)\)$/.exec(value)
      if (!match) return null
      const parts = match[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean).map(Number.parseFloat)
      if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
    }

    function withAlpha(color, alpha) {
      const parsed = parseColor(color)
      if (!parsed) return color
      return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${Math.round(alpha * 1000) / 1000})`
    }

    /**
     * Per-surface opacity policy.
     *
     * Codex gives every surface its own alpha: the canvas and the sidebar reveal
     * the wallpaper, while cards, dialogs and floating panels stay nearly solid.
     * Collapsing all of them into one number (the early version) turned the
     * settings sheet into a window onto the conversation underneath, so each
     * role keeps a floor here. `transparency` still means "how much wallpaper
     * shows through the chrome".
     */
    const ALPHA_FLOORS = { canvas: 0, sidebar: 0.02, card: 0.86, dialog: 0.95, composer: 0.9 }

    function withFloors(alpha) {
      const value = alpha ?? {}
      const pick = (name, fallback) => {
        const raw = value[name]
        return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : fallback
      }
      return {
        // The canvas is always clear: the wallpaper layer is the backdrop and
        // a coloured canvas fill is what tinted every photo.
        canvas: 0,
        sidebar: Math.max(ALPHA_FLOORS.sidebar, pick('sidebar', 0)),
        panel: Math.max(ALPHA_FLOORS.card, pick('panel', 0)),
        panelAlt: Math.max(ALPHA_FLOORS.dialog, pick('panelAlt', 0)),
      }
    }

    function alphaSet(skin, transparency) {
      // Transparency is "how much wallpaper shows", so a higher number means a
      // lower alpha. The canvas stays fully transparent at every setting so it
      // never tints the artwork; the slider instead drives a neutral grey veil
      // in the wallpaper layer (see wallpaperCss) plus the sidebar fill.
      const base = 1 - Math.max(0, Math.min(100, transparency)) / 100
      return withFloors({ canvas: 0, sidebar: base, panel: base, panelAlt: base })
    }

    /* ------------------------------------------------------------------ */
    /* how a skin becomes tokens and CSS                                   */
    /* ------------------------------------------------------------------ */

    function tokensFor(skin) {
      const colors = skin.colors
      const alpha = withFloors(skin.surface?.alpha)
      return {
        '--dsw-alias-bg-base': withAlpha(colors.background, alpha.canvas),
        '--dsw-specific-sidebar-fill': withAlpha(colors.panel, alpha.sidebar),
        '--dsw-alias-bg-layer-1': withAlpha(colors.panel, alpha.panel),
        '--dsw-alias-bg-layer-2': withAlpha(colors.panelAlt, alpha.panelAlt),
        '--dsw-alias-bg-overlay': withAlpha(colors.panelAlt, alpha.panelAlt),
        // The composer card and the user-question card read this non-catalogue
        // token; a card has to stay readable over the wallpaper.
        '--dsw-specific-input-major': withAlpha(colors.panelAlt, Math.max(ALPHA_FLOORS.composer, alpha.panel)),
        '--dsw-alias-border-l1': colors.line,
        '--dsw-alias-border-l2': colors.line,
        '--dsw-alias-label-primary': colors.text,
        '--dsw-alias-label-secondary': colors.muted,
        '--dsw-alias-brand-primary': colors.accent,
        '--dsw-alias-state-error-primary': colors.accent,
        '--dsw-alias-state-warn-primary': colors.accentAlt,
        '--dsw-alias-state-success-primary': colors.secondary,
        '--dsw-alias-state-idle-primary': colors.muted,
      }
    }

    /** The alpha-bearing subset, used as the live transparency override layer. */
    function alphaTokens(skin, transparency) {
      const alpha = Number.isFinite(transparency) ? alphaSet(skin, transparency) : withFloors(skin.surface?.alpha)
      const colors = skin.colors
      const value = (color, a) => ({ light: withAlpha(color, a), dark: withAlpha(color, a) })
      return {
        '--dsw-alias-bg-base': value(colors.background, alpha.canvas),
        '--dsw-specific-sidebar-fill': value(colors.panel, alpha.sidebar),
        '--dsw-alias-bg-layer-1': value(colors.panel, alpha.panel),
        '--dsw-alias-bg-layer-2': value(colors.panelAlt, alpha.panelAlt),
        '--dsw-alias-bg-overlay': value(colors.panelAlt, alpha.panelAlt),
        '--dsw-specific-input-major': value(colors.panelAlt, Math.max(ALPHA_FLOORS.composer, alpha.panel)),
      }
    }

    /**
     * Which base palette the skin sits on.
     *
     * Only the alias tokens are replaced, so every other surface (menus, code
     * blocks, inline code, tool cards, hover fills) comes from the built-in
     * light or dark palette. The skin's own surfaces therefore decide: pick the
     * scheme whose built-ins match them, or a light wallpaper skin ends up with
     * black inputs. `appearance` is advisory here — an `auto` theme carries no
     * scheme at all, and a mislabelled one must still render correctly.
     */
    function colorSchemeFor(skin) {
      const panel = relativeLuminance(skin.colors?.panel)
      const canvas = relativeLuminance(skin.colors?.background)
      const surface = Number.isFinite(panel) ? panel * 0.65 + (Number.isFinite(canvas) ? canvas * 0.35 : panel * 0.35) : 0
      return surface > 0.42 ? 'light' : 'dark'
    }

    function relativeLuminance(color) {
      const parsed = parseColor(color)
      if (!parsed) return Number.NaN
      const channel = (value) => {
        const unit = value / 255
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b)
    }

    const GENERIC_FONTS = /^(ui-|system-ui|sans-serif|serif|monospace|inherit|-apple-system|blinkmacsystemfont|helvetica|arial|"helvetica neue"|"segoe ui"|"pingfang sc"|"microsoft yahei")/i

    function wallpaperCss(skin, transparency) {
      const rules = []
      if (skin.wallpaper?.url) {
        // The veil is neutral and light, never the theme's background colour and
// never black: a tinted veil washed photos out, and a black one turned
// bright wallpapers muddy. Strength is the complement of the visibility
// slider; a theme's own --ds-theme-image-dim can strengthen it further.
        const visibility = Number.isFinite(transparency) ? Math.max(0, Math.min(100, transparency)) : skin.transparency ?? 60
        const veil = (100 - visibility) / 100
        const declared = /--ds-theme-image-dim\s*:/i.test(skin.codex?.themeCss ?? skin.css ?? '')
        const extra = declared ? Math.max(0, Math.min(0.85, Number(skin.wallpaper.dim) || 0)) : 0
        const dim = Math.min(1, veil + extra)
        const alpha = Math.round(dim * 1000) / 1000
        const scrim = dim > 0 ? `linear-gradient(rgba(255, 255, 255, ${alpha}), rgba(255, 255, 255, ${alpha})), ` : ''
        const x = Math.round((skin.wallpaper.focusX ?? 0.5) * 100)
        const y = Math.round((skin.wallpaper.focusY ?? 0.5) * 100)
        rules.push(
          `body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;` +
            `background-image:${scrim}url("${skin.wallpaper.url}");background-size:cover;background-position:${x}% ${y}%;background-repeat:no-repeat;}`,
        )
        rules.push('#root{position:relative;z-index:1;}')
      }
      // Dialogs float above other UI; blurring their backdrop is what turns a
// translucent fill into a glass card instead of a window onto the page.
      rules.push('[role="dialog"],[role="alertdialog"]{backdrop-filter:blur(18px) saturate(1.12);-webkit-backdrop-filter:blur(18px) saturate(1.12);}')
      const fontFamily = skin.typography?.fontFamily
      if (typeof fontFamily === 'string' && fontFamily.trim() !== '' && !GENERIC_FONTS.test(fontFamily.trim())) {
        rules.push(`body{font-family:${fontFamily};}`)
      }
      if (skin.css && typeof skin.css === 'string') rules.push(skin.css)
      return rules.join('\n')
    }

    /* ------------------------------------------------------------------ */
    /* HTTP client                                                         */
    /* ------------------------------------------------------------------ */

    async function request(path, options) {
      const response = await fetch(`${API_ROOT}/${path}`, {
        headers: { 'content-type': 'application/json' },
        ...options,
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new Error(`接口返回异常（HTTP ${response.status}）`)
      }
      if (!payload || payload.ok !== true) throw new Error(payload?.error ?? `接口返回异常（HTTP ${response.status}）`)
      return payload
    }

    const api = {
      snapshot: () => request('snapshot'),
      ping: () => request('ping', { method: 'POST', body: '{}' }),
      pingStatus: (status) => request('ping', { method: 'POST', body: JSON.stringify(status) }),
      scan: () => request('scan', { method: 'POST', body: '{}' }),
      importPath: (path) => request('import-path', { method: 'POST', body: JSON.stringify({ path }) }),
      importZip: (name, data) => request('import-zip', { method: 'POST', body: JSON.stringify({ name, data }) }),
      apply: (id) => request('apply', { method: 'POST', body: JSON.stringify({ id }) }),
      deactivate: () => request('deactivate', { method: 'POST', body: '{}' }),
      transparency: (id, value) => request('transparency', { method: 'POST', body: JSON.stringify({ id, value }) }),
      delete: (id) => request('delete', { method: 'POST', body: JSON.stringify({ id }) }),
      recolor: (id, palette) => request('recolor', { method: 'POST', body: JSON.stringify({ id, palette }) }),
      design: (input) => request('design', { method: 'POST', body: JSON.stringify(input) }),
      exportTheme: (id) => request('export', { method: 'POST', body: JSON.stringify({ id }) }),
    }

    /* ------------------------------------------------------------------ */
    /* runtime: register themes, apply the active one, own the stylesheet  */
    /* ------------------------------------------------------------------ */

    function createRuntime(ctx) {
      const subscribers = new Set()
      const registered = new Map()
      let snapshot = null
      let ready = false
      let readyAt = 0
      let mutating = false
      let overrideDisposer = null
      let styleElement = null
      let appliedId = null
      let lastBuiltIn = 'system'
      let loadError = null

      const theme = () => ctx.get('theme')

      function emit() {
        for (const subscriber of subscribers) {
          try {
            subscriber(snapshot)
          } catch {
            /* a broken subscriber must not break the runtime */
          }
        }
      }

      function ensureStyleElement() {
        if (styleElement && styleElement.isConnected) return styleElement
        const existing = document.querySelector(`style[data-plugin=${JSON.stringify(PLUGIN_ID)}][data-plugin-css="skin"]`)
        if (existing) {
          styleElement = existing
          return styleElement
        }
        const element = document.createElement('style')
        element.setAttribute('data-plugin', PLUGIN_ID)
        element.setAttribute('data-plugin-css', 'skin')
        document.head.append(element)
        styleElement = element
        return element
      }

      function writeWallpaper(skin, transparency) {
        const element = ensureStyleElement()
        element.textContent = skin ? wallpaperCss(skin, transparency) : ''
      }

      function register(skin) {
        const service = theme()
        if (!service?.register) return
        try {
          const tokens = tokensFor(skin)
          const colorScheme = colorSchemeFor(skin)
          const disposer = service.register({ id: skin.id, colorScheme, tokens })
          registered.set(skin.id, { disposer, tokens, colorScheme })
        } catch (error) {
          console.error(`[dsh-skin] 注册主题失败 ${skin.id}`, error)
        }
      }

      function removeRegistration(id) {
        const entry = registered.get(id)
        if (!entry) return
        registered.delete(id)
        try {
          entry.disposer()
        } catch {
          /* already gone */
        }
      }

      function syncRegistrations(themes) {
        const wanted = new Map(themes.map((skin) => [skin.id, skin]))
        for (const id of [...registered.keys()]) if (!wanted.has(id)) removeRegistration(id)
        for (const [id, skin] of wanted) {
          const existing = registered.get(id)
          const tokens = tokensFor(skin)
          const scheme = colorSchemeFor(skin)
          if (existing && JSON.stringify(existing.tokens) === JSON.stringify(tokens) && existing.colorScheme === scheme) continue
          if (existing) removeRegistration(id)
          register(skin)
        }
      }

      function clearApplied({ restoreTheme = false } = {}) {
        if (overrideDisposer) {
          try {
            overrideDisposer()
          } catch {
            /* already removed */
          }
          overrideDisposer = null
        }
        writeWallpaper(null)
        appliedId = null
        const service = theme()
        if (restoreTheme && service?.setTheme) {
          mutating = true
          try {
            service.setTheme(lastBuiltIn)
          } catch (error) {
            console.error('[dsh-skin] 恢复内置主题失败', error)
          } finally {
            setTimeout(() => {
              mutating = false
            }, 0)
          }
        }
      }

      function applySkin(skin) {
        if (!skin) {
          clearApplied()
          return
        }
        const service = theme()
        mutating = true
        try {
          const current = service?.getTheme?.()
          if (current && ['light', 'dark', 'system'].includes(current.preference)) lastBuiltIn = current.preference
          if (service?.setTheme) {
            if (!registered.has(skin.id)) register(skin)
            service.setTheme(skin.id)
          }
          writeWallpaper(skin, skin.transparency)
          const resolved = skin.surface?.alpha
          if (service?.overrideTokens && resolved) {
            if (overrideDisposer) overrideDisposer()
            overrideDisposer = service.overrideTokens(PLUGIN_ID, alphaTokens(skin, skin.transparencyOverridden ? skin.transparency : NaN))
          }
          appliedId = skin.id
        } catch (error) {
          console.error(`[dsh-skin] 应用皮肤失败 ${skin.id}`, error)
        } finally {
          setTimeout(() => {
            mutating = false
          }, 0)
        }
      }

      function applySnapshot(next, options = {}) {
        const previousActive = snapshot?.activeId ?? null
        snapshot = next
        if (!next) {
          emit()
          return
        }
        mutating = true
        try {
          syncRegistrations(next.themes)
        } finally {
          setTimeout(() => {
            mutating = false
          }, 0)
        }
        const active = next.themes.find((skin) => skin.id === next.activeId) ?? null
        if (active) applySkin(active)
        else if (options.keepApplied !== true) clearApplied({ restoreTheme: previousActive !== null })
        emit()
      }

      /** Live preview while dragging the transparency slider. */
      function previewTransparency(id, value) {
        if (!snapshot) return
        const skins = snapshot.themes.map((skin) =>
          skin.id === id
            ? { ...skin, transparency: value, transparencyOverridden: true, surface: { ...skin.surface, alpha: alphaSet(skin, value) } }
            : skin,
        )
        snapshot = { ...snapshot, themes: skins }
        const active = skins.find((skin) => skin.id === snapshot.activeId)
        if (active && appliedId === id) {
          const service = theme()
          writeWallpaper(active, value)
          if (service?.overrideTokens) {
            if (overrideDisposer) overrideDisposer()
            overrideDisposer = service.overrideTokens(PLUGIN_ID, alphaTokens(active, value))
          }
        }
        emit()
      }

      function replaceSkin(skin) {
        if (!snapshot) return
        const themes = snapshot.themes.map((entry) => (entry.id === skin.id ? skin : entry))
        applySnapshot({ ...snapshot, themes })
      }

      async function load() {
        try {
          const payload = await api.snapshot()
          loadError = null
          ready = true
          readyAt = Date.now()
          applySnapshot(payload.snapshot)
          return payload.snapshot
        } catch (error) {
          loadError = error instanceof Error ? error.message : String(error)
          ready = false
          emit()
          throw error
        }
      }

      async function refresh() {
        return load()
      }

      function subscribe(listener) {
        subscribers.add(listener)
        return () => subscribers.delete(listener)
      }

      function start() {
        let cancelled = false
        let attempt = 0
        const tick = async () => {
          if (cancelled) return
          attempt += 1
          try {
            const loaded = await load()
            const themed = loaded?.themes?.length ?? 0
            const activeSkin = loaded?.themes?.find((entry) => entry.id === loaded?.activeId)
            api
              .pingStatus({
                slot: 'settings.section',
                activeId: loaded?.activeId ?? null,
                themeCount: themed,
                version: '1.0.1',
                scheme: activeSkin ? colorSchemeFor(activeSkin) : null,
              })
              .catch(() => {})
          } catch {
            if (attempt < 6 && !cancelled) setTimeout(tick, 400 * attempt)
          }
        }
        void tick()
        return () => {
          cancelled = true
          clearApplied()
          for (const id of [...registered.keys()]) removeRegistration(id)
          if (styleElement) styleElement.remove()
          styleElement = null
        }
      }

      // Re-apply the skin whenever an outsider writes a built-in preference
      // over the active skin id. Agent-preset switches, model changes that
      // reload the session, profile reloads, and the Settings -> Appearance
      // picker all funnel through setTheme(light|dark|system). We want the
      // skin to stay unless the user chooses "Close" from the skin manager,
      // so we repair instead of deactivating. To let a genuine built-in
      // choice through, click "Close" first.
      let repairTimer = null
      function watchThemeChanges() {
        return ctx.on('theme/change', (next) => {
          if (mutating || !ready || !snapshot?.activeId) return
          if (Date.now() - readyAt < 4000) return
          if (next?.preference === snapshot.activeId) return
          if (['light', 'dark', 'system'].includes(next?.preference)) {
            const activeSkin = snapshot.themes?.find((entry) => entry.id === snapshot.activeId)
            if (!activeSkin) return
            if (repairTimer !== null) return
            repairTimer = setTimeout(() => {
              repairTimer = null
              applySkin(activeSkin)
            }, 120)
          }
        })
      }

      return {
        ctx,
        start,
        load,
        refresh,
        subscribe,
        getSnapshot: () => snapshot,
        getError: () => loadError,
        isReady: () => ready,
        applySnapshot,
        previewTransparency,
        replaceSkin,
        watchThemeChanges,
        deactivateLocal() {
          if (!snapshot) return
          snapshot = { ...snapshot, activeId: null }
          clearApplied()
          emit()
        },
      }
    }

    /* ------------------------------------------------------------------ */
    /* icons                                                               */
    /* ------------------------------------------------------------------ */

    const ICONS = {
      refresh: 'M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
      scan: 'M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4M3 12h18',
      upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
      sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z',
      trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 .7 12a1 1 0 0 0 1 .9h6.6a1 1 0 0 0 1-.9L18 7',
      close: 'M6 6l12 12M18 6L6 18',
      check: 'M4 12.5 9.5 18 20 6.5',
      download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
      folder: 'M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
      palette: 'M12 3a9 9 0 1 0 0 18c1.4 0 2-0.9 2-1.8 0-0.8-0.6-1.4-0.6-2.2 0-0.9 0.7-1.5 1.7-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 10.5h.01M10 7.5h.01M14 7.5h.01M16.5 10.5h.01',
      image: 'M4 5h16v14H4zM4 15l4.5-4.5 3.5 3.5 3-3L20 15M15 9.5h.01',
    }

    function Icon({ name, size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: ICONS[name] }),
      )
    }

    /* ------------------------------------------------------------------ */
    /* dialogs + small controls                                            */
    /* ------------------------------------------------------------------ */

    function Dialog({ t, title, description, children, footer, onClose, width }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
      }, [onClose])
      return h(
        'div',
        {
          className: 'dsks-modal',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          { className: 'dsks-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: width ? { width } : undefined },
          h(
            'div',
            { className: 'dsks-dialog-head' },
            h('h2', { className: 'dsks-dialog-title' }, title),
            h('button', { type: 'button', className: 'dsks-icon-button', onClick: onClose, 'aria-label': t('action.close') }, h(Icon, { name: 'close' })),
          ),
          description ? h('p', { className: 'dsks-dialog-desc' }, description) : null,
          h('div', { className: 'dsks-dialog-body' }, children),
          footer ? h('div', { className: 'dsks-dialog-foot' }, footer) : null,
        ),
      )
    }

    function Button({ variant = 'secondary', busy = false, children, icon, ...rest }) {
      return h(
        'button',
        { type: 'button', className: `dsks-button dsks-button-${variant}`, 'data-busy': busy ? '' : undefined, ...rest },
        icon ? h(Icon, { name: icon }) : null,
        h('span', null, children),
        busy ? h('span', { className: 'dsks-spinner', 'aria-hidden': 'true' }) : null,
      )
    }

    function Notice({ notice, onDismiss }) {
      useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(onDismiss, 5000)
        return () => clearTimeout(timer)
      }, [notice, onDismiss])
      if (!notice) return null
      return h(
        'div',
        { className: `dsks-notice dsks-notice-${notice.kind}`, role: 'status' },
        h(Icon, { name: notice.kind === 'error' ? 'close' : 'check', size: 14 }),
        h('span', null, notice.text),
      )
    }

    /* ------------------------------------------------------------------ */
    /* the settings page                                                   */
    /* ------------------------------------------------------------------ */

    function SkinPage({ runtime }) {
      const { t } = useLocale(runtime.ctx)
      const [snapshot, setSnapshot] = useState(() => runtime.getSnapshot())
      const [error, setError] = useState(() => runtime.getError())
      const [selectedId, setSelectedId] = useState(null)
      const [busy, setBusy] = useState(null)
      const [notice, setNotice] = useState(null)
      const [dialog, setDialog] = useState(null)
      const [draftTransparency, setDraftTransparency] = useState(null)
      const [hover, setHover] = useState(null)
      const hoverTimer = useRef(null)
      const fileInput = useRef(null)
      const commitTimer = useRef(null)

      // Hover is debounced on leave so moving the pointer from a card into the
      // floating card does not dismiss it mid-travel.
      const onHover = (id, element) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        setHover({ id, anchor: element })
      }
      const onHoverEnd = (id) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => {
          setHover((current) => (current?.id === id ? null : current))
        }, 160)
      }
      useEffect(
        () => () => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current)
        },
        [],
      )

      useEffect(() => {
        const unsubscribe = runtime.subscribe((next) => {
          setSnapshot(next)
          setError(runtime.getError())
        })
        return unsubscribe
      }, [runtime])

      const themes = snapshot?.themes ?? []
      const activeId = snapshot?.activeId ?? null
      const selected = useMemo(() => themes.find((skin) => skin.id === selectedId) ?? null, [themes, selectedId])

      useEffect(() => {
        if (selectedId !== null && !themes.some((skin) => skin.id === selectedId)) setSelectedId(null)
      }, [themes, selectedId])

      const run = useCallback(
        async (key, action, success) => {
          setBusy(key)
          setError(null)
          try {
            const payload = await action()
            if (payload?.snapshot) runtime.applySnapshot(payload.snapshot)
            if (success) setNotice({ kind: 'success', text: typeof success === 'function' ? success(payload) : success })
            return payload
          } catch (failure) {
            const message = failure instanceof Error ? failure.message : String(failure)
            setError(message)
            setNotice({ kind: 'error', text: message })
            return null
          } finally {
            setBusy(null)
          }
        },
        [runtime],
      )

      const onRefresh = () => run('refresh', async () => runtime.refresh())

      const onScan = () =>
        run(
          'scan',
          () => api.scan(),
          (payload) => {
            const imported = payload.results.reduce((sum, result) => sum + result.imported.length, 0)
            const skipped = payload.results.reduce((sum, result) => sum + result.skipped.length, 0)
            if (imported === 0 && skipped === 0) return `${t('notice.scan')}：${t('notice.noThemes')}`
            const parts = []
            if (imported > 0) parts.push(t('notice.importedCount', { n: imported }))
            if (skipped > 0) parts.push(t('notice.skippedCount', { n: skipped }))
            return `${t('notice.scan')}：${parts.join('，')}`
          },
        )

      const onApply = (id) =>
        run('apply', () => api.apply(id), t('notice.applied'))

      const onDeactivate = () => run('deactivate', () => api.deactivate(), t('notice.deactivated'))

      const onDelete = (id) =>
        run('delete', () => api.delete(id), t('notice.deleted')).then(() => {
          setDialog(null)
          setSelectedId(null)
        })

      const onExport = async (id) => {
        const payload = await run('export', () => api.exportTheme(id))
        if (!payload) return
        const blob = new Blob([JSON.stringify(payload.theme, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${id}.json`
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }

      const onTransparencyInput = (skin, value) => {
        setDraftTransparency({ id: skin.id, value })
        runtime.previewTransparency(skin.id, value)
        if (commitTimer.current) clearTimeout(commitTimer.current)
        commitTimer.current = setTimeout(() => {
          api
            .transparency(skin.id, value)
            .then((payload) => payload.snapshot && runtime.applySnapshot(payload.snapshot))
            .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
            .finally(() => setDraftTransparency(null))
        }, 320)
      }

      const onZipChosen = async (file) => {
        if (!file) return
        setBusy('zip')
        try {
          const buffer = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          const chunk = 0x8000
          for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
          const payload = await api.importZip(file.name, btoa(binary))
          if (payload.snapshot) runtime.applySnapshot(payload.snapshot)
          setNotice({ kind: 'success', text: `${t('notice.imported')}：${payload.result.id}` })
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : String(failure)
          setError(message)
          setNotice({ kind: 'error', text: message })
        } finally {
          setBusy(null)
          if (fileInput.current) fileInput.current.value = ''
        }
      }

      const onResetTransparency = (skin) =>
        run('reset', () => api.transparency(skin.id, null), t('notice.saved'))

      const onRecolor = (skin) => {
        const palette = dominantColorsFromUrl(skin.wallpaper?.url)
        run('recolor', async () => api.recolor(skin.id, await palette), t('notice.saved'))
      }

      if (!snapshot) {
        return h(
          'div',
          { className: 'dsks-root' },
          h('div', { className: 'dsks-loading' }, h('span', { className: 'dsks-spinner' }), t('state.loading')),
          error ? h('p', { className: 'dsks-error' }, error) : null,
          error ? h('div', null, h(Button, { icon: 'refresh', onClick: () => runtime.refresh().catch(() => {}) }, t('action.refresh'))) : null,
        )
      }

      return h(
        'div',
        { className: 'dsks-root' },
        h(
          'header',
          { className: 'dsks-header' },
          h(
            'div',
            { className: 'dsks-header-text' },
            h('h2', { className: 'dsks-title' }, t('section.title')),
            h('p', { className: 'dsks-subtitle' }, t('section.desc')),
          ),
          h(
            'div',
            { className: 'dsks-actions' },
            h(Button, { icon: 'refresh', onClick: onRefresh, busy: busy === 'refresh' }, t('action.refresh')),
            h(Button, { icon: 'scan', onClick: onScan, busy: busy === 'scan' }, t('action.scan')),
            h(Button, { icon: 'upload', onClick: () => fileInput.current?.click(), busy: busy === 'zip' }, t('action.importZip')),
            h(Button, { icon: 'folder', onClick: () => setDialog('import') }, t('action.importPath')),
            h(Button, { variant: 'primary', icon: 'sparkle', onClick: () => setDialog('design') }, t('action.design')),
          ),
        ),
        h('input', {
          ref: fileInput,
          type: 'file',
          accept: '.zip,application/zip',
          style: { display: 'none' },
          onChange: (event) => onZipChosen(event.target.files?.[0]),
        }),
        h(Notice, { notice, onDismiss: () => setNotice(null) }),
        error && !notice ? h('p', { className: 'dsks-error' }, error) : null,
        snapshot.sources.length > 0
          ? h(
              'div',
              { className: 'dsks-sources' },
              h('span', { className: 'dsks-sources-label' }, `${t('label.sources')}：`),
              ...snapshot.sources.map((source) =>
                h(
                  'code',
                  { key: source.path, className: 'dsks-source', title: source.path, 'data-missing': source.exists ? undefined : '' },
                  `${shortenPath(source.path)}${source.exists ? ` (${source.count})` : ' —'}`,
                ),
              ),
              snapshot.model
                ? h('span', { className: 'dsks-model' }, `${t('label.model')}：${snapshot.model.provider}/${snapshot.model.model}`)
                : null,
            )
          : null,
        selected
          ? h(SkinDetail, {
              skin: selected,
              active: selected.id === activeId,
              t,
              busy,
              draftTransparency: draftTransparency?.id === selected.id ? draftTransparency.value : null,
              onApply: () => onApply(selected.id),
              onDeactivate,
              onDelete: () => setDialog('delete'),
              onExport: () => onExport(selected.id),
              onRecolor: () => onRecolor(selected),
              onTransparency: (value) => onTransparencyInput(selected, value),
              onReset: () => onResetTransparency(selected),
              onClose: () => setSelectedId(null),
            })
          : null,
        themes.length === 0
          ? h(
              'div',
              { className: 'dsks-empty' },
              h(Icon, { name: 'palette', size: 28 }),
              h('p', { className: 'dsks-empty-title' }, t('state.empty')),
              h('p', { className: 'dsks-empty-hint' }, t('state.emptyHint')),
            )
          : h(
              'div',
              { className: 'dsks-grid' },
              ...themes.map((skin) =>
                h(SkinCard, {
                  key: skin.id,
                  skin,
                  active: skin.id === activeId,
                  selected: skin.id === selectedId,
                  t,
                  onSelect: () => setSelectedId(skin.id),
                  onApply: () => onApply(skin.id),
                  onHover,
                  onHoverEnd,
                }),
              ),
            ),
        dialog === 'delete' && selected
          ? h(Dialog, {
              t,
              title: t('delete.title'),
              description: t('delete.desc'),
              onClose: () => setDialog(null),
              footer: [
                h(Button, { key: 'cancel', onClick: () => setDialog(null) }, t('action.cancel')),
                h(Button, { key: 'delete', variant: 'danger', busy: busy === 'delete', onClick: () => onDelete(selected.id) }, t('action.delete')),
              ],
            })
          : null,
        dialog === 'import' ? h(ImportDialog, { t, busy: busy === 'import', onClose: () => setDialog(null), onSubmit: (path) => run('import', () => api.importPath(path), (payload) => `${t('notice.imported')}：${payload.result.id}`).then(() => setDialog(null)) }) : null,
        dialog === 'design'
          ? h(DesignDialog, {
              t,
              runtime,
              base: selected,
              onClose: () => setDialog(null),
              onDone: (skin, warning) => {
                setSelectedId(skin.id)
                setDialog(null)
                setNotice({ kind: warning ? 'warning' : 'success', text: warning ? `${t('design.done')}：${warning}` : `${t('design.done')}：${skin.name}` })
              },
            })
          : null,
        hover
          ? h(HoverPreview, {
              skin: themes.find((skin) => skin.id === hover.id) ?? null,
              anchor: hover.anchor,
              onEnter: (id) => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current)
                setHover((current) => (current?.id === id ? current : { ...current, id }))
              },
              onLeave: onHoverEnd,
              detailProps: (() => {
                const skin = themes.find((entry) => entry.id === hover.id)
                if (!skin) return null
                return {
                  skin,
                  active: skin.id === activeId,
                  t,
                  busy,
                  draftTransparency: draftTransparency?.id === skin.id ? draftTransparency.value : null,
                  onApply: () => onApply(skin.id),
                  onDeactivate,
                  onDelete: () => setDialog('delete'),
                  onExport: () => onExport(skin.id),
                  onRecolor: () => onRecolor(skin),
                  onTransparency: (value) => onTransparencyInput(skin, value),
                  onReset: () => onResetTransparency(skin),
                  onClose: () => setHover(null),
                  compact: true,
                }
              })(),
            })
          : null,
      )
    }

    function shortensPath(path, max = 46) {
      const value = String(path)
      return value.length > max ? `…${value.slice(-max + 1)}` : value
    }
    const shortenPath = shortensPath

    function SkinCard({ skin, active, selected, t, onSelect, onApply, onHover, onHoverEnd }) {
      return h(
        'div',
        {
          className: 'dsks-card',
          'data-active': active ? '' : undefined,
          'data-selected': selected ? '' : undefined,
          onMouseEnter: (event) => onHover(skin.id, event.currentTarget),
          onMouseLeave: () => onHoverEnd(skin.id),
          onFocus: (event) => onHover(skin.id, event.currentTarget),
          onBlur: () => onHoverEnd(skin.id),
        },
        h(
          'button',
          { type: 'button', className: 'dsks-card-main', onClick: onSelect, 'aria-label': skin.name },
          h('span', { className: 'dsks-thumb', 'data-empty': skin.wallpaper ? undefined : '' }, skin.wallpaper ? h('img', { src: skin.wallpaper.url, alt: '', loading: 'lazy' }) : h(Icon, { name: 'image', size: 22 })),
          h(
            'span',
            { className: 'dsks-card-text' },
            h('span', { className: 'dsks-card-name' }, skin.name),
            h(
              'span',
              { className: 'dsks-card-meta' },
              t(`appearance.${skin.appearance}`) ?? skin.appearance,
              ' · ',
              t(`origin.${skin.origin?.kind ?? 'manual'}`) ?? skin.origin?.kind,
            ),
            h('span', { className: 'dsks-swatches' }, ...[skin.colors.accent, skin.colors.accentAlt, skin.colors.secondary, skin.colors.panel, skin.colors.background].map((color, index) => h('span', { key: index, className: 'dsks-swatch', style: { background: color } }))),
          ),
        ),
        h(
          'div',
          { className: 'dsks-card-foot' },
          active
            ? h('span', { className: 'dsks-pill' }, h(Icon, { name: 'check', size: 12 }), t('action.applied'))
            : h('button', { type: 'button', className: 'dsks-link', onClick: onApply }, t('action.apply')),
        ),
      )
    }

    /**
     * Floating detail card anchored beside the hovered skin.
     *
     * Rendered through a fixed-position element measured from the hovered
     * card, so it escapes the settings scroller and never pushes the grid
     * around. Placement flips to the left of the card when the right side
     * would overflow, and clamps vertically into the viewport.
     */
    function HoverPreview({ skin, anchor, detailProps, onEnter, onLeave }) {
      const [rect, setRect] = useState(null)
      useEffect(() => {
        if (!anchor) return undefined
        const measure = () => {
          const box = anchor.getBoundingClientRect()
          const width = 320
          const height = 260
          const gap = 10
          const roomRight = window.innerWidth - box.right
          const left = roomRight >= width + gap ? box.right + gap : box.left - width - gap
          const top = Math.max(8, Math.min(box.top, window.innerHeight - height - 8))
          setRect({ left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), top, width })
        }
        measure()
        window.addEventListener('resize', measure)
        window.addEventListener('scroll', measure, true)
        return () => {
          window.removeEventListener('resize', measure)
          window.removeEventListener('scroll', measure, true)
        }
      }, [anchor])
      if (!skin || !rect) return null
      return h(
        'div',
        {
          className: 'dsks-hover',
          style: { left: rect.left, top: rect.top, width: rect.width },
          onMouseEnter: () => onEnter(skin.id),
          onMouseLeave: () => onLeave(skin.id),
          role: 'presentation',
        },
        h(
          'div',
          { className: 'dsks-hover-head' },
          h('strong', { className: 'dsks-hover-title' }, skin.name),
          detailProps.active ? h('span', { className: 'dsks-pill' }, h(Icon, { name: 'check', size: 12 }), detailProps.t('action.applied')) : null,
        ),
        h(SkinDetail, { ...detailProps, compact: true }),
      )
    }

    function SkinDetail({ skin, active, t, busy, draftTransparency, onApply, onDeactivate, onDelete, onExport, onRecolor, onTransparency, onReset, onClose, compact = false }) {
      const transparency = draftTransparency ?? skin.transparency
      const codex = skin.codex
      const head = compact
        ? null
        : h(
            'div',
            { className: 'dsks-detail-head' },
            h('h3', { className: 'dsks-detail-title' }, skin.name),
            h('button', { type: 'button', className: 'dsks-icon-button', onClick: onClose, 'aria-label': t('action.close') }, h(Icon, { name: 'close' })),
          )
      return h(
        'section',
        { className: 'dsks-detail', 'data-compact': compact ? '' : undefined },
        head,
        h(
          'div',
          { className: 'dsks-detail-body' },
          h(
            'div',
            { className: 'dsks-preview', style: skin.wallpaper ? { backgroundImage: `url("${skin.wallpaper.url}")`, backgroundPosition: `${(skin.wallpaper.focusX ?? 0.5) * 100}% ${(skin.wallpaper.focusY ?? 0.5) * 100}%` } : { background: skin.colors.background } },
            h('span', { className: 'dsks-preview-scrim', style: { background: withAlpha(skin.colors.background, skin.wallpaper?.dim ?? 0.25) } }),
            h('span', { className: 'dsks-preview-panel', style: { background: withAlpha(skin.colors.panel, skin.surface?.alpha?.panel ?? 0.7), color: skin.colors.text, borderColor: skin.colors.line } }, skin.name),
          ),
          h(
            'div',
            { className: 'dsks-detail-facts' },
            skin.description ? h('p', { className: 'dsks-detail-desc' }, skin.description) : null,
            codex?.tagline ? h('p', { className: 'dsks-detail-desc' }, `${t('label.tagline')}：${codex.tagline}`) : null,
            codex?.quote ? h('p', { className: 'dsks-detail-desc dsks-mono' }, codex.quote) : null,
            h(
              'dl',
              { className: 'dsks-facts' },
              h('dt', null, t('label.source')),
              h('dd', null, skin.origin?.codexId ? `Codex · ${skin.origin.codexId}` : t(`origin.${skin.origin?.kind ?? 'manual'}`)),
              h('dt', null, t('label.created')),
              h('dd', null, formatTime(skin.createdAt)),
              h('dt', null, t('label.wallpaper')),
              h('dd', null, skin.wallpaper ? `${Math.round((skin.wallpaper.focusX ?? 0.5) * 100)}% / ${Math.round((skin.wallpaper.focusY ?? 0.5) * 100)}% · ${Math.round((skin.wallpaper.dim ?? 0) * 100)}% 暗化` : '—'),
              codex?.hasSafeCss ? h('dt', null, t('label.safeCss')) : null,
              codex?.hasSafeCss ? h('dd', null, '已解析（未逐条套用）') : null,
              h('dt', null, t('label.palette')),
              h(
                'dd',
                null,
                h(
                  'span',
                  { className: 'dsks-palette' },
                  ...['background', 'panel', 'panelAlt', 'accent', 'accentAlt', 'secondary', 'highlight', 'text', 'muted'].map((key) =>
                    h('span', { key, className: 'dsks-palette-chip', title: `${key}: ${skin.colors[key]}` }, h('span', { className: 'dsks-palette-dot', style: { background: skin.colors[key] } }), key),
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsks-transparency' },
          h(
            'div',
            { className: 'dsks-transparency-head' },
            h('label', { className: 'dsks-transparency-label', htmlFor: `dsks-t-${skin.id}` }, `${t('label.transparency')} · ${Math.round(transparency)}%`),
            skin.transparencyOverridden && onReset
              ? h('button', { type: 'button', className: 'dsks-link', onClick: onReset }, t('action.default'))
              : null,
          ),
          h('input', {
            id: `dsks-t-${skin.id}`,
            type: 'range',
            min: 0,
            max: 100,
            step: 1,
            value: Math.round(transparency),
            onChange: (event) => onTransparency(Number(event.target.value)),
            className: 'dsks-range',
          }),
          h('p', { className: 'dsks-hint' }, t('label.transparencyHint')),
        ),
        h(
          'div',
          { className: 'dsks-detail-actions' },
          active ? h(Button, { variant: 'secondary', onClick: onDeactivate }, t('action.deactivate')) : h(Button, { variant: 'primary', busy: busy === 'apply', onClick: onApply }, t('action.apply')),
          skin.origin?.kind === 'codex-import' && skin.wallpaper ? h(Button, { onClick: onRecolor, busy: busy === 'recolor' }, t('action.recolor')) : null,
          h(Button, { icon: 'download', onClick: onExport, busy: busy === 'export' }, t('action.export')),
          // The skin in use cannot be deleted: the service refuses it anyway, so the
// button would only ever produce an error. "Close" first, then delete.
          active ? null : h(Button, { variant: 'danger', icon: 'trash', onClick: onDelete }, t('action.delete')),
        ),
      )
    }

    function formatTime(value) {
      if (!value) return '—'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return '—'
      const pad = (number) => String(number).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function ImportDialog({ t, busy, onClose, onSubmit }) {
      const [path, setPath] = useState('')
      return h(
        Dialog,
        {
          t,
          title: t('import.title'),
          description: t('import.desc'),
          onClose,
          footer: [
            h(Button, { key: 'cancel', onClick: onClose }, t('action.cancel')),
            h(Button, { key: 'go', variant: 'primary', busy, disabled: path.trim() === '', onClick: () => onSubmit(path.trim()) }, t('action.apply')),
          ],
        },
        h('input', {
          className: 'dsks-input',
          value: path,
          autoFocus: true,
          placeholder: t('import.placeholder'),
          onChange: (event) => setPath(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && path.trim() !== '') onSubmit(path.trim())
          },
        }),
      )
    }

    function DesignDialog({ t, runtime, base, onClose, onDone }) {
      const snapshot = runtime.getSnapshot()
      const defaultModel = snapshot?.model ?? { provider: '', model: '' }
      const [description, setDescription] = useState('')
      const [image, setImage] = useState(null)
      const [palette, setPalette] = useState([])
      const [useBase, setUseBase] = useState(Boolean(base))
      const [modelProvider, setModelProvider] = useState('')
      const [modelModel, setModelModel] = useState('')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const [result, setResult] = useState(null)
      const fileInput = useRef(null)

      const onImage = async (file) => {
        if (!file) return
        try {
          const prepared = await prepareImage(file)
          setImage(prepared.dataUrl)
          setPalette(prepared.palette)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const generate = async () => {
        if (description.trim() === '' && image === null) {
          setError(t('design.empty'))
          return
        }
        setBusy(true)
        setError(null)
        try {
          const payload = await api.design({
            description: description.trim(),
            palette,
            imageDataUrl: image,
            baseId: useBase && base ? base.id : null,
            modelProvider: modelProvider.trim() || undefined,
            modelModel: modelModel.trim() || undefined,
          })
          if (payload.snapshot) runtime.applySnapshot(payload.snapshot)
          setResult({ skin: payload.skin, warning: payload.warning, usedModel: payload.usedModel })
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      return h(
        Dialog,
        {
          t,
          title: t('design.title'),
          description: t('design.desc'),
          onClose,
          width: 'min(560px, 100%)',
          footer: result
            ? [
                h(Button, { key: 'close', onClick: () => onDone(result.skin, result.warning) }, t('action.close')),
                h(Button, { key: 'again', variant: 'primary', onClick: generate, busy }, t('action.generate')),
              ]
            : [h(Button, { key: 'cancel', onClick: onClose }, t('action.cancel')), h(Button, { key: 'go', variant: 'primary', icon: 'sparkle', busy, onClick: generate }, busy ? t('design.working') : t('action.generate'))],
        },
        result
          ? h(
              'div',
              { className: 'dsks-design-result' },
              h('div', { className: 'dsks-design-preview', style: { background: result.skin.colors.background } },
                h('span', { className: 'dsks-design-panel', style: { background: withAlpha(result.skin.colors.panel, 0.85), color: result.skin.colors.text, borderColor: result.skin.colors.line } },
                  h('strong', null, result.skin.name),
                  h('span', null, result.skin.description),
                ),
              ),
              h('p', { className: 'dsks-design-note' }, result.usedModel ? `模型生成 · ${result.skin.appearance}` : t('design.fallback')),
              result.warning ? h('p', { className: 'dsks-hint' }, result.warning) : null,
              h('div', { className: 'dsks-swatches dsks-swatches-lg' }, ...['background', 'panel', 'panelAlt', 'accent', 'accentAlt', 'secondary', 'highlight', 'text'].map((key) => h('span', { key, className: 'dsks-swatch', style: { background: result.skin.colors[key] }, title: `${key}: ${result.skin.colors[key]}` }))),
              h('p', { className: 'dsks-hint' }, `id: ${result.skin.id}`),
            )
          : h(
              'div',
              { className: 'dsks-form' },
              h('textarea', {
                className: 'dsks-textarea',
                rows: 3,
                value: description,
                autoFocus: true,
                placeholder: t('design.placeholder'),
                onChange: (event) => setDescription(event.target.value),
              }),
              h(
                'div',
                { className: 'dsks-drop' },
                image
                  ? h('img', { className: 'dsks-drop-image', src: image, alt: '' })
                  : h('div', { className: 'dsks-drop-empty' }, h(Icon, { name: 'image', size: 22 }), h('span', null, t('design.imageHint'))),
                h(
                  'div',
                  { className: 'dsks-drop-actions' },
                  h(Button, { onClick: () => fileInput.current?.click() }, t('design.image')),
                  image ? h(Button, { onClick: () => { setImage(null); setPalette([]) } }, t('action.cancel')) : null,
                ),
                h('input', { ref: fileInput, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (event) => onImage(event.target.files?.[0]) }),
              ),
              palette.length > 0
                ? h('div', { className: 'dsks-swatches dsks-swatches-lg' }, ...palette.map((color, index) => h('span', { key: index, className: 'dsks-swatch', style: { background: color }, title: color })))
                : null,
              base
                ? h(
                    'label',
                    { className: 'dsks-checkbox' },
                    h('input', { type: 'checkbox', checked: useBase, onChange: (event) => setUseBase(event.target.checked) }),
                    h('span', null, `${t('design.base')}：${base.name}`),
                  )
                : null,
              h(
                'label',
                { className: 'dsks-checkbox' },
                h('span', null, `${t('label.model')}：${defaultModel.provider}/${defaultModel.model}`),
              ),
              h('input', {
                className: 'dsks-input',
                value: modelProvider,
                placeholder: defaultModel.provider,
                onChange: (event) => setModelProvider(event.target.value),
              }),
              h('input', {
                className: 'dsks-input',
                value: modelModel,
                placeholder: defaultModel.model,
                onChange: (event) => setModelModel(event.target.value),
              }),
              error ? h('p', { className: 'dsks-error' }, error) : null,
            ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* image helpers                                                       */
    /* ------------------------------------------------------------------ */

    function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('图片无法解码'))
        image.src = src
      })
    }

    function drawToCanvas(image, maxWidth) {
      const scale = Math.min(1, maxWidth / image.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return canvas
    }

    function dominantColors(canvas, count = 6) {
      const context = canvas.getContext('2d')
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
      const buckets = new Map()
      for (let index = 0; index < data.length; index += 16) {
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]
        const a = data[index + 3]
        if (a < 200) continue
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const saturation = max === 0 ? 0 : (max - min) / max
        const key = `${r >> 4}-${g >> 4}-${b >> 4}`
        const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 }
        entry.r += r * (1 + saturation * 2)
        entry.g += g * (1 + saturation * 2)
        entry.b += b * (1 + saturation * 2)
        entry.weight += 1 + saturation * 2
        buckets.set(key, entry)
      }
      return [...buckets.values()]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, count)
        .map((entry) => `#${[entry.r, entry.g, entry.b].map((value) => Math.round(value / entry.weight).toString(16).padStart(2, '0')).join('')}`)
    }

    async function prepareImage(file) {
      const dataUrl = await readAsDataUrl(file)
      const image = await loadImage(dataUrl)
      const canvas = drawToCanvas(image, 2560)
      const preview = drawToCanvas(image, 72)
      return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), palette: dominantColors(preview) }
    }

    async function dominantColorsFromUrl(url) {
      if (!url) return []
      const image = await loadImage(url)
      return dominantColors(drawToCanvas(image, 72))
    }

    /* ------------------------------------------------------------------ */
    /* styles                                                              */
    /* ------------------------------------------------------------------ */

    const STYLES = `
.dsks-root{display:flex;flex-direction:column;gap:16px;padding:4px 0 24px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dsks-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dsks-header-text{min-width:0}
.dsks-title{margin:0;font-size:16px;line-height:24px;font-weight:600}
.dsks-subtitle{margin:2px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dsks-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsks-button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;transition:background-color .12s ease-out,border-color .12s ease-out}
.dsks-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsks-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsks-button:disabled{opacity:.5;cursor:default}
.dsks-button-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-specific-button-primary-label,#fff)}
.dsks-button-primary:hover:not(:disabled){filter:brightness(1.06);background:var(--dsw-alias-brand-primary)}
.dsks-button-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent)}
.dsks-button-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)}
.dsks-icon-button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsks-icon-button:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.dsks-icon-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsks-spinner{width:12px;height:12px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:dsks-spin .7s linear infinite;display:inline-block}
@keyframes dsks-spin{to{transform:rotate(360deg)}}
.dsks-notice{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;font-size:13px}
.dsks-notice-success{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.dsks-notice-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.dsks-notice-warning{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary)}
.dsks-sources{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsks-source{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,monospace);font-size:11px;padding:2px 6px;border-radius:6px;background:var(--dsw-alias-markdown-code-block,var(--dsw-alias-bg-layer-2))}
.dsks-source[data-missing]{opacity:.55;text-decoration:line-through}
.dsks-model{margin-left:auto}
.dsks-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:12px}
.dsks-card{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;transition:border-color .12s ease-out,box-shadow .12s ease-out}
.dsks-card:hover{border-color:var(--dsw-alias-border-l3)}
.dsks-card[data-selected]{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}
.dsks-card[data-active]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-border-l2))}
.dsks-card-main{display:block;padding:0;border:none;background:transparent;text-align:left;cursor:pointer;font:inherit;color:inherit}
.dsks-card-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsks-thumb{display:block;position:relative;aspect-ratio:16/10;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dsks-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.dsks-thumb[data-empty]{display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
.dsks-card-text{display:flex;flex-direction:column;gap:3px;padding:8px 10px 4px}
.dsks-card-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsks-card-meta{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsks-swatches{display:flex;gap:3px;margin-top:2px}
.dsks-swatch{width:12px;height:12px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);display:inline-block}
.dsks-swatches-lg .dsks-swatch{width:20px;height:20px;border-radius:6px}
.dsks-card-foot{display:flex;align-items:center;justify-content:flex-end;padding:4px 10px 10px}
.dsks-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary);font-size:11px}
.dsks-link{border:none;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:12px;cursor:pointer;padding:2px 4px;border-radius:6px}
.dsks-link:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsks-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:36px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-secondary);text-align:center}
.dsks-empty-title{margin:0;font-size:13px}
.dsks-empty-hint{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsks-loading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);padding:12px 0}
.dsks-error{color:var(--dsw-alias-state-error-primary);font-size:13px;margin:0}
.dsks-detail{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px}
.dsks-detail[data-compact]{border:0;border-radius:0;background:transparent;padding:0;gap:10px}
.dsks-hover{position:fixed;z-index:1200;max-height:calc(100vh - 24px);overflow:auto;display:flex;flex-direction:column;gap:8px;padding:12px 14px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 18px 48px rgba(0,0,0,.3);backdrop-filter:blur(18px) saturate(1.1);animation:dsks-hover-in .12s ease-out}
@keyframes dsks-hover-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dsks-hover{animation:none}}
.dsks-hover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsks-hover-title{font-size:13px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsks-detail-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsks-detail-title{margin:0;font-size:14px;font-weight:600}
.dsks-detail-body{display:grid;grid-template-columns:minmax(140px,220px) minmax(0,1fr);gap:14px}
@media (max-width:560px){.dsks-detail-body{grid-template-columns:1fr}}
.dsks-preview{position:relative;border-radius:10px;overflow:hidden;min-height:124px;background-size:cover;border:1px solid var(--dsw-alias-border-l2)}
.dsks-preview-scrim{position:absolute;inset:0}
.dsks-preview-panel{position:absolute;left:10px;right:10px;bottom:10px;padding:8px 10px;border-radius:8px;border:1px solid;font-size:12px;font-weight:500;backdrop-filter:blur(6px)}
.dsks-detail-facts{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsks-detail-desc{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsks-mono{font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,monospace);letter-spacing:.04em}
.dsks-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;margin:4px 0 0;font-size:12px}
.dsks-facts dt{color:var(--dsw-alias-label-tertiary)}
.dsks-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}
.dsks-palette{display:flex;flex-wrap:wrap;gap:6px}
.dsks-palette-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsks-palette-dot{width:10px;height:10px;border-radius:3px;border:1px solid var(--dsw-alias-border-l2)}
.dsks-transparency{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}
.dsks-transparency-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsks-transparency-label{font-size:12px;font-weight:500}
.dsks-range{width:100%;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsks-hint{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dsks-detail-actions{display:flex;gap:8px;flex-wrap:wrap}
.dsks-modal{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.4))}
.dsks-dialog{width:min(480px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;padding:18px 20px 16px;border-radius:14px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 18px 48px rgba(0,0,0,.32);border:1px solid var(--dsw-alias-border-l2);overflow:auto}
.dsks-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsks-dialog-title{margin:0;font-size:15px;font-weight:600}
.dsks-dialog-desc{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary)}
.dsks-dialog-body{display:flex;flex-direction:column;gap:12px}
.dsks-dialog-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.dsks-input,.dsks-textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;resize:vertical}
.dsks-input:focus,.dsks-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsks-form{display:flex;flex-direction:column;gap:12px}
.dsks-drop{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}
.dsks-drop-image{max-height:140px;width:100%;object-fit:cover;border-radius:8px}
.dsks-drop-empty{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsks-drop-actions{display:flex;gap:8px;flex-wrap:wrap}
.dsks-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}
.dsks-checkbox input{accent-color:var(--dsw-alias-brand-primary)}
.dsks-design-result{display:flex;flex-direction:column;gap:10px}
.dsks-design-preview{display:flex;align-items:center;justify-content:center;min-height:120px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);padding:14px}
.dsks-design-panel{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:10px;border:1px solid;max-width:100%}
.dsks-design-panel strong{font-size:14px}
.dsks-design-panel span{font-size:12px;opacity:.8}
.dsks-design-note{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
`

    /* ------------------------------------------------------------------ */
    /* plugin entry                                                        */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots'],
      /** Test seam: the hover card is unreachable from a static render. */
      __components: { HoverPreview, SkinDetail, SkinCard },
      apply(ctx) {
        const runtime = createRuntime(ctx)
        ctx.effect(() => runtime.start())
        ctx.effect(() => runtime.watchThemeChanges())
        ctx.effect(() => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin', PLUGIN_ID)
          style.setAttribute('data-plugin-css', 'manager')
          style.textContent = STYLES
          document.head.append(style)
          return () => style.remove()
        })
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'skin',
              order: 12,
              label: () => translate(ctx, 'section.title'),
            },
            () => h(SkinPage, { runtime }),
          ),
        )
      },
    }

  },
})