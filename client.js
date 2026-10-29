/**
 * deepseek-harness-skin — Web client half.
 *
 * Two jobs:
 *   1. apply the selected wallpaper skin to the running app (alias tokens +
 *      a plugin-owned stylesheet for the wallpaper layer), and
 *   2. render the skin manager inside Settings → Theme Skins.
 *
 * The Host half owns the library; this half talks to it over `/skin/api`.
 */
window.__ModuleLoader__.load({
  id: 'deepseek-harness-skin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PLUGIN_ID = 'deepseek-harness-skin'
    const API_ROOT = '/skin/api'
    /** Version and update endpoints sit beside the skin API, not under it. */
    const ROOT = '/skin'

    /* ------------------------------------------------------------------ */
    /* locale                                                              */
    /* ------------------------------------------------------------------ */

    const STRINGS = {
      zh: {
        'section.title': '主题皮肤',
        'section.desc': '把 Codex Dream Skin 主题包转换成应用皮肤，或按描述生成。',
        'action.refresh': '刷新',
        'action.scan': '扫描本机主题',
        'action.import': '导入',
        'action.openFolder': '打开皮肤库',
        'notice.folderOpened': '已打开皮肤库',
        'notice.folderFailed': '无法打开文件夹，路径已复制：',
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
        'design.desc': '描述你想要的风格；可以附一张图、一段视频，或两者都给。',
        'design.placeholder': '例如：赛博霓虹，暗紫底色，一点电光青，适合深夜写代码',
        'design.image': '选择图片',
        'design.video': '选择视频',
        'design.replaceImage': '换一张图片',
        'design.replaceVideo': '换一段视频',
        'design.clearImage': '移除图片',
        'design.clearVideo': '移除视频',
        'design.imageHint': '图片会作为新皮肤的壁纸，并从中取样配色',
        'design.imageTag': '壁纸',
        'design.videoTag': '视频首帧',
        'design.mediaHint': '只给图片 → 静态主题；只给视频 → 视频首帧当壁纸并播放视频；两个都给 → 图片当壁纸、视频当动态背景',
        'design.modeNone': '还没有选择素材：将只按描述生成一套配色。',
        'design.modeImage': '静态主题：这张图片作为壁纸。',
        'design.modeVideo': '动态主题：视频首帧作为壁纸与静态回退，视频循环播放。',
        'design.modeBoth': '动态主题：图片作为壁纸，视频作为动态背景。',
        'design.advanced': '更多设置（主题名）',
        'design.namePlaceholder': '主题名（留空则让模型起名）',
        'design.model': '设计模型',
        'design.modelsLoading': '正在读取可用模型…',
        'design.modelsFailed': '读取模型列表失败，将使用默认模型',
        'design.noImageMark': '（纯文本）',
        'design.modelBlind': '这个模型不能看图：会按描述和取色生成，首帧不会发给它。换一个支持图片的模型可以按画面设计。',
        'about.title': '关于主题皮肤',
        'about.version': '当前版本',
        'about.repo': '项目地址',
        'about.changelog': '版本说明',
        'about.notes': '检查更新',
        'about.notesSource': '插件以源码形式装在本地，更新会替换整个插件目录并重新加载；也可以直接用 git 拉取新标签。',
        'about.check': '检查更新',
        'about.checking': '正在检查…',
        'about.updateAvailable': '有新版本 {version}',
        'about.upToDate': '已是最新（{version}）',
        'about.noRelease': '还没有发布版本',
        'about.install': '下载并更新',
        'about.downloading': '正在下载更新包…',
        'about.installing': '正在替换文件…',
        'about.installed': '已更新，正在重新加载…',
        'about.openRelease': '打开发布页',
        'design.base': '以当前主题为基底微调',
        'design.working': '正在设计…',
        'design.done': '已生成',
        'design.fallback': '模型不可用，已用离线配色生成',
        'design.empty': '请先写一句描述，或选一张图片。',
        'import.title': '导入主题',
        'import.desc': '选择一个 Codex 主题文件夹，或一个 .zip 主题包。',
        'import.folder': '选择文件夹',
        'import.folderHint': '含 theme.json 的主题目录',
        'import.zip': '选择 ZIP 文件',
        'import.zipHint': 'Codex 分发的 .zip 主题包',
        'import.working': '正在导入…',
        'import.pickHint': '选中后会先检查里面有没有 theme.json，没有则不会导入。',
        'import.manual': '或者直接粘贴路径',
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
        'action.videoSettings': '动态主题设置',
        'label.dynamic': '动态',
        'label.video': '动态背景',
        'video.title': '动态主题设置',
        'video.desc': '这些设置对所有带 MP4 壁纸的主题生效。',
        'video.autoplay': '自动播放',
        'video.autoplayHint': '切换主题后自动播放动态壁纸；关掉后停在静态海报。',
        'video.muted': '静音',
        'video.mutedHint': '关掉后视频带声音；浏览器要求这一次点击来允许播放声音。',
        'video.shortcut': '播放 / 暂停快捷键',
        'video.shortcutHint': '任意界面按一下就切换；也可以在「设置 → 快捷键」里改键位。',
        'video.shortcutFallback': '当前仅窗口聚焦时生效。',
        'video.shortcutUnbound': '未绑定',
        'video.state': '当前主题',
        'video.statePlaying': '动态壁纸播放中',
        'video.statePaused': '已暂停（显示当前帧）',
        'video.stateIdle': '未开始播放',
        'video.stateNone': '这个主题没有动态背景',
        'video.play': '播放',
        'video.pause': '暂停',
        'video.meta': '{w}×{h} · {s} 秒 · {mb} MB',
        'video.missingHint': '原主题带 MP4，可点「补全动态背景」',
        'action.attachVideo': '补全动态背景',
        'notice.videoAttached': '已补全动态背景',
      },
      en: {
        'section.title': 'Theme Skins',
        'section.desc': 'Convert Codex Dream Skin packs into app skins, or generate one from a description.',
        'action.refresh': 'Refresh',
        'action.scan': 'Scan this machine',
        'action.import': 'Import',
        'action.openFolder': 'Open skin library',
        'notice.folderOpened': 'Skin library opened',
        'notice.folderFailed': 'Could not open it; the path was copied: ',
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
        'design.desc': 'Describe the look you want; attach an image, a video, or both.',
        'design.placeholder': 'e.g. cyber neon, dark violet base, a touch of electric cyan, for late-night coding',
        'design.image': 'Choose image',
        'design.video': 'Choose video',
        'design.replaceImage': 'Replace image',
        'design.replaceVideo': 'Replace video',
        'design.clearImage': 'Remove image',
        'design.clearVideo': 'Remove video',
        'design.imageHint': 'The image becomes the wallpaper and the palette source',
        'design.imageTag': 'Wallpaper',
        'design.videoTag': 'First frame',
        'design.mediaHint': 'Image only → static theme; video only → its first frame is the wallpaper and the clip plays; both → image is the wallpaper, video is the dynamic background',
        'design.modeNone': 'No media yet: the palette is derived from the description alone.',
        'design.modeImage': 'Static theme: the image becomes the wallpaper.',
        'design.modeVideo': 'Dynamic theme: the first frame is the poster and fallback, the clip loops behind the UI.',
        'design.modeBoth': 'Dynamic theme: the image is the wallpaper, the video plays behind it.',
        'design.advanced': 'More options (name)',
        'design.namePlaceholder': 'Theme name (leave empty to let the model name it)',
        'design.model': 'Design model',
        'design.modelsLoading': 'Reading available models…',
        'design.modelsFailed': 'Could not read the model list; the default model is used',
        'design.noImageMark': ' (text only)',
        'design.modelBlind': 'This model cannot see images: it designs from the description and colours, and the first frame is not sent. Pick an image-capable model to design from the picture.',
        'about.title': 'About Theme Skins',
        'about.version': 'Version',
        'about.repo': 'Repository',
        'about.changelog': 'Release notes',
        'about.notes': 'Updates',
        'about.notesSource': 'The plugin is installed from source. Updating replaces the whole plugin directory and reloads it; pulling the new tag works too.',
        'about.check': 'Check for updates',
        'about.checking': 'Checking…',
        'about.updateAvailable': 'Version {version} is available',
        'about.upToDate': 'Up to date ({version})',
        'about.noRelease': 'No release published yet',
        'about.install': 'Download and update',
        'about.downloading': 'Downloading the update…',
        'about.installing': 'Replacing files…',
        'about.installed': 'Updated — reloading…',
        'about.openRelease': 'Open release',
        'design.base': 'Restyle the selected skin',
        'design.working': 'Designing…',
        'design.done': 'Created',
        'design.fallback': 'No model available — used the offline palette',
        'design.empty': 'Write a description or pick an image first.',
        'import.title': 'Import a theme',
        'import.desc': 'Choose a Codex theme folder, or a .zip theme pack.',
        'import.folder': 'Choose a folder',
        'import.folderHint': 'A theme directory containing theme.json',
        'import.zip': 'Choose a ZIP file',
        'import.zipHint': 'A .zip theme pack',
        'import.working': 'Importing…',
        'import.pickHint': 'The folder is checked for theme.json before anything is imported.',
        'import.manual': 'Or paste a path',
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
        'action.videoSettings': 'Dynamic background',
        'label.dynamic': 'Dynamic',
        'label.video': 'Background video',
        'video.title': 'Dynamic background',
        'video.desc': 'These settings apply to every theme that ships an MP4 wallpaper.',
        'video.autoplay': 'Autoplay',
        'video.autoplayHint': 'Start the video when a theme is applied; off shows the static poster only.',
        'video.muted': 'Muted',
        'video.mutedHint': 'Turn this off for sound; the browser needs this click to allow audible playback.',
        'video.shortcut': 'Play / pause shortcut',
        'video.shortcutHint': 'Press it from anywhere; you can rebind it in Settings → Shortcuts.',
        'video.shortcutFallback': 'Currently only while the window has focus.',
        'video.shortcutUnbound': 'Unbound',
        'video.state': 'Current theme',
        'video.statePlaying': 'Background video playing',
        'video.statePaused': 'Paused on the current frame',
        'video.stateIdle': 'Not started',
        'video.stateNone': 'This theme has no background video',
        'video.play': 'Play',
        'video.pause': 'Pause',
        'video.meta': '{w}×{h} · {s}s · {mb} MB',
        'video.missingHint': 'The pack ships an MP4 — use "Attach video"',
        'action.attachVideo': 'Attach video',
        'notice.videoAttached': 'Background video attached',
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

    /**
     * Strength of the neutral veil drawn over the artwork.
     *
     * The poster and the video share it so switching between them never changes
     * the brightness of the background. It is never the theme's own colour and
     * never black: a tinted veil washed photos out, a black one turned bright
     * wallpapers muddy. A theme's `--ds-theme-image-dim` can strengthen it.
     */
    function veilAlphaFor(skin, transparency) {
      const visibility = Number.isFinite(transparency) ? Math.max(0, Math.min(100, transparency)) : skin.transparency ?? 60
      const veil = (100 - visibility) / 100
      const declared = /--ds-theme-image-dim\s*:/i.test(skin.codex?.themeCss ?? skin.css ?? '')
      const extra = declared ? Math.max(0, Math.min(0.85, Number(skin.wallpaper?.dim) || 0)) : 0
      return Math.round(Math.min(1, veil + extra) * 1000) / 1000
    }

    function wallpaperCss(skin, transparency) {
      const rules = []
      if (skin.wallpaper?.url) {
        const alpha = veilAlphaFor(skin, transparency)
        const scrim = alpha > 0 ? `linear-gradient(rgba(255, 255, 255, ${alpha}), rgba(255, 255, 255, ${alpha})), ` : ''
        const x = Math.round((skin.wallpaper.focusX ?? 0.5) * 100)
        const y = Math.round((skin.wallpaper.focusY ?? 0.5) * 100)
        rules.push(
          `body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;` +
            `background-image:${scrim}url("${skin.wallpaper.url}");background-size:cover;background-position:${x}% ${y}%;background-repeat:no-repeat;}`,
        )
        rules.push('#root{position:relative;z-index:1;}')
      } else if (skin.video?.url) {
        // A video-only skin has no poster, but the layer still needs #root above
        // it for the same reason.
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

    /** Same response contract, but for the routes beside `/skin/api`. */
    async function rootRequest(path, options) {
      const response = await fetch(`${ROOT}/${path}`, options)
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
      version: () => rootRequest('version'),
      checkUpdate: () => rootRequest('update-check'),
      installUpdate: (bytes) => rootRequest('update/install', { method: 'POST', body: bytes }),
      snapshot: () => request('snapshot'),
      ping: () => request('ping', { method: 'POST', body: '{}' }),
      pingStatus: (status) => request('ping', { method: 'POST', body: JSON.stringify(status) }),
      scan: () => request('scan', { method: 'POST', body: '{}' }),
      revealSources: () => request('reveal-sources', { method: 'POST', body: '{}' }),
      pickSource: () => request('pick-source', { method: 'POST', body: '{}' }),
      importPath: (path) => request('import-path', { method: 'POST', body: JSON.stringify({ path }) }),
      importZip: (name, data) => request('import-zip', { method: 'POST', body: JSON.stringify({ name, data }) }),
      apply: (id) => request('apply', { method: 'POST', body: JSON.stringify({ id }) }),
      deactivate: () => request('deactivate', { method: 'POST', body: '{}' }),
      transparency: (id, value) => request('transparency', { method: 'POST', body: JSON.stringify({ id, value }) }),
      videoSettings: (patch) => request('video-settings', { method: 'POST', body: JSON.stringify(patch ?? {}) }),
      refreshVideo: (id) => request('refresh-video', { method: 'POST', body: JSON.stringify({ id }) }),
      delete: (id) => request('delete', { method: 'POST', body: JSON.stringify({ id }) }),
      recolor: (id, palette) => request('recolor', { method: 'POST', body: JSON.stringify({ id, palette }) }),
      design: (input) => request('design', { method: 'POST', body: JSON.stringify(input) }),
      models: () => request('models'),
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

      /* ---------------------------------------------------------------- */
      /* dynamic background: one fixed <video> layer behind #root           */
      /* ---------------------------------------------------------------- */

      let videoSettings = { autoplay: true, muted: true }
      const video = { layer: null, element: null, skinId: null, failed: false, userPaused: false, manualStarted: false, shortcutRegistered: false }
      let motionQuery = null
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`)
      const SHORTCUT_ID = 'skin.toggleVideo'

      function currentSkin() {
        return snapshot?.themes?.find((skin) => skin.id === appliedId) ?? null
      }

      /** Keycaps the shortcut row shows, matching the binding in force. */
      function shortcutKeys() {
        try {
          const service = ctx.get('shortcuts')
          const rows = service?.catalog?.getSnapshot?.() ?? []
          const row = rows.find((entry) => entry.id === SHORTCUT_ID)
          if (row && Array.isArray(row.keys) && row.keys.length > 0) return row.keys
        } catch {
          /* no shortcut service in this build */
        }
        return isMac ? ['⌘', '⌥', 'P'] : ['Ctrl', '+', 'Alt', '+', 'P']
      }

      function subscribeShortcut(listener) {
        try {
          const service = ctx.get('shortcuts')
          if (service?.catalog?.subscribe) return service.catalog.subscribe(() => listener())
        } catch {
          /* no shortcut service */
        }
        return () => {}
      }

      function motionReduced() {
        if (motionQuery === null) {
          try {
            motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : false
          } catch {
            motionQuery = false
          }
        }
        return Boolean(motionQuery && motionQuery.matches)
      }

      /** Whether the current theme's video should be on screen right now. */
      function shouldPlay(skin) {
        if (!skin?.video?.url || video.failed) return false
        if (video.userPaused) return false
        if (motionReduced()) return false
        return videoSettings.autoplay || video.manualStarted
      }

      function attemptPlay(element) {
        if (!element) return
        let result = null
        try {
          result = element.play?.()
        } catch {
          result = null
        }
        if (result && typeof result.catch === 'function') {
          result.catch(() => {
            // Autoplay refused: keep the poster and wait for a gesture (the
            // shortcut or the settings switch) instead of retrying in a loop.
            video.userPaused = true
            destroyVideo()
            emit()
          })
        }
      }

      function destroyVideo() {
        const layer = video.layer
        const element = video.element
        video.layer = null
        video.element = null
        video.skinId = null
        if (element) {
          try {
            element.pause()
          } catch {
            /* already detached */
          }
          try {
            element.removeAttribute('src')
            element.load?.()
          } catch {
            /* already detached */
          }
        }
        try {
          layer?.remove()
        } catch {
          /* already detached */
        }
      }

      function mountVideo(skin) {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function' || document.body === undefined) return
        destroyVideo()
        const layer = document.createElement('div')
        layer.className = 'dsks-video-layer'
        layer.setAttribute('data-plugin', PLUGIN_ID)
        layer.setAttribute('aria-hidden', 'true')
        const element = document.createElement('video')
        element.muted = videoSettings.muted !== false
        element.loop = true
        element.playsInline = true
        element.preload = 'auto'
        element.setAttribute('playsinline', '')
        element.setAttribute('disablepictureinpicture', '')
        element.setAttribute('disableremoteplayback', '')
        element.setAttribute('aria-hidden', 'true')
        const x = Math.round((skin.wallpaper?.focusX ?? 0.5) * 100)
        const y = Math.round((skin.wallpaper?.focusY ?? 0.5) * 100)
        if (element.style) element.style.objectPosition = `${x}% ${y}%`
        element.src = skin.video.url
        const veil = document.createElement('span')
        veil.className = 'dsks-video-veil'
        layer.append(element, veil)
        element.addEventListener('loadeddata', () => layer.setAttribute('data-ready', ''))
        element.addEventListener('error', () => {
          // Ignore the teardown itself: clearing `src` and calling `load()` must
          // not poison the next mount with a permanent failure flag.
          if (video.element !== element) return
          video.failed = true
          destroyVideo()
          emit()
        })
        document.body.append(layer)
        video.layer = layer
        video.element = element
        video.skinId = skin.id
      }

      function paintVeil(skin, transparency) {
        const veil = video.layer?.querySelector?.('.dsks-video-veil')
        if (!veil || !veil.style) return
        veil.style.background = `rgba(255, 255, 255, ${veilAlphaFor(skin, transparency)})`
      }

      function syncVideo(skin, transparency) {
        if (!skin?.video?.url || !shouldPlay(skin)) {
          destroyVideo()
          return
        }
        if (!video.layer || video.skinId !== skin.id) mountVideo(skin)
        paintVeil(skin, transparency)
        if (video.element && video.element.paused) attemptPlay(video.element)
      }

      /** Play/pause for the active theme; also the shortcut's handler. */
      function toggleVideo() {
        const skin = currentSkin()
        if (!skin?.video) return { playing: false, hasVideo: false }
        const playing = Boolean(video.element) && !video.element.paused
        if (playing) {
          video.userPaused = true
          try {
            video.element.pause()
          } catch {
            /* already detached */
          }
          emit()
          return { playing: false, hasVideo: true }
        }
        video.userPaused = false
        video.manualStarted = true
        video.failed = false
        syncVideo(skin, skin.transparency)
        emit()
        return { playing: true, hasVideo: true }
      }

      async function updateVideoSettings(patch) {
        const next = { ...videoSettings, ...(patch && typeof patch === 'object' ? patch : {}) }
        videoSettings = next
        if (snapshot) snapshot = { ...snapshot, video: { ...next } }
        if (patch?.autoplay === false) {
          video.manualStarted = false
          destroyVideo()
        }
        if (patch?.autoplay === true) video.userPaused = false
        if (typeof patch?.muted === 'boolean') {
          // Switching sound on is a gesture, so it may also unlock a video the
          // autoplay policy paused earlier (even if its element is gone).
          if (!patch.muted) video.userPaused = false
          if (video.element) video.element.muted = patch.muted
        }
        const skin = currentSkin()
        if (skin) syncVideo(skin, skin.transparency)
        emit()
        try {
          const payload = await api.videoSettings(patch)
          if (payload?.snapshot) applySnapshot(payload.snapshot)
        } catch (error) {
          console.error('[dsh-skin] 保存动态主题设置失败', error)
        }
        return next
      }

      function onVisibilityChange() {
        const skin = currentSkin()
        if (!skin?.video) return
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          try {
            video.element?.pause()
          } catch {
            /* already detached */
          }
          return
        }
        if (shouldPlay(skin) && video.element?.paused) attemptPlay(video.element)
      }

      function onMotionChange() {
        const skin = currentSkin()
        if (!skin) return
        syncVideo(skin, skin.transparency)
        emit()
      }

      /** Register the play/pause command with the app's shortcut system. */
      function registerShortcut(service) {
        if (!service?.register || video.shortcutRegistered) return null
        const binding = (platform) => ({ code: 'KeyP', modifiers: platform === 'macos' ? ['meta', 'alt'] : ['control', 'alt'] })
        try {
          const disposer = service.register({
            id: SHORTCUT_ID,
            label: () => translate(ctx, 'video.shortcut'),
            aliases: ['dynamic background', 'play pause'],
            defaults: {
              'desktop:macos': binding('macos'),
              'desktop:windows': binding('windows'),
              'desktop:linux': binding('linux'),
              'web:macos': binding('macos'),
              'web:windows': binding('windows'),
            },
            regions: ['page', 'editable', 'terminal'],
            modals: [],
            resolve: () => ({
              status: 'handled',
              run: () => {
                toggleVideo()
              },
            }),
          })
          video.shortcutRegistered = true
          return disposer
        } catch (error) {
          console.warn('[dsh-skin] 注册播放快捷键失败，改为窗口内快捷键', error)
          return null
        }
      }

      /** Fallback for builds without the shortcut registry: window-level keydown. */
      function installFallbackShortcut() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
        const onKeyDown = (event) => {
          if (video.shortcutRegistered) return
          if (!event.altKey || event.shiftKey) return
          if (!(isMac ? event.metaKey : event.ctrlKey)) return
          if (event.code !== 'KeyP' && String(event.key ?? '').toLowerCase() !== 'p') return
          const target = event.target
          if (target && typeof target.closest === 'function' && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))) return
          event.preventDefault?.()
          toggleVideo()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }

      function startShortcut() {
        const disposers = [installFallbackShortcut()]
        let service = null
        try {
          service = ctx.get('shortcuts')
        } catch {
          service = null
        }
        if (service) {
          const disposer = registerShortcut(service)
          if (disposer) disposers.push(disposer)
        } else if (typeof ctx.inject === 'function') {
          // The shortcuts plugin may mount after this one; inject waits for it.
          ctx.inject(['shortcuts'], (shortcutCtx) => {
            shortcutCtx.effect(() => {
              const disposer = registerShortcut(shortcutCtx.shortcuts)
              return () => disposer?.()
            })
          })
        }
        return () => {
          for (const dispose of disposers.reverse()) {
            try {
              dispose()
            } catch {
              /* already disposed */
            }
          }
        }
      }

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
        destroyVideo()
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
          // A different theme restarts the playback policy: a manual pause does
          // not leak into the next skin, and a manual start does not either.
          if (video.skinId !== skin.id) {
            video.userPaused = false
            video.manualStarted = false
            video.failed = false
          }
          syncVideo(skin, skin.transparency)
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
        if (next.video && typeof next.video === 'object') {
          videoSettings = {
            autoplay: next.video.autoplay !== false,
            muted: next.video.muted !== false,
          }
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
          paintVeil(active, value)
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
        motionReduced() // resolve the media query before subscribing to it
        const disposeShortcut = startShortcut()
        const onVisibility = () => onVisibilityChange()
        const onMotion = () => onMotionChange()
        try {
          if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', onVisibility)
        } catch {
          /* no document */
        }
        try {
          if (motionQuery && typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', onMotion)
        } catch {
          /* no media query support */
        }
        return () => {
          cancelled = true
          disposeShortcut()
          try {
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') document.removeEventListener('visibilitychange', onVisibility)
          } catch {
            /* no document */
          }
          try {
            if (motionQuery && typeof motionQuery.removeEventListener === 'function') motionQuery.removeEventListener('change', onMotion)
          } catch {
            /* no media query support */
          }
          destroyVideo()
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
        getVideoSettings: () => ({ ...videoSettings }),
        updateVideoSettings,
        toggleVideo,
        isVideoPlaying: () => Boolean(video.element) && !video.element.paused,
        isVideoStarted: () => Boolean(video.element),
        getActiveSkin: () => currentSkin(),
        getShortcutKeys: () => shortcutKeys(),
        subscribeShortcut,
        isShortcutRegistered: () => video.shortcutRegistered,
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
      play: 'M8 5v14l11-7z',
      pause: 'M9 5v14M15 5v14',
      chevron: 'M8 10l4 4 4-4',
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
      const [version, setVersion] = useState('—')
      const [info, setInfo] = useState({ repository: 'xxue-z/deepseek-harness-skin', url: 'https://github.com/xxue-z/deepseek-harness-skin' })
      // Latest release, checked once at startup; the header badge reads it.
      const [release, setRelease] = useState(null)
      const fileInput = useRef(null)
      const commitTimer = useRef(null)

      useEffect(() => {
        let cancelled = false
        api
          .version()
          .then((payload) => {
            if (cancelled) return
            setVersion(payload.version)
            setInfo({ repository: payload.repository, url: payload.url })
          })
          .catch(() => {})
        // Only ask GitHub when the sheet is opened, so an offline machine never
        // pays a timeout just for opening settings; the dialog refreshes it.
        return () => {
          cancelled = true
        }
      }, [])

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
            // A skipped video keeps the poster, so say why instead of leaving the
            // user wondering why the theme is not moving.
            const warnings = payload.results.flatMap((result) => result.warnings ?? [])
            const notice = warnings.length > 0 ? `；${warnings.slice(0, 2).join('；')}` : ''
            return `${t('notice.scan')}：${parts.join('，')}${notice}`
          },
        )

      const onRevealSources = () =>
        run('reveal', () => api.revealSources(), (payload) => {
          // A headless host cannot show a window; hand the path over instead.
          if (payload?.opened?.opened === false) {
            navigator.clipboard?.writeText(payload.opened.path ?? '').catch(() => {})
            return `${t('notice.folderFailed')}${payload.opened.path ?? ''}`
          }
          return t('notice.folderOpened')
        })

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

      const onZipChosen = (file) => {
        if (!file) return
        // One dialog for both sources: a picked .zip is uploaded from the
        // browser, a folder path is imported on the Host. The dialog stays
        // mounted while the import runs, so it reports its own progress.
        return run('zip', async () => {
          const buffer = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buffer)
          const chunk = 0x8000
          for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
          return api.importZip(file.name, btoa(binary))
        }, (payload) => `${t('notice.imported')}：${payload.result.id}${payload.result.warnings?.length ? `；${payload.result.warnings[0]}` : ''}`).then((payload) => {
          if (fileInput.current) fileInput.current.value = ''
          return payload
        })
      }

      const onResetTransparency = (skin) =>
        run('reset', () => api.transparency(skin.id, null), t('notice.saved'))

      const onRecolor = (skin) => {
        const palette = dominantColorsFromUrl(skin.wallpaper?.url)
        run('recolor', async () => api.recolor(skin.id, await palette), t('notice.saved'))
      }

      // Skins imported before dynamic backgrounds existed keep only the source
      // metadata; this pulls the mp4 in without rewriting the rest.
      const onAttachVideo = (skin) =>
        run('attachVideo', () => api.refreshVideo(skin.id), t('notice.videoAttached'))

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
            h(
              'h2',
              { className: 'dsks-title' },
              h('span', null, t('section.title')),
              // Small, secondary, and clickable: the version opens the release
              // sheet. A newer release tints it so the badge itself reports it.
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsks-version',
                  'data-update': release?.updateAvailable ? '' : undefined,
                  title: release?.updateAvailable ? t('about.updateAvailable', { version: release.latest ?? '' }) : t('about.title'),
                  onClick: () => setDialog('about'),
                },
                `v${version}`,
              ),
            ),
            h('p', { className: 'dsks-subtitle' }, t('section.desc')),
          ),
          h(
            'div',
            { className: 'dsks-actions' },
            h(Button, { icon: 'refresh', onClick: onRefresh, busy: busy === 'refresh' }, t('action.refresh')),
            h(Button, { icon: 'play', onClick: () => setDialog('video') }, t('action.videoSettings')),
            h(Button, { icon: 'scan', onClick: onScan, busy: busy === 'scan' }, t('action.scan')),
            h(Button, { icon: 'upload', onClick: () => setDialog('import'), busy: busy === 'zip' }, t('action.import')),
            h(Button, { variant: 'primary', icon: 'sparkle', onClick: () => setDialog('design') }, t('action.design')),
          ),
        ),
        h(Notice, { notice, onDismiss: () => setNotice(null) }),
        error && !notice ? h('p', { className: 'dsks-error' }, error) : null,
        snapshot.sources.length > 0 || snapshot.model
          ? h(
              'div',
              { className: 'dsks-sources' },
              h(Button, { icon: 'folder', onClick: onRevealSources, busy: busy === 'reveal' }, t('action.openFolder')),
              snapshot.model
                ? h('span', { className: 'dsks-model' }, `${t('label.model')}：${snapshot.model.provider}/${snapshot.model.model}`)
                : null,
            )
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
              { className: 'dsks-list' },
              ...themes.map((skin) =>
                h(SkinRow, {
                  key: skin.id,
                  skin,
                  active: skin.id === activeId,
                  open: skin.id === selectedId,
                  t,
                  busy,
                  draftTransparency: draftTransparency?.id === skin.id ? draftTransparency.value : null,
                  onToggle: () => setSelectedId((current) => (current === skin.id ? null : skin.id)),
                  onApply: () => onApply(skin.id),
                  onDeactivate,
                  onDelete: () => setDialog('delete'),
                  onExport: () => onExport(skin.id),
                  onRecolor: () => onRecolor(skin),
                  onAttachVideo: () => onAttachVideo(skin),
                  onTransparency: (value) => onTransparencyInput(skin, value),
                  onReset: () => onResetTransparency(skin),
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
        dialog === 'about'
          ? h(AboutDialog, { t, version, info, release, onChecked: setRelease, onClose: () => setDialog(null) })
          : null,
        dialog === 'video'
          ? h(VideoSettingsDialog, { t, runtime, onClose: () => setDialog(null) })
          : null,
        dialog === 'import'
          ? h(ImportDialog, {
              t,
              busy,
              zipInput: fileInput,
              onClose: () => setDialog(null),
              onZip: (file) => onZipChosen(file).then((payload) => { if (payload) setDialog(null) }),
              onPick: (path) =>
                run('import', () => api.importPath(path), (payload) => `${t('notice.imported')}：${payload.result.id}${payload.result.warnings?.length ? `；${payload.result.warnings[0]}` : ''}`).then((payload) => {
                  if (payload) setDialog(null)
                }),
            })
          : null,
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
      )
    }

    /**
     * One skin as a full-width row. Clicking the row toggles an inline detail
     * card directly beneath it; the page keeps a single open row, so opening
     * one collapses the previous one.
     */
    function SkinRow({ skin, active, open, t, busy, draftTransparency, onToggle, onApply, onDeactivate, onDelete, onExport, onRecolor, onAttachVideo, onTransparency, onReset }) {
      return h(
        'div',
        { className: 'dsks-row-wrap', 'data-open': open ? '' : undefined, 'data-active': active ? '' : undefined },
        h(
          'button',
          {
            type: 'button',
            className: 'dsks-row',
            onClick: onToggle,
            'aria-expanded': open,
            'aria-label': skin.name,
          },
          h('span', { className: 'dsks-row-thumb', 'data-empty': skin.wallpaper ? undefined : '' }, skin.wallpaper ? h('img', { src: skin.wallpaper.url, alt: '', loading: 'lazy' }) : h(Icon, { name: 'image', size: 18 })),
          h(
            'span',
            { className: 'dsks-row-text' },
            h('span', { className: 'dsks-row-name' }, skin.name),
            h(
              'span',
              { className: 'dsks-row-meta' },
              t(`appearance.${skin.appearance}`) ?? skin.appearance,
              ' · ',
              t(`origin.${skin.origin?.kind ?? 'manual'}`) ?? skin.origin?.kind,
              skin.video ? ` · ${t('label.dynamic')}` : '',
              skin.description ? ` · ${skin.description}` : '',
            ),
          ),
          h('span', { className: 'dsks-swatches dsks-row-swatches' }, ...[skin.colors.accent, skin.colors.accentAlt, skin.colors.secondary, skin.colors.panel, skin.colors.background].map((color, index) => h('span', { key: index, className: 'dsks-swatch', style: { background: color } }))),
          active ? h('span', { className: 'dsks-pill' }, h(Icon, { name: 'check', size: 12 }), t('action.applied')) : null,
          h('span', { className: 'dsks-row-chevron', 'data-open': open ? '' : undefined }, h(Icon, { name: 'chevron' })),
        ),
        open
          ? h(
              'div',
              { className: 'dsks-row-detail' },
              h(SkinDetail, {
                skin,
                active,
                t,
                busy,
                draftTransparency,
                onApply,
                onDeactivate,
                onDelete,
                onExport,
                onRecolor,
                onAttachVideo,
                onTransparency,
                onReset,
                onClose: onToggle,
                compact: true,
              }),
            )
          : null,
      )
    }

    function SkinDetail({ skin, active, t, busy, draftTransparency, onApply, onDeactivate, onDelete, onExport, onRecolor, onAttachVideo, onTransparency, onReset, onClose, compact = false }) {
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
              h('dt', null, t('label.video')),
              h('dd', null, skin.video ? `${skin.video.width}×${skin.video.height} · ${(Math.round((skin.video.durationMs ?? 0) / 100) / 10).toFixed(1)}s` : codex?.video ? t('video.missingHint') : '—'),
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
          codex?.video && !skin.video && onAttachVideo ? h(Button, { icon: 'play', onClick: onAttachVideo, busy: busy === 'attachVideo' }, t('action.attachVideo')) : null,
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

    /**
     * SHA-256 of a downloaded bundle, so a corrupted or swapped asset never
     * reaches the install step.
     */
    async function sha256Hex(bytes) {
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }

    /**
     * Version sheet: what this build is, where it comes from, and the update.
     *
     * The update path matches how the plugin is installed — a bundle that lives
     * in a directory. Downloading a release replaces that directory and reloads
     * the Host and the page; nothing outside the package is touched.
     */
    function AboutDialog({ t, version, info, release, onChecked, onClose }) {
      // Key the state on the release it was opened with, so an update found at
      // startup is what the sheet shows on its first paint.
      const [check, setCheck] = useState(release)
      const [checking, setChecking] = useState(false)
      const [error, setError] = useState(null)
      const [phase, setPhase] = useState(null)
      if (check === null && release !== null && release !== undefined) setCheck(release)
      const run = async () => {
        setChecking(true)
        setError(null)
        try {
          const payload = await api.checkUpdate()
          setCheck(payload)
          onChecked?.(payload)
          return payload
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
          return null
        } finally {
          setChecking(false)
        }
      }
      const install = async () => {
        setPhase('downloading')
        setError(null)
        try {
          // Prefer the release asset the workflow built and verified; the
          // tag tarball stays as the fallback for a release without one.
          const url =
            check.asset?.url ??
            `https://codeload.github.com/${info.repository}/tar.gz/refs/tags/${encodeURIComponent(check.tag)}`
          const response = await fetch(url)
          if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`)
          const bytes = new Uint8Array(await response.arrayBuffer())
          if (check.checksum?.url) {
            const expected = (await (await fetch(check.checksum.url)).text()).trim().split(/\s+/)[0]
            const digest = await sha256Hex(bytes)
            if (expected && digest.toLowerCase() !== expected.toLowerCase()) throw new Error('下载的更新包校验和不符，已取消安装')
          }
          setPhase('installing')
          await api.installUpdate(bytes)
          setPhase('done')
          // The Host half is now the new version: reload so the page picks up
          // the new client module too.
          setTimeout(() => window.location.reload(), 1200)
        } catch (failure) {
          setPhase(null)
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
      const latest = check?.latest ?? null
      return h(
        Dialog,
        {
          t,
          title: t('about.title'),
          description: `${t('about.version')} ${version}`,
          onClose,
          width: 'min(520px, 100%)',
          footer: [h(Button, { key: 'close', onClick: onClose }, t('action.close'))],
        },
        h(
          'div',
          { className: 'dsks-about' },
          h(
            'div',
            { className: 'dsks-about-row' },
            h('span', { className: 'dsks-switch-label' }, t('about.repo')),
            h('a', { className: 'dsks-link', href: info.url, target: '_blank', rel: 'noreferrer noopener' }, info.url.replace(/^https:\/\//, '')),
          ),
          h(
            'div',
            { className: 'dsks-about-row' },
            h('span', { className: 'dsks-switch-label' }, t('about.changelog')),
            h('a', { className: 'dsks-link', href: `${info.url}/blob/master/CHANGELOG.md`, target: '_blank', rel: 'noreferrer noopener' }, 'CHANGELOG.md'),
          ),
          h('h4', { className: 'dsks-about-head' }, t('about.notes')),
          h('p', { className: 'dsks-hint' }, t('about.notesSource')),
          check !== null
            ? h(
                'p',
                { className: check.updateAvailable ? 'dsks-about-update' : 'dsks-hint' },
                check.updateAvailable
                  ? t('about.updateAvailable', { version: latest ?? check.tag ?? '' })
                  : check.latest
                    ? t('about.upToDate', { version: check.latest })
                    : t('about.noRelease'),
              )
            : null,
          phase === 'done'
            ? h('p', { className: 'dsks-hint' }, t('about.installed'))
            : phase !== null
              ? h('p', { className: 'dsks-hint' }, phase === 'downloading' ? t('about.downloading') : t('about.installing'))
              : null,
          error ? h('p', { className: 'dsks-error' }, error) : null,
          check?.error ? h('p', { className: 'dsks-hint dsks-warn' }, check.error) : null,
        ),
        h(
          'div',
          { className: 'dsks-about-actions' },
          h(Button, { onClick: run, busy: checking }, checking ? t('about.checking') : t('about.check')),
          check?.updateAvailable && phase === null
            ? h(Button, { variant: 'primary', icon: 'download', onClick: install }, t('about.install'))
            : null,
          check?.url ? h(Button, { onClick: () => window.open(check.url, '_blank', 'noopener') }, t('about.openRelease')) : null,
        ),
      )
    }

    function Switch({ id, checked, label, hint, onChange }) {
      return h(
        'label',
        { className: 'dsks-switch', htmlFor: id },
        h(
          'span',
          { className: 'dsks-switch-text' },
          h('span', { className: 'dsks-switch-label' }, label),
          hint ? h('span', { className: 'dsks-switch-hint' }, hint) : null,
        ),
        h('input', {
          id,
          className: 'dsks-switch-input',
          type: 'checkbox',
          checked: Boolean(checked),
          onChange: (event) => onChange(event.target.checked),
        }),
        h('span', { className: 'dsks-switch-track', 'aria-hidden': 'true' }, h('span', { className: 'dsks-switch-thumb' })),
      )
    }

    /**
     * The dynamic-background sheet: autoplay, mute, and the play/pause shortcut.
     *
     * The shortcut is registered with the app's own command registry, so the
     * keycaps here are read back from it (and follow a rebind in Settings →
     * Shortcuts) instead of being a hard-coded string.
     */
    function VideoSettingsDialog({ t, runtime, onClose }) {
      const [settings, setSettings] = useState(() => runtime.getVideoSettings())
      const [keys, setKeys] = useState(() => runtime.getShortcutKeys())
      const [, setRevision] = useState(0)
      useEffect(() => runtime.subscribeShortcut(() => setKeys(runtime.getShortcutKeys())), [runtime])
      const skin = runtime.getActiveSkin()
      const playing = runtime.isVideoPlaying()
      const update = (patch) => {
        setSettings((current) => ({ ...current, ...patch }))
        void runtime.updateVideoSettings(patch)
      }
      const toggle = () => {
        runtime.toggleVideo()
        setRevision((value) => value + 1)
      }
      const meta = skin?.video
        ? t('video.meta', {
            w: skin.video.width,
            h: skin.video.height,
            s: Math.round((skin.video.durationMs ?? 0) / 100) / 10,
            mb: Math.round(((skin.video.bytes ?? 0) / 1024 / 1024) * 10) / 10,
          })
        : null
      const state = !skin?.video
        ? t('video.stateNone')
        : playing
          ? t('video.statePlaying')
          : runtime.isVideoStarted?.()
            ? t('video.statePaused')
            : t('video.stateIdle')
      return h(
        Dialog,
        {
          t,
          title: t('video.title'),
          description: t('video.desc'),
          onClose,
          footer: [h(Button, { key: 'close', onClick: onClose }, t('action.close'))],
        },
        h(Switch, {
          id: 'dsks-video-autoplay',
          checked: settings.autoplay,
          label: t('video.autoplay'),
          hint: t('video.autoplayHint'),
          onChange: (value) => update({ autoplay: value }),
        }),
        h(Switch, {
          id: 'dsks-video-muted',
          checked: settings.muted,
          label: t('video.muted'),
          hint: t('video.mutedHint'),
          onChange: (value) => update({ muted: value }),
        }),
        h(
          'div',
          { className: 'dsks-shortcut' },
          h(
            'div',
            { className: 'dsks-shortcut-text' },
            h('span', { className: 'dsks-switch-label' }, t('video.shortcut')),
            h('span', { className: 'dsks-switch-hint' }, t('video.shortcutHint')),
          ),
          h(
            'span',
            { className: 'dsks-keycaps' },
            ...keys.map((key, index) =>
              key === '+' ? h('span', { key: index, className: 'dsks-keycap-plus' }, '+') : h('kbd', { key: index, className: 'dsks-keycap' }, key),
            ),
          ),
        ),
        runtime.isShortcutRegistered() ? null : h('p', { className: 'dsks-hint' }, t('video.shortcutFallback')),
        h(
          'div',
          { className: 'dsks-video-state' },
          h(
            'div',
            { className: 'dsks-video-state-text' },
            h('span', { className: 'dsks-switch-label' }, t('video.state')),
            h('span', { className: 'dsks-switch-hint' }, meta ? `${state} · ${meta}` : state),
          ),
          skin?.video ? h(Button, { icon: playing ? 'pause' : 'play', onClick: toggle }, playing ? t('video.pause') : t('video.play')) : null,
        ),
      )
    }

    function ImportDialog({ t, busy, onClose, onPick, onZip, zipInput }) {
      const [path, setPath] = useState('')
      const [error, setError] = useState(null)
      const [picking, setPicking] = useState(false)
      const pickFolder = async () => {
        setPicking(true)
        setError(null)
        try {
          const picked = await api.pickSource()
          if (picked?.path) await onPick(picked.path)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setPicking(false)
        }
      }
      return h(
        Dialog,
        {
          t,
          title: t('import.title'),
          description: t('import.desc'),
          onClose,
          footer: [h(Button, { key: 'cancel', onClick: onClose }, t('action.cancel'))],
        },
        h(
          'div',
          { className: 'dsks-import-choices' },
          h(
            'button',
            { type: 'button', className: 'dsks-choice', disabled: picking || busy, onClick: pickFolder },
            h(Icon, { name: 'folder' }),
            h('span', { className: 'dsks-choice-title' }, t('import.folder')),
            h('span', { className: 'dsks-choice-hint' }, t('import.folderHint')),
            picking ? h('span', { className: 'dsks-spinner' }) : null,
          ),
          h(
            'button',
            { type: 'button', className: 'dsks-choice', disabled: picking || busy, onClick: () => zipInput.current?.click() },
            h(Icon, { name: 'upload' }),
            h('span', { className: 'dsks-choice-title' }, t('import.zip')),
            h('span', { className: 'dsks-choice-hint' }, t('import.zipHint')),
          ),
        ),
        h('p', { className: 'dsks-hint' }, t('import.pickHint')),
        busy === 'zip' || busy === 'import' ? h('p', { className: 'dsks-hint' }, t('import.working')) : null,
        error ? h('p', { className: 'dsks-error' }, error) : null,
        h(
          'details',
          { className: 'dsks-fallback' },
          h('summary', null, t('import.manual')),
          h('input', {
            className: 'dsks-input',
            value: path,
            placeholder: t('import.placeholder'),
            onChange: (event) => setPath(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter' && path.trim() !== '') onPick(path.trim())
            },
          }),
        ),
        h('input', {
          ref: zipInput,
          type: 'file',
          accept: '.zip,application/zip',
          style: { display: 'none' },
          onChange: (event) => onZip(event.target.files?.[0]),
        }),
      )
    }

    function DesignDialog({ t, runtime, base, onClose, onDone }) {
      const [description, setDescription] = useState('')
      const [image, setImage] = useState(null)
      const [palette, setPalette] = useState([])
      const [video, setVideo] = useState(null)
      const [details, setDetails] = useState({ name: '' })
      const [useBase, setUseBase] = useState(Boolean(base))
      const [model, setModel] = useState({ provider: '', model: '' })
      const [catalog, setCatalog] = useState(null)
      const [catalogError, setCatalogError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const [result, setResult] = useState(null)
      const imageInput = useRef(null)
      const videoInput = useRef(null)

      // The dropdown lists exactly the routes the Host can call, which is the
      // same registry the chat composer reads.
      useEffect(() => {
        let cancelled = false
        api
          .models()
          .then((payload) => {
            if (cancelled) return
            setCatalog(payload.models)
            const preferred = payload.models?.default
            const first = payload.models?.groups?.[0]?.models?.[0]
            const pick = preferred ?? first
            if (pick) setModel({ provider: pick.provider, model: pick.model ?? pick.id })
          })
          .catch((failure) => {
            if (!cancelled) setCatalogError(failure instanceof Error ? failure.message : String(failure))
          })
        return () => {
          cancelled = true
        }
      }, [t])

      const allModels = useMemo(() => (catalog?.groups ?? []).flatMap((group) => group.models.map((entry) => ({ ...entry, groupName: group.name }))), [catalog])
      const selected = allModels.find((entry) => entry.provider === model.provider && entry.id === model.model) ?? null
      const hasMedia = image !== null || video !== null
      const needsImage = hasMedia
      const modelBlind = needsImage && selected !== null && selected.images === 'no'

      const onImage = async (file) => {
        if (!file) return
        try {
          const prepared = await prepareImage(file)
          setImage(prepared.dataUrl)
          // The image outranks the video frame for the palette; a video-only
          // design keeps the colours sampled from its first frame.
          setPalette(prepared.palette)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const onVideo = async (file) => {
        if (!file) return
        try {
          const prepared = await prepareVideo(file)
          setVideo(prepared)
          // Only the video's first frame seeds the palette/static fallback.
          setPalette(prepared.palette)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      const clearVideo = () => {
        setVideo(null)
        setPalette(image ? palette : [])
      }

      const clearImage = () => {
        setImage(null)
        setPalette(video ? video.palette : [])
      }

      const generate = async () => {
        if (description.trim() === '' && !hasMedia) {
          setError(t('design.empty'))
          return
        }
        setBusy(true)
        setError(null)
        try {
          const payload = await api.design({
            description: description.trim(),
            palette,
            // Video-only: the first frame becomes the poster/static fallback.
            imageDataUrl: image ?? video?.frame ?? null,
            videoDataUrl: video?.dataUrl ?? null,
            details: { ...details, hasVideo: video !== null },
            baseId: useBase && base ? base.id : null,
            modelProvider: model.provider || undefined,
            modelModel: model.model || undefined,
          })
          if (payload.snapshot) runtime.applySnapshot(payload.snapshot)
          setResult({ skin: payload.skin, warning: payload.warning, usedModel: payload.usedModel })
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        } finally {
          setBusy(false)
        }
      }

      const modeHint = video
        ? image
          ? t('design.modeBoth')
          : t('design.modeVideo')
        : image
          ? t('design.modeImage')
          : t('design.modeNone')

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
              result.skin.video ? h('p', { className: 'dsks-design-note' }, `${t('label.dynamic')} · ${result.skin.video.width}×${result.skin.video.height} · ${(Math.round((result.skin.video.durationMs ?? 0) / 100) / 10).toFixed(1)}s`) : null,
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
                h(
                  'div',
                  { className: 'dsks-media-row' },
                  image
                    ? h(
                        'div',
                        { className: 'dsks-media' },
                        h('img', { className: 'dsks-media-image', src: image, alt: '' }),
                        h('span', { className: 'dsks-media-tag' }, t('design.imageTag')),
                      )
                    : null,
                  video
                    ? h(
                        'div',
                        { className: 'dsks-media' },
                        h('img', { className: 'dsks-media-image', src: video.frame, alt: '' }),
                        h('span', { className: 'dsks-media-tag dsks-media-live' }, h(Icon, { name: 'play', size: 11 }), `${t('design.videoTag')} · ${video.meta.width}×${video.meta.height}`),
                      )
                    : null,
                  !hasMedia ? h('div', { className: 'dsks-drop-empty' }, h(Icon, { name: 'image', size: 22 }), h('span', null, t('design.mediaHint'))) : null,
                ),
                h(
                  'div',
                  { className: 'dsks-drop-actions' },
                  h(Button, { onClick: () => imageInput.current?.click() }, image ? t('design.replaceImage') : t('design.image')),
                  h(Button, { onClick: () => videoInput.current?.click() }, video ? t('design.replaceVideo') : t('design.video')),
                  image ? h(Button, { onClick: clearImage }, t('design.clearImage')) : null,
                  video ? h(Button, { onClick: clearVideo }, t('design.clearVideo')) : null,
                ),
                h('p', { className: 'dsks-hint' }, modeHint),
                h('input', { ref: imageInput, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (event) => onImage(event.target.files?.[0]) }),
                h('input', { ref: videoInput, type: 'file', accept: 'video/mp4,video/*', style: { display: 'none' }, onChange: (event) => onVideo(event.target.files?.[0]) }),
              ),
              palette.length > 0
                ? h('div', { className: 'dsks-swatches dsks-swatches-lg' }, ...palette.map((color, index) => h('span', { key: index, className: 'dsks-swatch', style: { background: color }, title: color })))
                : null,
              h(
                'details',
                { className: 'dsks-fallback dsks-advanced' },
                h('summary', null, t('design.advanced')),
                h(
                  'div',
                  { className: 'dsks-form' },
                  // Only the name is structured input; mood and extra rules are
                  // the brief's own words and belong in the description above.
                  h('input', {
                    className: 'dsks-input',
                    value: details.name,
                    placeholder: t('design.namePlaceholder'),
                    onChange: (event) => setDetails({ ...details, name: event.target.value }),
                  }),
                ),
              ),
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
                { className: 'dsks-field' },
                h('span', { className: 'dsks-field-label' }, t('design.model')),
                h(
                  'select',
                  {
                    className: 'dsks-select',
                    value: selected ? `${selected.provider}::${selected.id}` : '',
                    disabled: busy || allModels.length === 0,
                    onChange: (event) => {
                      const [provider, id] = String(event.target.value).split('::')
                      setModel({ provider, model: id })
                    },
                  },
                  ...(allModels.length === 0
                    ? [h('option', { key: 'none', value: '' }, catalogError ? t('design.modelsFailed') : t('design.modelsLoading'))]
                    : []),
                  ...(catalog?.groups ?? []).map((group) =>
                    h(
                      'optgroup',
                      { key: group.id, label: group.name },
                      ...group.models.map((entry) => h('option', { key: `${entry.provider}::${entry.id}`, value: `${entry.provider}::${entry.id}` }, entry.images === 'no' ? `${entry.name}${t('design.noImageMark')}` : entry.name)),
                    ),
                  ),
                ),
              ),
              modelBlind ? h('p', { className: 'dsks-hint dsks-warn' }, t('design.modelBlind')) : null,
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

    /**
     * Read one MP4 and grab its first frame.
     *
     * The browser is the only decoder here: the clip plays muted with
     * `preload=auto` just far enough to draw frame zero onto a canvas. That
     * frame becomes the poster (and the palette source) exactly as Codex packs
     * expect, so a video-only design still has a static fallback.
     */
    async function prepareVideo(file) {
      if (file.size > 16 * 1024 * 1024) throw new Error('视频超过 16 MB')
      const url = URL.createObjectURL(file)
      const element = document.createElement('video')
      element.muted = true
      element.playsInline = true
      element.preload = 'auto'
      element.src = url
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('视频加载超时（可能需要 H.264 编码）')), 15000)
          element.addEventListener('loadeddata', () => {
            clearTimeout(timer)
            resolve()
          }, { once: true })
          element.addEventListener('error', () => {
            clearTimeout(timer)
            reject(new Error('视频无法解码，只支持 H.264 的 MP4'))
          }, { once: true })
        })
        const width = element.videoWidth
        const height = element.videoHeight
        if (!width || !height) throw new Error('视频没有画面')
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 2560 / width)
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        canvas.getContext('2d').drawImage(element, 0, 0, canvas.width, canvas.height)
        const frame = canvas.toDataURL('image/jpeg', 0.9)
        const preview = document.createElement('canvas')
        preview.width = 72
        preview.height = Math.max(1, Math.round((72 * height) / width))
        preview.getContext('2d').drawImage(element, 0, 0, preview.width, preview.height)
        const dataUrl = await readAsDataUrl(file)
        return {
          dataUrl,
          frame,
          palette: dominantColors(preview),
          meta: { width, height, durationMs: Math.round((Number.isFinite(element.duration) ? element.duration : 0) * 1000), bytes: file.size },
        }
      } finally {
        element.removeAttribute?.('src')
        element.load?.()
        URL.revokeObjectURL(url)
      }
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
.dsks-sources{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
.dsks-model{margin-left:auto}
.dsks-list{display:flex;flex-direction:column;gap:6px}
.dsks-row-wrap{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;transition:border-color .12s ease-out}
.dsks-row-wrap:hover{border-color:var(--dsw-alias-border-l3)}
.dsks-row-wrap[data-open]{border-color:var(--dsw-alias-brand-primary)}
.dsks-row-wrap[data-active]{border-left:2px solid var(--dsw-alias-brand-primary)}
.dsks-row{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:none;background:transparent;text-align:left;cursor:pointer;font:inherit;color:inherit}
.dsks-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsks-row-thumb{flex:none;width:52px;height:34px;border-radius:6px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
.dsks-row-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.dsks-row-text{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.dsks-row-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsks-row-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsks-row-swatches{flex:none;margin-top:0}
.dsks-row-chevron{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary);transition:transform .14s ease-out}
.dsks-row-chevron[data-open]{transform:rotate(180deg)}
.dsks-row-detail{padding:2px 12px 12px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:2px;padding-top:12px}
.dsks-swatches{display:flex;gap:3px;margin-top:2px}
.dsks-swatch{width:12px;height:12px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);display:inline-block}
.dsks-swatches-lg .dsks-swatch{width:20px;height:20px;border-radius:6px}
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
.dsks-import-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:480px){.dsks-import-choices{grid-template-columns:1fr}}
.dsks-choice{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:14px 14px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;transition:border-color .12s ease-out,background-color .12s ease-out}
.dsks-choice:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsks-choice:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsks-choice:disabled{opacity:.55;cursor:default}
.dsks-choice-title{font-size:13px;font-weight:500}
.dsks-choice-hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsks-fallback{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dsks-fallback summary{cursor:pointer;padding:2px 0}
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
.dsks-media-row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}
.dsks-media{position:relative;flex:1 1 140px;min-width:0;border-radius:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2)}
.dsks-media-image{display:block;width:100%;max-height:140px;object-fit:cover}
.dsks-media-tag{position:absolute;left:6px;bottom:6px;display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;line-height:16px}
.dsks-field{display:flex;align-items:center;gap:10px}
.dsks-field-label{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsks-select{flex:1;min-width:0;padding:7px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dsks-select:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsks-advanced summary{margin-bottom:6px}
.dsks-warn{color:var(--dsw-alias-state-warn-primary)}
.dsks-title{display:flex;align-items:baseline;gap:8px}
.dsks-version{margin:0;padding:0 4px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;font-weight:400;cursor:pointer;border-radius:6px}
.dsks-version:hover{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsks-version:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsks-version[data-update]{color:var(--dsw-alias-brand-primary);font-weight:500}
.dsks-about{display:flex;flex-direction:column;gap:6px}
.dsks-about-row{display:flex;align-items:baseline;gap:8px;font-size:13px}
.dsks-about-head{margin:10px 0 0;font-size:13px;font-weight:600}
.dsks-about-update{color:var(--dsw-alias-brand-primary);font-size:13px;font-weight:500;margin:0}
.dsks-about-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.dsks-video-layer{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.dsks-video-layer video{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .45s ease-out}
.dsks-video-layer[data-ready] video{opacity:1}
.dsks-video-veil{position:absolute;inset:0;display:block;pointer-events:none}
.dsks-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsks-switch-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsks-switch-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsks-switch-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dsks-switch-input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.dsks-switch-track{position:relative;flex:none;width:38px;height:22px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);transition:background-color .14s ease-out,border-color .14s ease-out}
.dsks-switch-thumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .14s ease-out,background-color .14s ease-out}
.dsks-switch-input:checked + .dsks-switch-track{background:var(--dsw-alias-brand-primary);border-color:transparent}
.dsks-switch-input:checked + .dsks-switch-track .dsks-switch-thumb{transform:translateX(16px);background:#fff}
.dsks-switch-input:focus-visible + .dsks-switch-track{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsks-shortcut,.dsks-video-state{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsks-shortcut-text,.dsks-video-state-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsks-keycaps{display:inline-flex;align-items:center;gap:4px;flex:none}
.dsks-keycap{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:24px;padding:0 7px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);font:inherit;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsks-keycap-plus{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px}
`

    /* ------------------------------------------------------------------ */
    /* plugin entry                                                        */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots'],
      /** Test seam: the row and detail card are unreachable from a static render. */
      __components: { SkinRow, SkinDetail, ImportDialog, Switch, VideoSettingsDialog, DesignDialog, AboutDialog },
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
        try {
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
        } catch (error) {
          // A failed registration used to vanish silently: the section simply
          // was not there after a restart, with nothing on screen to say why.
          console.error('[dsh-skin] 注册设置分区失败', error)
          try {
            if (typeof document !== 'undefined' && document.body) {
              const banner = document.createElement('div')
              banner.className = 'dsks-boot-error'
              banner.setAttribute('data-plugin', PLUGIN_ID)
              banner.textContent = `主题皮肤加载失败：${error instanceof Error ? error.message : String(error)}`
              document.body.append(banner)
            }
          } catch {
            /* the page is unusable anyway */
          }
        }
      },
    }

  },
})