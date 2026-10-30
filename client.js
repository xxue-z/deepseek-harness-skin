/**
 * @xxue-z/dsh-skin — Web client half.
 *
 * Two jobs:
 *   1. apply the selected wallpaper skin to the running app (alias tokens +
 *      a plugin-owned stylesheet for the wallpaper layer), and
 *   2. render the skin manager inside Settings → Theme Skins.
 *
 * The Host half owns the library; this half talks to it over `/skin/api`.
 */
window.__ModuleLoader__.load({
  id: '@xxue-z/dsh-skin',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PLUGIN_ID = '@xxue-z/dsh-skin'
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
        'action.rename': '重命名',
        'action.save': '保存',
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
        'about.check': '检查更新',
        'about.checking': '正在检查…',
        'about.updateAvailable': '有新版本 {version}',
        'about.upToDate': '已是最新（{version}）',
        'about.noRelease': '还没有发布版本',
        'about.install': '下载并更新',
        'about.downloading': '正在下载更新包…',
        'about.downloadingPercent': '正在下载更新包 {percent}%（{loaded} / {total}）',
        'about.downloadingSized': '正在下载更新包（已下载 {loaded}）',
        'about.installing': '正在替换文件…',
        'about.installed': '已更新，正在重新加载…',
        'about.openRelease': '打开发布页',
        'about.fetchFailed':
          '下载更新包失败：浏览器取不到 GitHub 上的 release 文件（常见原因：网络不通、需要代理，或浏览器拦截了跨域下载）。可以在浏览器里打开“打开发布页”，手动下载附件后重新安装。',
        'about.manualRestart': '文件已替换，请重启一次应用后生效（这是手动安装的目录，插件无法自更新）。',
        'about.updatedRestart': '文件已替换为 {to}，但正在运行的是 {from}：重启一次应用后版本号才会更新。',
        'about.pendingRestart': '{version} 已安装，重启应用后生效（当前运行的仍是旧版本）。',
        'about.retry': '可以再点一次「下载并更新」重试',
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
        'notice.renamed': '已重命名',
        'rename.title': '重命名主题',
        'rename.desc': '只改显示名称，id 和文件都不动；正在使用的主题也可以改。',
        'rename.placeholder': '新的主题名称',
        'rename.empty': '名称不能为空',
        'rename.rescanHint': '从 Codex 主题导入的皮肤，下次「扫描本机主题」会用主题包里的名字覆盖回去。',
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
        /* advanced settings: folder playlist */
        'playlist.advanced': '高级设置',
        'playlist.advancedHint': '视频列表：按文件夹顺序播放一组视频，覆盖当前主题自带的动态背景。',
        'playlist.enable': '启动注入视频列表',
        'playlist.enableHint': '启用后向当前主题注入视频标签（静态主题也一样）；关闭即移除，恢复主题原样。每次启动客户端都会自动关闭，需要时用快捷键或在设置里再打开。',
        'playlist.shortcut': '视频列表开关',
        'playlist.shortcutHint': '任意界面按一下即可开关；也可以在「设置 → 快捷键」里改键位。',
        'playlist.folder': '视频列表文件夹',
        'playlist.folderHint': '按文件夹里的顺序循环播放；新增或删除文件会自动生效。',
        'playlist.folderEmpty': '还没有选择文件夹',
        'playlist.choose': '选择…',
        'playlist.open': '打开',
        'playlist.speed': '播放倍速',
        'playlist.pip': '小窗口播放（画中画）',
        'playlist.pipHint': '把背景视频放进系统级的小窗口；切换或关闭视频列表时自动退出画中画。',
        'playlist.pipUnsupported': '当前浏览器不支持画中画，此项不可用。',
        'playlist.pipUnsupportedShort': '当前浏览器不支持画中画',
        'playlist.history': '历史播放文件夹',
        'playlist.historyHint': '双击直接使用该文件夹。',
        'playlist.historyEmpty': '还没有历史记录，选择一次文件夹后会出现在这里。',
        'playlist.historyUse': '使用',
        'playlist.historyCurrent': '当前',
        'playlist.position': '播放进度',
        'playlist.positionIdle': '已关闭',
        'playlist.positionWaiting': '先选择一个视频列表文件夹',
        'playlist.positionNoFolder': '未选择文件夹',
        'playlist.positionEmpty': '这个文件夹里没有视频文件',
        'playlist.positionOf': '第 {i}/{n} 个 · {name}',
        'playlist.positionError': '无法读取文件夹：{message}',
        'playlist.prev': '上一个',
        'playlist.next': '下一个',
        'playlist.none': '还没有播放',
        'notice.playlistOn': '视频列表已开启',
        'notice.playlistOff': '视频列表已关闭',
        'notice.playlistEmpty': '文件夹里没有视频文件',
        'notice.playlistFailed': '无法读取这个文件夹',
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
        'action.rename': 'Rename',
        'action.save': 'Save',
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
        'about.check': 'Check for updates',
        'about.checking': 'Checking…',
        'about.updateAvailable': 'Version {version} is available',
        'about.upToDate': 'Up to date ({version})',
        'about.noRelease': 'No release published yet',
        'about.install': 'Download and update',
        'about.downloading': 'Downloading the update…',
        'about.downloadingPercent': 'Downloading the update — {percent}% ({loaded} / {total})',
        'about.downloadingSized': 'Downloading the update ({loaded})',
        'about.installing': 'Replacing files…',
        'about.installed': 'Updated — reloading…',
        'about.openRelease': 'Open release',
        'about.fetchFailed':
          'Could not download the release asset: the browser could not reach GitHub (network/proxy, or the download was blocked). Open the release page and install the attached bundle by hand instead.',
        'about.manualRestart': 'Files were replaced. Restart the app once to load them — this install is a directory the plugin cannot restart by itself.',
        'about.updatedRestart': 'Files were replaced with {to}, but {from} is still running: restart the app once and the version will update.',
        'about.pendingRestart': '{version} is installed — restart the app to use it (the old build is still running).',
        'about.retry': 'click “Download and update” again to retry',
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
        'notice.renamed': 'Renamed',
        'rename.title': 'Rename theme',
        'rename.desc': 'Only the display name changes; the id and the files stay as they are, and the active theme can be renamed too.',
        'rename.placeholder': 'New theme name',
        'rename.empty': 'The name cannot be empty',
        'rename.rescanHint': 'A skin imported from a Codex pack takes the pack’s own name back the next time you scan local themes.',
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
        /* advanced settings: folder playlist */
        'playlist.advanced': 'Advanced settings',
        'playlist.advancedHint': 'Video list: play a folder in order, replacing the theme’s own background video.',
        'playlist.enable': 'Inject the video list on start',
        'playlist.enableHint': 'Adds a video to the current theme — static themes too — and removes it again when switched off. It always starts switched off after a client restart; use the shortcut or this switch to turn it back on.',
        'playlist.shortcut': 'Video list shortcut',
        'playlist.shortcutHint': 'Press it from anywhere; you can rebind it in Settings → Shortcuts.',
        'playlist.folder': 'Video folder',
        'playlist.folderHint': 'Plays in the folder’s own order and picks up added or removed files.',
        'playlist.folderEmpty': 'No folder chosen yet',
        'playlist.choose': 'Choose…',
        'playlist.open': 'Open',
        'playlist.speed': 'Playback speed',
        'playlist.pip': 'Picture-in-picture',
        'playlist.pipHint': 'Puts the background video in a system window; leaving the video list exits it.',
        'playlist.pipUnsupported': 'This browser does not support picture-in-picture.',
        'playlist.pipUnsupportedShort': 'Picture-in-picture is unsupported here',
        'playlist.history': 'Recent folders',
        'playlist.historyHint': 'Double-click a folder to use it again.',
        'playlist.historyEmpty': 'Nothing here yet — folders appear after you choose them.',
        'playlist.historyUse': 'Use',
        'playlist.historyCurrent': 'Current',
        'playlist.position': 'Playback position',
        'playlist.positionIdle': 'Off',
        'playlist.positionWaiting': 'Choose a video folder first',
        'playlist.positionNoFolder': 'No folder selected',
        'playlist.positionEmpty': 'No video files in this folder',
        'playlist.positionOf': '{i}/{n} · {name}',
        'playlist.positionError': 'Cannot read the folder: {message}',
        'playlist.prev': 'Previous',
        'playlist.next': 'Next',
        'playlist.none': 'Not started',
        'notice.playlistOn': 'Video list on',
        'notice.playlistOff': 'Video list off',
        'notice.playlistEmpty': 'No video files in that folder',
        'notice.playlistFailed': 'Cannot read that folder',
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
     * Colour of the readability veil drawn over the artwork.
     *
     * Codex paints its scrims as `rgb(var(--ds-bg-rgb) / alpha)`: the theme's own
     * canvas colour, only made translucent. A fixed white veil washed dark
     * wallpapers grey, and a fixed black one crushed bright ones — following the
     * theme keeps text readable in either direction without guessing.
     */
    function veilColorFor(skin) {
      const canvas = skin.colors?.background
      const parsed = parseColor(canvas)
      if (!parsed) return '255, 255, 255'
      return `${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}`
    }

    /**
     * Strength of the veil.
     *
     * The poster and the video share it so switching between them never changes
     * the brightness of the background. A theme's `--ds-theme-image-dim` can
     * strengthen it on top of the visibility slider.
     */
    function veilAlphaFor(skin, transparency) {
      const visibility = Number.isFinite(transparency) ? Math.max(0, Math.min(100, transparency)) : skin.transparency ?? 60
      const veil = (100 - visibility) / 100
      const declared = /--ds-theme-image-dim\s*:/i.test(skin.codex?.themeCss ?? skin.css ?? '')
      const extra = declared ? Math.max(0, Math.min(0.85, Number(skin.wallpaper?.dim) || 0)) : 0
      return Math.round(Math.min(1, veil + extra) * 1000) / 1000
    }

    function wallpaperCss(skin, transparency, hasInjectedBackground = false) {
      const rules = []
      if (skin.wallpaper?.url) {
        const alpha = veilAlphaFor(skin, transparency)
        const color = veilColorFor(skin)
        const scrim = alpha > 0 ? `linear-gradient(rgba(${color}, ${alpha}), rgba(${color}, ${alpha})), ` : ''
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
      // The folder playlist draws a background layer even when the theme has
      // neither wallpaper nor video (a static theme), so the app shell has to be
      // lifted above it there too. Without this the z-index:0 layer painted over
      // ordinary themes and hid the whole UI.
      const lifted = '#root{position:relative;z-index:1;}'
      if (hasInjectedBackground && !rules.includes(lifted)) rules.push(lifted)
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
      updateState: () => rootRequest('update/state'),
      /**
       * Ask the Host for the release bytes.
       *
       * The page cannot fetch them itself: both GitHub hops send no
       * `Access-Control-Allow-Origin`, so a cross-origin fetch is rejected as
       * "Failed to fetch" whatever the redirect handling. The Host is not
       * subject to CORS and answers from the page's own origin.
       *
       * @param {string} url the release asset URL from the update check
       * @param {{ expectedBytes?: number, onProgress?: (loaded: number, total: number | null) => void }} [options]
       * @returns {Promise<Uint8Array>}
       */
      downloadUpdate: async (url, options = {}) => {
        // Read `fetch` off the global at call time: the test suite swaps it,
        // and the module's entry-time binding would pin the original.
        const response = await globalThis.fetch(`${ROOT}/update/download`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        if (!response.ok) {
          // An error comes back as JSON; the success path is raw bytes.
          let message = `下载失败（HTTP ${response.status}）`
          try {
            const payload = await response.json()
            if (payload?.error) message = payload.error
          } catch {
            /* not JSON: keep the status message */
          }
          throw new Error(message)
        }
        // The release asset knows its own size from the update check, which is
        // the only total available when the Host streams without a length.
        const declared = Number(response.headers?.get?.('content-length'))
        const expected = Number.isFinite(options.expectedBytes) && options.expectedBytes > 0 ? options.expectedBytes : null
        const total = Number.isFinite(declared) && declared > 0 ? declared : expected
        const body = response.body
        if (!body || typeof body.getReader !== 'function') {
          const bytes = new Uint8Array(await response.arrayBuffer())
          // No stream to watch: the whole body lands at once, so the total is
          // only the asset size the update check reported.
          options.onProgress?.(bytes.byteLength, expected)
          return bytes
        }
        const reader = body.getReader()
        const chunks = []
        let loaded = 0
        options.onProgress?.(0, total)
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          loaded += value.byteLength
          options.onProgress?.(loaded, total)
        }
        const bytes = new Uint8Array(loaded)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        options.onProgress?.(loaded, total ?? loaded)
        return bytes
      },
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
      /* folder playlist */
      videos: (folder) => request(`videos${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`),
      playlistSettings: (patch) => request('playlist-settings', { method: 'POST', body: JSON.stringify(patch ?? {}) }),
      setPlaylistEnabled: (enabled) => request('playlist-enabled', { method: 'POST', body: JSON.stringify({ enabled }) }),
      trackPlaylist: (state) => request('playlist-track', { method: 'POST', body: JSON.stringify(state ?? {}) }),
      useHistory: (path) => request('playlist-history', { method: 'POST', body: JSON.stringify({ path }) }),
      pickFolder: (initial) => request('pick-folder', { method: 'POST', body: JSON.stringify({ initial: initial ?? '', description: '选择视频列表文件夹' }) }),
      openFolder: (path) => request('open-folder', { method: 'POST', body: JSON.stringify({ path }) }),
      refreshVideo: (id) => request('refresh-video', { method: 'POST', body: JSON.stringify({ id }) }),
      delete: (id) => request('delete', { method: 'POST', body: JSON.stringify({ id }) }),
      recolor: (id, palette) => request('recolor', { method: 'POST', body: JSON.stringify({ id, palette }) }),
      releaseVideo: (id) => request('release-video', { method: 'POST', body: JSON.stringify({ id }) }),
      rename: (id, name) => request('rename', { method: 'POST', body: JSON.stringify({ id, name }) }),
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
      /**
       * The one background video of the app.
       *
       * A theme's own MP4 and a folder-playlist clip never coexist: whichever
       * `playbackFor()` names is what this element plays, so the keyboard, the
       * mute switch, and the teardown path all act on a single element.
       */
      const video = {
        layer: null,
        element: null,
        /**
         * What is mounted: `{ kind: 'theme', skinId }` or
         * `{ kind: 'playlist', index, url, name, signature }`.
         */
        source: null,
        failed: false,
        userPaused: false,
        manualStarted: false,
        /** Playlist index whose resume point the element still has to seek to. */
        resumeIndex: null,
      }
      /** Shortcut ids this plugin owns, and whether each registered. */
      const shortcutState = { 'skin.toggleVideo': false, 'skin.togglePlaylist': false }
      let motionQuery = null
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(`${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`)
      const SHORTCUT_ID = 'skin.toggleVideo'
      const PLAYLIST_SHORTCUT_ID = 'skin.togglePlaylist'
      /** Same-page resume slot: survives a reload, unlike the Host's switch. */
      const PLAYLIST_RESUME_KEY = 'dsh-skin.playlist'

      /**
       * Folder playlist.
       *
       * The switch is not stored anywhere durable: the Host answers `enabled`
       * per process, and a restart flips it back to false on its own.
       */
      const playlist = {
        settings: { folder: '', speed: 1, pictureInPicture: false, history: [] },
        enabled: false,
        loading: false,
        videos: [],
        order: [],
        index: 0,
        /** Seconds into the current clip that were restored, not yet applied. */
        resumeSecond: 0,
        tracked: null,
        error: null,
      }
      let trackTimer = null
      let lastTracked = ''

      /** The skin currently applied, or null when no skin is in use. */
      function currentSkin() {
        return snapshot?.themes?.find((skin) => skin.id === appliedId) ?? null
      }

      /**
       * What the background layer should show right now, or null for nothing.
       *
       * This is the single place that decides between "the theme's own MP4" and
       * "the current clip of the folder playlist"; `mountVideo` and
       * `toggleVideo` both read it, so the two never stack.
       *
       * @returns {{ kind: 'theme', skinId: string, url: string, loop: boolean, playlist: false } | { kind: 'playlist', skinId: string, index: number, url: string, name: string, signature: string, loop: boolean, playlist: true } | null}
       */
      function playbackFor(skin) {
        if (!skin) return null
        const themeVideo = skin.video?.url ? { url: skin.video.url, loop: true } : null
        if (playlist.enabled && playlist.videos.length > 0) {
          const index = Math.min(Math.max(playlist.index, 0), playlist.videos.length - 1)
          const entry = playlist.videos[index]
          if (entry?.url) {
            return {
              kind: 'playlist',
              skinId: skin.id,
              index,
              url: entry.url,
              name: entry.name,
              signature: playlist.order[index] ?? '',
              loop: playlist.videos.length === 1,
              playlist: true,
            }
          }
        }
        if (!themeVideo) return null
        // The playlist had something and could not produce a clip: say so, but
        // still paint the theme's own video instead of an empty layer.
        return { kind: 'theme', skinId: skin.id, url: themeVideo.url, loop: true, playlist: false }
      }

      /**
       * Keycaps the shortcut row shows for one command, read back from the
       * app's registry so a rebind in Settings → Shortcuts shows up here.
       */
      function shortcutKeys(id = SHORTCUT_ID) {
        try {
          const service = ctx.get('shortcuts')
          const rows = service?.catalog?.getSnapshot?.() ?? []
          const row = rows.find((entry) => entry.id === id)
          if (row && Array.isArray(row.keys) && row.keys.length > 0) return row.keys
        } catch {
          /* no shortcut service in this build */
        }
        const mac = id === PLAYLIST_SHORTCUT_ID ? ['⌘', '⌥', 'L'] : ['⌘', '⌥', 'P']
        const other = id === PLAYLIST_SHORTCUT_ID ? ['Ctrl', '+', 'Alt', '+', 'L'] : ['Ctrl', '+', 'Alt', '+', 'P']
        return isMac ? mac : other
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

      /** Whether the current playback source should be on screen right now. */
      function shouldPlay(skin) {
        if (!playbackFor(skin) || video.failed) return false
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
        if (result && typeof result.then === 'function') result.then(() => enterPictureInPicture()).catch(() => {})
      }

      function destroyVideo() {
        const layer = video.layer
        const element = video.element
        video.layer = null
        video.element = null
        video.source = null
        video.resumeIndex = null
        if (element) {
          try {
            element.pause()
          } catch {
            /* already detached */
          }
          // Dropping the sources and calling load() is what tells Chromium to
          // throw away the media buffer, and with it the byte-range responses it
          // still holds open on the file.
          try {
            element.removeAttribute('src')
            element.load?.()
          } catch {
            /* already detached */
          }
        }
        // The browser-side buffer can linger after the element is gone, which on
        // Windows keeps video.mp4 locked until the app exits. Ask the Host to
        // release the last handle for the theme that just stopped playing.
        releaseVideoHandle()
        try {
          layer?.remove()
        } catch {
          /* already detached */
        }
      }

      /** Tell the Host to drop any OS-level handle on the last video's file. */
      function releaseVideoHandle() {
        const id = appliedId
        if (typeof id !== 'string') return
        api
          .releaseVideo(id)
          .then((payload) => {
            // The Host answers "released" or "inUse" (the browser still holds
            // it). A still-locked file retries once after the element teardown
            // has actually been applied by the renderer.
            if (payload?.lock === 'inUse') setTimeout(() => api.releaseVideo(id).catch(() => {}), 700)
          })
          .catch(() => {})
      }

      function mountVideo(skin, source) {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function' || document.body === undefined) return
        destroyVideo()
        const layer = document.createElement('div')
        layer.className = 'dsks-video-layer'
        layer.setAttribute('data-plugin', PLUGIN_ID)
        layer.setAttribute('data-source', source.kind)
        layer.setAttribute('aria-hidden', 'true')
        const element = document.createElement('video')
        element.muted = videoSettings.muted !== false
        element.loop = source.loop === true
        element.playsInline = true
        element.preload = 'auto'
        element.setAttribute('playsinline', '')
        // The native controls would sit on top of the UI and pause/seek the
        // wallpaper; picture-in-picture is enabled separately, by switch.
        element.setAttribute('disablepictureinpicture', '')
        element.setAttribute('disableremoteplayback', '')
        element.setAttribute('aria-hidden', 'true')
        element.setAttribute('data-source', source.kind)
        const x = Math.round((skin.wallpaper?.focusX ?? 0.5) * 100)
        const y = Math.round((skin.wallpaper?.focusY ?? 0.5) * 100)
        if (element.style) element.style.objectPosition = `${x}% ${y}%`
        if (playlist.settings.speed && Number.isFinite(playlist.settings.speed)) element.playbackRate = playlist.settings.speed
        element.src = source.url
        const veil = document.createElement('span')
        veil.className = 'dsks-video-veil'
        layer.append(element, veil)
        element.addEventListener('loadeddata', () => {
          layer.setAttribute('data-ready', '')
          if (source.kind === 'playlist') applyResumeTime(element)
        })
        element.addEventListener('error', () => {
          // Ignore the teardown itself: clearing `src` and calling `load()` must
          // not poison the next mount with a permanent failure flag.
          if (video.element !== element) return
          // A missing or undecodable clip in the playlist is skipped; the theme
          // video failing means "no background", as before.
          if (source.kind === 'playlist' && playlist.videos.length > 1) {
            destroyVideo()
            emit()
            advancePlaylist(1)
            return
          }
          video.failed = true
          destroyVideo()
          emit()
        })
        if (source.kind === 'playlist') {
          element.addEventListener('ended', () => {
            if (video.element !== element) return
            advancePlaylist(1)
          })
          element.addEventListener('timeupdate', () => {
            if (video.element !== element) return
            syncResumeSecond(element)
          })
          element.addEventListener('pause', () => {
            if (video.element !== element) return
            syncResumeSecond(element)
            scheduleTrack()
          })
          element.addEventListener('play', () => {
            if (video.element !== element) return
            enterPictureInPicture()
          })
        }
        document.body.append(layer)
        video.layer = layer
        video.element = element
        video.source = source.kind === 'playlist' ? { kind: 'playlist', index: source.index, url: source.url, name: source.name, signature: source.signature } : { kind: 'theme', skinId: skin.id }
        if (source.kind === 'playlist') video.resumeIndex = source.index
      }

      /** Seek to the restored position once the clip is decodable. */
      function applyResumeTime(element) {
        const second = playlist.resumeSecond
        if (!Number.isFinite(second) || second <= 0) return
        let duration = Number(element.duration)
        if (!Number.isFinite(duration) || duration <= 0) duration = Infinity
        const target = Math.min(second, Math.max(0, duration - 1))
        try {
          element.currentTime = target
        } catch {
          /* not seekable yet */
        }
        playlist.resumeSecond = 0
        syncResumeSecond(element)
      }

      /** Mirror the element's position into the playlist state. */
      function syncResumeSecond(element) {
        const current = Number(element.currentTime)
        if (!Number.isFinite(current)) return
        playlist.resumeSecond = Math.max(0, Math.round(current * 10) / 10)
        writeLocalResume()
      }

      function paintVeil(skin, transparency) {
        const veil = video.layer?.querySelector?.('.dsks-video-veil')
        if (!veil || !veil.style) return
        // Same colour as the poster veil, so a video plays on the same tone the
        // still would have had.
        veil.style.background = `rgba(${veilColorFor(skin)}, ${veilAlphaFor(skin, transparency)})`
      }

      function syncVideo(skin, transparency) {
        const source = playbackFor(skin)
        // Keep the theme sheet in step with the playlist: a static theme needs
        // #root lifted while a clip is injected, and the rule must go away with
        // the clip so the original theme is left exactly as it was.
        writeWallpaper(skin, transparency)
        if (!source || !shouldPlay(skin)) {
          destroyVideo()
          return
        }
        const mounted = video.source
        const same =
          mounted &&
          mounted.kind === source.kind &&
          (source.kind === 'theme' ? mounted.skinId === source.skinId : mounted.index === source.index && mounted.url === source.url)
        if (!same) mountVideo(skin, source)
        paintVeil(skin, transparency)
        if (video.element && video.element.paused) attemptPlay(video.element)
        applyPictureInPicturePreference()
      }

      /** Play/pause whatever background is mounted; also the shortcut's handler. */
      function toggleVideo() {
        const skin = currentSkin()
        const source = playbackFor(skin)
        if (!source) return { playing: false, hasVideo: false }
        const playing = Boolean(video.element) && !video.element.paused
        if (playing) {
          video.userPaused = true
          try {
            video.element.pause()
          } catch {
            /* already detached */
          }
          if (video.element) syncResumeSecond(video.element)
          scheduleTrack()
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

      /* ---------------------------------------------------------------- */
      /* folder playlist (advanced settings)                               */
      /* ---------------------------------------------------------------- */

      /**
       * Load the folder listing and locate the clip to resume on.
       *
       * The Host stores "the third clip" as its name+size+mtime signature, so
       * adding or removing files ahead of it does not shift the resume point;
       * a deleted clip falls back to the old index, clamped to the new list.
       */
      async function loadPlaylist() {
        const folder = playlist.settings.folder
        playlist.error = null
        if (!folder) {
          playlist.videos = []
          playlist.order = []
          playlist.index = 0
          playlist.resumeSecond = 0
          if (playlist.enabled) playlist.error = 'empty'
          return playlist
        }
        playlist.loading = true
        emit()
        try {
          const payload = await api.videos(folder)
          const videos = Array.isArray(payload.videos) ? payload.videos : []
          const order = Array.isArray(payload.order) ? payload.order : []
          const tracked = playlist.tracked
          let index = 0
          let second = 0
          if (tracked && sameFolder(tracked.folder, folder)) {
            const found = tracked.signature ? order.indexOf(tracked.signature) : -1
            index = found >= 0 ? found : Math.max(0, Math.min(Number(tracked.index) || 0, Math.max(0, videos.length - 1)))
            second = found >= 0 || !tracked.signature ? Number(tracked.second) || 0 : 0
          }
          // A reload inside the same page may still know where it was, even
          // when the Host has no position for this folder yet.
          const local = readLocalResume()
          if (second <= 0 && local && sameFolder(local.folder, folder)) {
            const found = local.signature ? order.indexOf(local.signature) : -1
            if (found >= 0) {
              index = found
              second = Number(local.second) || 0
            }
          }
          playlist.videos = videos
          playlist.order = order
          playlist.index = index
          playlist.resumeSecond = Number.isFinite(second) ? second : 0
          playlist.error = videos.length === 0 ? 'empty' : null
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          playlist.error = message
          playlist.videos = []
          playlist.order = []
        } finally {
          playlist.loading = false
        }
        return playlist
      }

      function sameFolder(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false
        return a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase()
      }

      function readLocalResume() {
        try {
          const raw = window.sessionStorage?.getItem?.(PLAYLIST_RESUME_KEY)
          if (!raw) return null
          const value = JSON.parse(raw)
          return value && typeof value === 'object' ? value : null
        } catch {
          return null
        }
      }

      function writeLocalResume() {
        const entry = playlist.videos[playlist.index]
        if (!entry) return
        try {
          window.sessionStorage?.setItem?.(
            PLAYLIST_RESUME_KEY,
            JSON.stringify({ folder: playlist.settings.folder, signature: playlist.order[playlist.index] ?? '', second: playlist.resumeSecond }),
          )
        } catch {
          /* private mode or quota */
        }
      }

      /** Report the position to the Host at most once a second. */
      function scheduleTrack() {
        if (trackTimer !== null) return
        trackTimer = setTimeout(() => {
          trackTimer = null
          void trackPlaylist()
        }, 1000)
      }

      async function trackPlaylist({ force = false } = {}) {
        const entry = playlist.videos[playlist.index]
        if (!entry) return
        // The final write happens while the switch still reads off (the Host
        // saves the resume point as it flips), so `force` bypasses this guard
        // and the per-second de-duplication below.
        if (!force && !playlist.enabled) return
        const signature = playlist.order[playlist.index] ?? ''
        const stamp = `${signature}|${Math.floor(playlist.resumeSecond)}`
        if (!force && stamp === lastTracked) return
        lastTracked = stamp
        try {
          const payload = await api.trackPlaylist({
            folder: playlist.settings.folder,
            signature,
            index: playlist.index,
            second: playlist.resumeSecond,
          })
          if (payload?.tracked) playlist.tracked = payload.tracked
        } catch {
          lastTracked = '' // retry on the next event
        }
      }

      /** Move by one clip (wrapping at both ends) and start it. */
      function advancePlaylist(step) {
        const total = playlist.videos.length
        playlist.index = total === 0 ? 0 : ((playlist.index + step) % total + total) % total
        playlist.resumeSecond = 0
        writeLocalResume()
        scheduleTrack()
        const skin = currentSkin()
        if (skin) {
          destroyVideo()
          syncVideo(skin, skin.transparency)
        }
        emit()
        return true
      }

      /** Replace the folder and start it from the beginning (or its saved point). */
      async function chooseFolder(folder) {
        playlist.settings = { ...playlist.settings, folder }
        playlist.tracked = { folder, signature: '', index: 0, second: 0 }
        await refreshPlaylist()
        return playlist.settings.folder
      }

      function applySpeed(value) {
        if (video.element) {
          try {
            video.element.playbackRate = value
          } catch {
            /* element gone */
          }
        }
      }

      /* picture in picture ------------------------------------------------- */

      function isPictureInPictureAvailable() {
        try {
          return typeof document !== 'undefined' && document.pictureInPictureEnabled === true && typeof document.createElement === 'function'
        } catch {
          return false
        }
      }

      function applyPictureInPicturePreference() {
        if (playlist.settings.pictureInPicture !== true) exitPictureInPicture()
        else if (video.element && !video.element.paused) enterPictureInPicture()
      }

      function enterPictureInPicture() {
        if (playlist.settings.pictureInPicture !== true) return
        const element = video.element
        if (!element || typeof element.requestPictureInPicture !== 'function') return
        try {
          if (document.pictureInPictureElement === element) return
          const result = element.requestPictureInPicture()
          // No user gesture yet: the next play() tries again.
          if (result && typeof result.catch === 'function') result.catch(() => {})
        } catch {
          /* not allowed on this platform or at this moment */
        }
      }

      function exitPictureInPicture() {
        try {
          if (document.pictureInPictureElement && typeof document.exitPictureInPicture === 'function') void document.exitPictureInPicture().catch?.(() => {})
        } catch {
          /* nothing in picture in picture */
        }
      }

      async function updatePlaylistSettings(patch) {
        const input = patch && typeof patch === 'object' ? patch : {}
        const before = playlist.settings.folder
        const next = { ...playlist.settings, ...input }
        playlist.settings = next
        if (typeof input.speed === 'number') applySpeed(next.speed)
        if (typeof input.pictureInPicture === 'boolean') applyPictureInPicturePreference()
        if (snapshot?.playlist) snapshot = { ...snapshot, playlist: { ...snapshot.playlist, ...input, enabled: playlist.enabled } }
        emit()
        try {
          const payload = await api.playlistSettings(input)
          const saved = payload?.playlist ?? null
          if (saved) {
            const { position: _position, ...preferences } = saved
            playlist.settings = { ...playlist.settings, ...preferences }
          }
          // Only the folder moves the playback position; speed and PiP leave it.
          const after = playlist.settings.folder
          if (after !== before) {
            // The Host resets it too (the folder changed on its side), so start
            // the new folder at its first clip. Re-selecting a remembered folder
            // goes through `chooseHistory`, which restores the stored position.
            playlist.tracked = { folder: after, signature: '', index: 0, second: 0 }
          }
          if (payload?.snapshot) applySnapshot(payload.snapshot)
          if (after !== before) await refreshPlaylist()
        } catch (error) {
          console.error('[dsh-skin] 保存视频列表设置失败', error)
          throw error
        }
        return { ...playlist.settings }
      }

      /** Re-read the folder, then re-sync the mounted video. */
      async function refreshPlaylist() {
        // Read the folder even while the switch is off: the settings sheet shows
        // the clip count, and turning the switch on must not wait for a listing.
        await loadPlaylist()
        const skin = currentSkin()
        if (skin) syncVideo(skin, skin.transparency ?? 60)
        emit()
        return playlist
      }

      /**
       * Turn the injection on or off.
       *
       * On: read the folder and mount the clip to resume on. Off: tear the
       * element down; a theme with its own MP4 gets it back, a static theme ends
       * up with no video at all.
       */
      async function setPlaylistEnabled(enabled) {
        const next = enabled === true
        // Re-enabling an already-on switch still re-reads the folder, so it works
        // as a refresh; turning off an off switch is a no-op.
        if (next === playlist.enabled && !next) {
          emit()
          return playlist.enabled
        }
        if (!next) {
          // Report the final position *before* the Host flips to off: it saves
          // the resume point while the switch is still on its side too.
          if (video.element && video.source?.kind === 'playlist') syncResumeSecond(video.element)
          await trackPlaylist({ force: true })
        }
        playlist.enabled = next
        emit()
        try {
          await api.setPlaylistEnabled(next)
        } catch (error) {
          console.error('[dsh-skin] 保存视频列表开关失败', error)
        }
        if (next) {
          await loadPlaylist()
        } else {
          exitPictureInPicture()
          if (trackTimer !== null) {
            clearTimeout(trackTimer)
            trackTimer = null
          }
        }
        const skin = currentSkin()
        if (skin) {
          destroyVideo()
          syncVideo(skin, skin.transparency ?? 60)
        }
        emit()
        return playlist.enabled
      }

      async function togglePlaylist() {
        const enabled = await setPlaylistEnabled(!playlist.enabled)
        return { enabled, count: playlist.videos.length, error: playlist.error }
      }

      function getPlaylistState() {
        const entry = playlist.videos[playlist.index] ?? null
        return {
          enabled: playlist.enabled,
          loading: playlist.loading,
          error: playlist.error,
          folder: playlist.settings.folder,
          settings: { ...playlist.settings },
          videos: playlist.videos.slice(),
          order: playlist.order.slice(),
          index: playlist.index,
          count: playlist.videos.length,
          name: entry?.name ?? null,
          second: playlist.resumeSecond,
          pictureInPictureAvailable: isPictureInPictureAvailable(),
          pictureInPicture: playlist.settings.pictureInPicture === true,
          playing: Boolean(video.element) && !video.element.paused,
          source: video.source?.kind ?? null,
        }
      }

      /** Pick a folder with the OS dialog; the Host remembers it on the way back. */
      async function pickPlaylistFolder() {
        const payload = await api.pickFolder(playlist.settings.folder)
        if (!payload?.path) return null
        playlist.settings = { ...playlist.settings, ...(payload.playlist ?? {}), folder: payload.path, position: undefined }
        playlist.tracked = { folder: payload.path, signature: '', index: 0, second: 0 }
        if (payload.snapshot) applySnapshot(payload.snapshot)
        await refreshPlaylist()
        return payload.path
      }

      /** Use a remembered folder (double-click in the history list). */
      async function chooseHistory(path) {
        const payload = await api.useHistory(path)
        if (payload?.playlist) playlist.settings = { ...playlist.settings, ...payload.playlist, position: undefined }
        playlist.tracked = { folder: payload?.playlist?.folder ?? path, signature: '', index: 0, second: 0 }
        if (payload?.snapshot) applySnapshot(payload.snapshot)
        await refreshPlaylist()
        return payload?.playlist?.folder ?? path
      }

      /** Open the playlist folder in Explorer / Finder. */
      async function openPlaylistFolder(path) {
        return api.openFolder(path ?? playlist.settings.folder)
      }

      function onVisibilityChange() {
        const skin = currentSkin()
        if (!playbackFor(skin)) return
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          try {
            video.element?.pause()
          } catch {
            /* already detached */
          }
          if (video.element) syncResumeSecond(video.element)
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

      function onPageHide() {
        if (video.element && video.source?.kind === 'playlist') syncResumeSecond(video.element)
        void trackPlaylist()
        exitPictureInPicture()
      }

      function shortcutBinding(id, platform) {
        const mac = platform === 'macos'
        return { code: id === PLAYLIST_SHORTCUT_ID ? 'KeyL' : 'KeyP', modifiers: mac ? ['meta', 'alt'] : ['control', 'alt'] }
      }

      /** Register one play/pause or playlist command with the app's registry. */
      function registerCommand(service, id, labelKey, aliases, run) {
        if (!service?.register || shortcutState[id]) return null
        try {
          const disposer = service.register({
            id,
            label: () => translate(ctx, labelKey),
            aliases,
            defaults: {
              'desktop:macos': shortcutBinding(id, 'macos'),
              'desktop:windows': shortcutBinding(id, 'windows'),
              'desktop:linux': shortcutBinding(id, 'linux'),
              'web:macos': shortcutBinding(id, 'macos'),
              'web:windows': shortcutBinding(id, 'windows'),
            },
            regions: ['page', 'editable', 'terminal'],
            modals: [],
            resolve: () => ({
              status: 'handled',
              run: () => {
                run()
              },
            }),
          })
          shortcutState[id] = true
          return disposer
        } catch (error) {
          console.warn(`[dsh-skin] 注册快捷键失败：${id}`, error)
          return null
        }
      }

      function registerShortcut(service) {
        return registerCommand(service, SHORTCUT_ID, 'video.shortcut', ['dynamic background', 'play pause'], () => {
          toggleVideo()
        })
      }

      function registerPlaylistShortcut(service) {
        return registerCommand(service, PLAYLIST_SHORTCUT_ID, 'playlist.shortcut', ['playlist', 'video list'], () => {
          void togglePlaylist()
        })
      }

      /** Fallback for builds without the shortcut registry: window-level keydown. */
      function installFallbackShortcut() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
        const onKeyDown = (event) => {
          if (shortcutState[SHORTCUT_ID] && shortcutState[PLAYLIST_SHORTCUT_ID]) return
          if (!event.altKey || event.shiftKey) return
          if (!(isMac ? event.metaKey : event.ctrlKey)) return
          const key = String(event.key ?? '').toLowerCase()
          const togglePlayback = (event.code === 'KeyP' || key === 'p') && !shortcutState[SHORTCUT_ID]
          const toggleList = (event.code === 'KeyL' || key === 'l') && !shortcutState[PLAYLIST_SHORTCUT_ID]
          if (!togglePlayback && !toggleList) return
          const target = event.target
          if (target && typeof target.closest === 'function' && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))) return
          event.preventDefault?.()
          if (toggleList) void togglePlaylist()
          else toggleVideo()
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }

      function startShortcut() {
        const disposers = [installFallbackShortcut()]
        const registerAll = (service) => {
          for (const disposer of [registerShortcut(service), registerPlaylistShortcut(service)]) if (disposer) disposers.push(disposer)
        }
        let service = null
        try {
          service = ctx.get('shortcuts')
        } catch {
          service = null
        }
        if (service) {
          registerAll(service)
        } else if (typeof ctx.inject === 'function') {
          // The shortcuts plugin may mount after this one; inject waits for it.
          ctx.inject(['shortcuts'], (shortcutCtx) => {
            shortcutCtx.effect(() => {
              const owned = []
              for (const disposer of [registerShortcut(shortcutCtx.shortcuts), registerPlaylistShortcut(shortcutCtx.shortcuts)]) {
                if (disposer) owned.push(disposer)
              }
              return () => {
                for (const dispose of owned.reverse()) {
                  try {
                    dispose()
                  } catch {
                    /* already disposed */
                  }
                }
              }
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
        // Pass the playlist state so a static theme gets its #root lifted too;
        // the video layer itself stays at z-index 0 like every other background.
        element.textContent = skin ? wallpaperCss(skin, transparency, backgroundIsInjected()) : ''
      }

      /**
       * Whether a background layer will be on screen that the theme's own sheet
       * does not already account for: the folder playlist drawing a clip on a
       * theme with no wallpaper and no MP4.
       */
      function backgroundIsInjected() {
        if (!playlist.enabled || playlist.videos.length === 0) return false
        const skin = currentSkin()
        return Boolean(skin) && !skin.wallpaper?.url && !skin.video?.url
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
          // Switching themes keeps the playlist position — that clip is not the
          // theme's, so it continues exactly where it was.
          if (video.source?.kind === 'theme' && video.source.skinId !== skin.id) {
            video.userPaused = false
            video.manualStarted = false
            video.failed = false
          }
          if (video.source?.kind === 'theme' || video.source === null) video.failed = false
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
        // The playlist switch is owned by the Host process, so a snapshot is the
        // truth about it: a restart arrives as `enabled: false` and the injected
        // video is torn down on the next sync.
        if (next.playlist && typeof next.playlist === 'object') {
          const { enabled, position: _position, ...preferences } = next.playlist
          playlist.settings = { ...playlist.settings, ...preferences }
          playlist.enabled = enabled === true
        }
        if (next.playlistStatus?.tracked && typeof next.playlistStatus.tracked === 'object') {
          playlist.tracked = { ...next.playlistStatus.tracked }
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
            await load()
            // The switch comes from the Host (off after a restart); read the
            // folder before the engine mounts anything, then re-sync so the
            // first clip — not the theme's own video — is what appears.
            if (playlist.enabled && playlist.settings.folder) {
              await loadPlaylist()
              const first = currentSkin()
              if (first) {
                destroyVideo()
                syncVideo(first, first.transparency ?? 60)
              }
            }
            const loaded = snapshot
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
        const onHide = () => onPageHide()
        try {
          if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('pagehide', onHide)
        } catch {
          /* no window */
        }
        return () => {
          cancelled = true
          disposeShortcut()
          try {
            if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('pagehide', onHide)
          } catch {
            /* no window */
          }
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
        /** Keycaps for one command; defaults to the play/pause shortcut. */
        getShortcutKeys: (id) => shortcutKeys(id),
        getPlaylistShortcutKeys: () => shortcutKeys(PLAYLIST_SHORTCUT_ID),
        subscribeShortcut,
        isShortcutRegistered: (id) => shortcutState[id ?? SHORTCUT_ID] === true,
        /* folder playlist */
        getPlaylistState,
        updatePlaylistSettings,
        refreshPlaylist,
        setPlaylistEnabled,
        togglePlaylist,
        nextPlaylist: () => advancePlaylist(1),
        prevPlaylist: () => advancePlaylist(-1),
        pickPlaylistFolder,
        chooseFolder,
        chooseHistory,
        openPlaylistFolder,
        isPictureInPictureAvailable,
        togglePictureInPicture() {
          if (document?.pictureInPictureElement) {
            exitPictureInPicture()
            return false
          }
          enterPictureInPicture()
          return true
        },
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
      edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 7.5l3 3',
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
                  onRename: () => setDialog('rename'),
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
        dialog === 'rename' && selected
          ? h(RenameDialog, {
              t,
              skin: selected,
              onClose: () => setDialog(null),
              onDone: (payload) => {
                if (payload.snapshot) runtime.applySnapshot(payload.snapshot)
                setDialog(null)
                setNotice({ kind: 'success', text: t('notice.renamed') })
              },
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
    function SkinRow({ skin, active, open, t, busy, draftTransparency, onToggle, onApply, onDeactivate, onDelete, onExport, onRecolor, onAttachVideo, onRename, onTransparency, onReset }) {
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
                onRename,
                onTransparency,
                onReset,
                onClose: onToggle,
                compact: true,
              }),
            )
          : null,
      )
    }

    function SkinDetail({ skin, active, t, busy, draftTransparency, onApply, onDeactivate, onDelete, onExport, onRecolor, onAttachVideo, onRename, onTransparency, onReset, onClose, compact = false }) {
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
          onRename ? h(Button, { icon: 'edit', onClick: onRename, busy: busy === 'rename' }, t('action.rename')) : null,
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
     *
     * The bytes come through the Host (`POST /skin/update/download`), not from
     * GitHub directly: neither GitHub hop sends a CORS header, so a page-level
     * fetch is rejected as "Failed to fetch" before any byte arrives.
     */
    /**
     * An error that says whether clicking again could help.
     *
     * A failed transfer is worth a retry; a bundle or a target directory the
     * Host refused will fail identically every time, and suggesting "click
     * again" there only wastes the user's click.
     *
     * @param {string} message
     * @param {boolean} retry
     */
    function errorWithRetry(message, retry) {
      const error = new Error(message)
      error.retry = retry
      return error
    }

    /**
     * Turn raw byte counts into what the progress bar shows.
     *
     * The percentage only exists when the total is known; without it the bar
     * stays indeterminate rather than inventing a number.
     *
     * @param {number} loaded
     * @param {number | null} total
     * @returns {{ percent: number | null, loaded: number, total: number | null }}
     */
    function toProgress(loaded, total) {
      const bytes = Number.isFinite(loaded) && loaded > 0 ? loaded : 0
      const size = Number.isFinite(total) && total > 0 ? total : null
      const raw = size === null ? null : Math.floor((bytes / size) * 100)
      return {
        // 100 is only reached once the bytes are actually all there.
        percent: raw === null ? null : bytes < size ? Math.max(0, Math.min(99, raw)) : 100,
        loaded: bytes,
        total: size,
      }
    }

    function formatMegabytes(bytes) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    function AboutDialog({ t, version, info, release, onChecked, onClose }) {
      // Key the state on the release it was opened with, so an update found at
      // startup is what the sheet shows on its first paint.
      const [check, setCheck] = useState(release)
      const [checking, setChecking] = useState(false)
      const [error, setError] = useState(null)
      const [phase, setPhase] = useState(null)
      const [manual, setManual] = useState(null)
      const [progress, setProgress] = useState({ percent: 0, loaded: 0, total: null })
      if (check === null && release !== null && release !== undefined) setCheck(release)
      // Something newer is already on disk but the process still runs the old
      // build: downloading again would only replace the same files.
      const pendingRestart = check?.pendingRestart === true || check?.alreadyInstalled === true
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
        setProgress({ percent: 0, loaded: 0, total: null })
        setError(null)
        let downloaded = false
        try {
          // Prefer the release asset the workflow built and verified; the
          // tag tarball stays as the fallback for a release without one.
          const url =
            check.asset?.url ??
            `https://codeload.github.com/${info.repository}/tar.gz/refs/tags/${encodeURIComponent(check.tag)}`
          let bytes
          try {
            bytes = await api.downloadUpdate(url, {
              expectedBytes: check.asset?.size ?? null,
              onProgress: (loaded, total) => setProgress(toProgress(loaded, total)),
            })
          } catch (failure) {
            // The Host reports why it could not reach GitHub; a bare "Failed to
            // fetch" only happens when the page cannot reach its own Host.
            throw errorWithRetry(`${t('about.fetchFailed')}（${failure instanceof Error ? failure.message : String(failure)}）`, false)
          }
          downloaded = true
          if (check.checksum?.url) {
            // Same CORS block as the bundle, so the Host fetches this too.
            const expected = new TextDecoder().decode(await api.downloadUpdate(check.checksum.url)).trim().split(/\s+/)[0]
            const digest = await sha256Hex(bytes)
            if (expected && digest.toLowerCase() !== expected.toLowerCase()) throw new Error('下载的更新包校验和不符，已取消安装')
          }
          setPhase('installing')
          const result = await api.installUpdate(bytes)
          setPhase('done')
          // A page reload is not enough: the Host read its version and its
          // modules once, at process start, so the version in Settings and the
          // Host routes stay on the old build until the app is restarted. Ask
          // for that restart instead of reloading into a half-updated app.
          const before = version
          const after = result?.version ?? null
          setManual(
            result?.restartMessage ??
              (after && after !== before
                ? `${t('about.updatedRestart', { from: before, to: after })}`
                : t('about.manualRestart')),
          )
          // Refresh the sheet's idea of the install so the download button
          // disappears at once: the files on disk are now the new release.
          try {
            const state = await api.updateState()
            setCheck((previous) =>
              previous === null
                ? previous
                : {
                    ...previous,
                    installed: state.diskVersion,
                    runningVersion: state.runningVersion,
                    pendingRestart: state.pendingRestart === true,
                    updateAvailable: previous.updateAvailable && state.pendingRestart !== true,
                    alreadyInstalled: state.pendingRestart === true,
                  },
            )
          } catch {
            /* the message above already says a restart is needed */
          }
        } catch (failure) {
          setPhase(null)
          const message = failure instanceof Error ? failure.message : String(failure)
          // The staged bytes are on disk once the download finished, so the
          // next click is free and worth suggesting — unless the bundle itself
          // is unusable, in which case retrying would fail the same way.
          const retry = failure?.retry !== false && downloaded
          setError(retry ? `${message}（${t('about.retry')}）` : message)
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
          check !== null
            ? h(
                'p',
                { className: pendingRestart ? 'dsks-hint dsks-warn' : check.updateAvailable ? 'dsks-about-update' : 'dsks-hint' },
                pendingRestart
                  ? t('about.pendingRestart', { version: check.installed ?? '' })
                  : check.updateAvailable
                    ? t('about.updateAvailable', { version: latest ?? check.tag ?? '' })
                    : check.latest
                      ? t('about.upToDate', { version: check.latest })
                      : t('about.noRelease'),
              )
            : null,
          // A manual install keeps the sheet open, and the action row has to
          // come back with it — otherwise a successful replace looks frozen.
          phase === 'done'
            ? h('p', { className: manual ? 'dsks-hint dsks-warn' : 'dsks-hint' }, manual ?? t('about.installed'))
            : phase !== null
              ? h(
                  'div',
                  { className: 'dsks-progress-block' },
                  h(
                    'p',
                    { className: 'dsks-hint' },
                    phase === 'downloading'
                      ? progress.percent === null
                        ? t('about.downloadingSized', { loaded: formatMegabytes(progress.loaded) })
                        : t('about.downloadingPercent', {
                            percent: progress.percent,
                            loaded: formatMegabytes(progress.loaded),
                            total: progress.total === null ? '' : formatMegabytes(progress.total),
                          })
                      : t('about.installing'),
                  ),
                  phase === 'downloading'
                    ? h(
                        'div',
                        { className: 'dsks-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': progress.percent ?? 0 },
                        h('div', { className: 'dsks-progress-fill', style: { width: `${progress.percent ?? 0}%` } }),
                      )
                    : null,
                )
              : null,
          error ? h('p', { className: 'dsks-error' }, error) : null,
          check?.error ? h('p', { className: 'dsks-hint dsks-warn' }, check.error) : null,
        ),
        h(
          'div',
          { className: 'dsks-about-actions' },
          h(Button, { onClick: run, busy: checking }, checking ? t('about.checking') : t('about.check')),
          // The button can only act while nothing newer is already on disk.
          // Judging that by the running version alone is what let it keep
          // offering — and re-downloading — a release that was installed
          // already, just not restarted into.
          check?.updateAvailable && !pendingRestart && phase !== 'downloading' && phase !== 'installing'
            ? h(Button, { variant: 'primary', icon: 'download', onClick: install }, t('about.install'))
            : null,
          check?.url ? h(Button, { onClick: () => window.open(check.url, '_blank', 'noopener') }, t('about.openRelease')) : null,
        ),
      )
    }

    function Switch({ id, checked, label, hint, disabled = false, onChange }) {
      return h(
        'label',
        { className: 'dsks-switch', htmlFor: id, 'data-disabled': disabled ? '' : undefined },
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
          disabled: Boolean(disabled),
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
      const [playlistKeys, setPlaylistKeys] = useState(() => runtime.getPlaylistShortcutKeys?.() ?? [])
      const [, setRevision] = useState(0)
      useEffect(
        () =>
          runtime.subscribeShortcut(() => {
            setKeys(runtime.getShortcutKeys())
            setPlaylistKeys(runtime.getPlaylistShortcutKeys?.() ?? [])
          }),
        [runtime],
      )
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
      // The playlist, when on, is what is actually on screen; the theme's own
      // MP4 then sits idle, so the state row has to describe the clip instead.
      const playlist = runtime.getPlaylistState?.() ?? null
      const fromPlaylist = Boolean(playlist?.enabled && playlist?.source === 'playlist')
      const meta = skin?.video
        ? t('video.meta', {
            w: skin.video.width,
            h: skin.video.height,
            s: Math.round((skin.video.durationMs ?? 0) / 100) / 10,
            mb: Math.round(((skin.video.bytes ?? 0) / 1024 / 1024) * 10) / 10,
          })
        : null
      const hasPlayback = Boolean(skin?.video) || fromPlaylist
      const state = fromPlaylist
        ? `${playing ? t('video.statePlaying') : t('video.statePaused')} · ${t('playlist.positionOf', { i: playlist.index + 1, n: playlist.count, name: playlist.name ?? '' })}`
        : !skin?.video
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
            h('span', { className: 'dsks-switch-hint' }, !fromPlaylist && meta ? `${state} · ${meta}` : state),
          ),
          hasPlayback ? h(Button, { icon: playing ? 'pause' : 'play', onClick: toggle }, playing ? t('video.pause') : t('video.play')) : null,
        ),
        h(PlaylistPanel, { t, runtime, playlist, playlistKeys, onChanged: () => setRevision((value) => value + 1) }),
      )
    }

    /**
     * Advanced settings: the folder playlist.
     *
     * Collapsed by default (`<details>` without `open`), because it is a power
     * feature sitting under the two switches people actually come here for.
     * Every control writes through the runtime, which owns the video element.
     */
    function PlaylistPanel({ t, runtime, playlist, playlistKeys, onChanged }) {
      const [open, setOpen] = useState(false)
      const [busy, setBusy] = useState(null)
      const [error, setError] = useState(null)
      const refresh = () => onChanged?.()
      // Picture-in-picture is a Chromium feature on <video>; when the shell does
      // not expose it the switch is shown disabled rather than silently useless.
      const pipAvailable = Boolean(playlist?.pictureInPictureAvailable)
      const run = async (key, action) => {
        setBusy(key)
        setError(null)
        try {
          const result = await action()
          return result
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
          return null
        } finally {
          setBusy(null)
          refresh()
        }
      }
      const toggleEnabled = () =>
        run('enable', async () => {
          await runtime.setPlaylistEnabled(!playlist.enabled)
        })
      const chooseFolder = () => run('folder', () => runtime.pickPlaylistFolder())
      const openFolder = () => run('open', () => runtime.openPlaylistFolder(playlist.folder))
      const changeSpeed = (speed) => run('speed', () => runtime.updatePlaylistSettings({ speed }))
      const changePip = (value) => run('pip', () => runtime.updatePlaylistSettings({ pictureInPicture: value }))
      const useHistory = (path) => run(`history:${path}`, () => runtime.chooseHistory(path))
      const goRelative = (step) => {
        if (step > 0) runtime.nextPlaylist?.()
        else runtime.prevPlaylist?.()
        refresh()
      }
      const history = Array.isArray(playlist?.settings?.history) ? playlist.settings.history : []
      const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

      let position
      if (!playlist?.enabled) position = t('playlist.positionIdle')
      else if (playlist.error === 'empty') position = t('playlist.positionEmpty')
      else if (typeof playlist.error === 'string' && playlist.error !== '') position = t('playlist.positionError', { message: playlist.error })
      else if (!playlist.count) position = playlist.folder ? t('playlist.positionEmpty') : t('playlist.positionWaiting')
      else position = t('playlist.positionOf', { i: playlist.index + 1, n: playlist.count, name: playlist.name ?? '' })

      return h(
        'details',
        {
          className: 'dsks-fallback dsks-advanced dsks-playlist',
          open: open || undefined,
          onToggle: (event) => setOpen(Boolean(event.currentTarget?.open ?? event.target?.open)),
        },
        h('summary', null, t('playlist.advanced')),
        h(
          'div',
          { className: 'dsks-form dsks-playlist-body' },
          h('p', { className: 'dsks-hint' }, t('playlist.advancedHint')),
          h(Switch, {
            id: 'dsks-playlist-enable',
            checked: Boolean(playlist.enabled),
            label: t('playlist.enable'),
            hint: t('playlist.enableHint'),
            disabled: busy === 'enable',
            onChange: () => toggleEnabled(),
          }),
          h(
            'div',
            { className: 'dsks-switch dsks-playlist-keys' },
            h(
              'div',
              { className: 'dsks-switch-text' },
              h('span', { className: 'dsks-switch-label' }, t('playlist.shortcut')),
              h('span', { className: 'dsks-switch-hint' }, t('playlist.shortcutHint')),
            ),
            h(
              'span',
              { className: 'dsks-keycaps' },
              ...playlistKeys.map((key, index) =>
                key === '+' ? h('span', { key: index, className: 'dsks-keycap-plus' }, '+') : h('kbd', { key: index, className: 'dsks-keycap' }, key),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dsks-playlist-field' },
            h('span', { className: 'dsks-field-label' }, t('playlist.folder')),
            h('input', {
              className: 'dsks-input dsks-playlist-path',
              readOnly: true,
              value: playlist?.folder ?? '',
              placeholder: t('playlist.folderEmpty'),
              title: playlist?.folder ?? '',
            }),
            h(Button, { busy: busy === 'folder', onClick: chooseFolder }, t('playlist.choose')),
            h(Button, { disabled: !playlist?.folder, busy: busy === 'open', onClick: openFolder }, t('playlist.open')),
          ),
          h('p', { className: 'dsks-hint' }, t('playlist.folderHint')),
          h(
            'div',
            { className: 'dsks-field' },
            h('label', { className: 'dsks-field-label', htmlFor: 'dsks-playlist-speed' }, t('playlist.speed')),
            h(
              'select',
              {
                id: 'dsks-playlist-speed',
                className: 'dsks-select',
                value: String(playlist?.settings?.speed ?? 1),
                onChange: (event) => changeSpeed(Number(event.target.value)),
              },
              ...speeds.map((value) => h('option', { key: value, value: String(value) }, `${value}×`)),
            ),
          ),
          h(Switch, {
            id: 'dsks-playlist-pip',
            checked: Boolean(playlist?.pictureInPicture),
            disabled: !pipAvailable,
            label: t('playlist.pip'),
            hint: pipAvailable ? t('playlist.pipHint') : t('playlist.pipUnsupported'),
            onChange: (value) => changePip(value),
          }),
          h(
            'div',
            { className: 'dsks-playlist-history' },
            h('span', { className: 'dsks-switch-label' }, t('playlist.history')),
            h('span', { className: 'dsks-switch-hint' }, t('playlist.historyHint')),
            history.length === 0
              ? h('p', { className: 'dsks-hint' }, t('playlist.historyEmpty'))
              : h(
                  'ul',
                  { className: 'dsks-playlist-history-list' },
                  ...history.map((path) =>
                    h(
                      'li',
                      {
                        key: path,
                        className: 'dsks-playlist-history-item',
                        'data-current': playlist?.folder === path ? '' : undefined,
                        title: path,
                        onDoubleClick: () => useHistory(path),
                      },
                      h('span', { className: 'dsks-playlist-history-path' }, path),
                      playlist?.folder === path ? h('span', { className: 'dsks-pill' }, t('playlist.historyCurrent')) : null,
                      h('button', { type: 'button', className: 'dsks-link', disabled: busy === `history:${path}`, onClick: () => useHistory(path) }, t('playlist.historyUse')),
                    ),
                  ),
                ),
          ),
          h(
            'div',
            { className: 'dsks-video-state' },
            h(
              'div',
              { className: 'dsks-video-state-text' },
              h('span', { className: 'dsks-switch-label' }, t('playlist.position')),
              h('span', { className: 'dsks-switch-hint' }, position),
            ),
            playlist?.count > 1
              ? h(
                  'span',
                  { className: 'dsks-playlist-steps' },
                  h(Button, { onClick: () => goRelative(-1) }, t('playlist.prev')),
                  h(Button, { onClick: () => goRelative(1) }, t('playlist.next')),
                )
              : null,
          ),
          error ? h('p', { className: 'dsks-error' }, error) : null,
        ),
      )
    }

    /**
     * Rename one skin.
     *
     * Only the display name changes; the id and the stored files stay put, so
     * this works on the active skin too. A rescan of the source folder rewrites
     * the document from the pack, and the hint says so instead of letting the
     * name quietly revert.
     */
    function RenameDialog({ t, skin, onClose, onDone }) {
      const [name, setName] = useState(() => skin.name ?? '')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const trimmed = name.trim()
      const save = async () => {
        if (trimmed === '') {
          setError(t('rename.empty'))
          return
        }
        if (trimmed === skin.name) {
          onClose()
          return
        }
        setBusy(true)
        setError(null)
        try {
          onDone(await api.rename(skin.id, trimmed))
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
          setBusy(false)
        }
      }
      return h(
        Dialog,
        {
          t,
          title: t('rename.title'),
          description: t('rename.desc'),
          onClose,
          footer: [
            h(Button, { key: 'cancel', disabled: busy, onClick: onClose }, t('action.cancel')),
            h(Button, { key: 'save', variant: 'primary', busy, disabled: trimmed === '' || busy, onClick: save }, t('action.save')),
          ],
        },
        h('input', {
          className: 'dsks-input',
          value: name,
          autoFocus: true,
          maxLength: 120,
          placeholder: t('rename.placeholder'),
          disabled: busy,
          onChange: (event) => setName(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') save()
          },
        }),
        skin.origin?.kind === 'codex-import' ? h('p', { className: 'dsks-hint' }, t('rename.rescanHint')) : null,
        error ? h('p', { className: 'dsks-error' }, error) : null,
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
/* Download progress: the bar sits under "正在下载更新包 N%", and the sheet must
   not jump when the install phase swaps it out. */
.dsks-progress-block{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.dsks-progress{position:relative;overflow:hidden;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2)}
.dsks-progress-fill{height:100%;border-radius:inherit;background:var(--dsw-alias-brand-primary);transition:width .18s ease-out}
@media (prefers-reduced-motion: reduce){.dsks-progress-fill{transition:none}}
.dsks-video-layer{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
/* The playlist clip is a *background*, exactly like the theme's own video: it
   stays at z-index 0 behind #root. It must never be raised above the UI — a
   higher value would paint over every panel on a theme whose #root has no
   stacking context. */
.dsks-video-layer[data-source="playlist"]{z-index:0}
.dsks-video-layer video{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .45s ease-out}
.dsks-video-layer[data-ready] video{opacity:1}
.dsks-video-veil{position:absolute;inset:0;display:block;pointer-events:none}
.dsks-playlist-body{gap:10px}
.dsks-playlist-field{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsks-playlist-field .dsks-field-label{flex:none}
.dsks-playlist-path{flex:1 1 200px;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsks-playlist-keys{border-bottom:none;padding-bottom:0}
.dsks-playlist-history{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsks-playlist-history-list{display:flex;flex-direction:column;gap:2px;margin:4px 0 0;padding:0;list-style:none;max-height:168px;overflow:auto}
.dsks-playlist-history-item{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:7px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:default;user-select:none}
.dsks-playlist-history-item:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.dsks-playlist-history-item[data-current]{color:var(--dsw-alias-label-primary)}
.dsks-playlist-history-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.dsks-playlist-steps{display:inline-flex;gap:6px;flex:none}
.dsks-switch[data-disabled]{opacity:.55;cursor:default}
.dsks-switch[data-disabled] .dsks-switch-track{pointer-events:none}
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
      __components: { SkinRow, SkinDetail, ImportDialog, Switch, VideoSettingsDialog, PlaylistPanel, DesignDialog, AboutDialog, RenameDialog },
      /** Test seam: the download route is a plain request against the Host. */
      __api: api,
      /** Test seam: the percentage rules belong to the component, not the request. */
      __progress: { toProgress, formatMegabytes },
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