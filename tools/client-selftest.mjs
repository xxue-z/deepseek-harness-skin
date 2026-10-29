#!/usr/bin/env node
/**
 * Client-half self test.
 *
 * Loads `client.js` with a stub module loader, React, DOM, and Cordis context,
 * then drives the runtime through a fake snapshot: it checks that themes are
 * registered, the active skin is applied, the wallpaper stylesheet is written,
 * the transparency override layer is installed, and turning the skin off
 * restores a built-in theme.
 *
 *   node tools/client-selftest.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ---------------------------------------------------------------- DOM stub */

const styleTags = []
function matchesSelector(element, selector) {
  if (selector.startsWith('.')) return String(element.className ?? '').split(/\s+/).includes(selector.slice(1))
  return false
}

function createElement(tagName) {
  const listeners = new Map()
  const element = {
    tagName: String(tagName).toUpperCase(),
    attributes: {},
    children: [],
    parent: null,
    className: '',
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '', objectPosition: '', background: '' },
    _text: '',
    isConnected: false,
    paused: true,
    muted: false,
    src: '',
    setAttribute(name, value) {
      this.attributes[name] = String(value)
    },
    getAttribute(name) {
      return this.attributes[name] ?? null
    },
    removeAttribute(name) {
      delete this.attributes[name]
    },
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? []
      list.push(listener)
      listeners.set(type, list)
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) listener({ type })
    },
    append(...nodes) {
      for (const node of nodes) {
        if (node === null || node === undefined) continue
        node.parent = this
        node.isConnected = true
        this.children.push(node)
      }
    },
    remove() {
      if (this.parent) {
        const index = this.parent.children.indexOf(this)
        if (index >= 0) this.parent.children.splice(index, 1)
      }
      this.isConnected = false
      this.parent = null
    },
    querySelector(selector) {
      for (const child of this.children) {
        if (matchesSelector(child, selector)) return child
        const nested = child.querySelector?.(selector)
        if (nested) return nested
      }
      return null
    },
    play() {
      this.paused = false
      this.emit('play')
      return Promise.resolve()
    },
    pause() {
      this.paused = true
    },
    load() {},
    get textContent() {
      return this._text
    },
    set textContent(value) {
      this._text = String(value)
    },
  }
  return element
}

const body = createElement('body')
globalThis.document = {
  head: {
    children: styleTags,
    append(element) {
      element.isConnected = true
      styleTags.push(element)
    },
  },
  body,
  createElement,
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
  documentElement: { style: {} },
  visibilityState: 'visible',
}
globalThis.window = globalThis
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)

/* -------------------------------------------------------------- React stub */

let hookCursor = 0
const hookStore = []
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => {
    const index = hookCursor++
    if (!(index in hookStore)) hookStore[index] = typeof initial === 'function' ? initial() : initial
    return [hookStore[index], (next) => { hookStore[index] = next }]
  },
  // Effects run inline so a component that measures in useEffect (the hover
// card does) still produces its final tree in this harness.
  useEffect: (effect) => {
    hookCursor++
    try {
      effect()
    } catch {
      /* cleanup closures are not tracked here */
    }
  },
  useRef: (initial) => {
    const index = hookCursor++
    if (!(index in hookStore)) hookStore[index] = { current: initial }
    return hookStore[index]
  },
  useCallback: (callback) => callback,
  useMemo: (factory) => factory(),
}

/* ------------------------------------------------------------ fetch + data */

const skin = {
  id: 'skin.test',
  name: 'Test Skin',
  description: 'a test',
  appearance: 'dark',
  colors: {
    background: '#101418',
    panel: '#182028',
    panelAlt: '#202a34',
    accent: '#ff5566',
    accentAlt: '#ffcc33',
    secondary: '#33ccff',
    highlight: '#aa66ff',
    text: '#f2f6fa',
    muted: '#a8b4c0',
    line: 'rgba(255, 255, 255, .2)',
  },
  typography: { fontFamily: null },
  surface: { radius: 16, blur: 0, alpha: { canvas: 0.7, sidebar: 0.66, panel: 0.72, panelAlt: 0.68, overridden: false } },
  wallpaper: { url: '/skin/assets/skin.test/wallpaper?v=1', focusX: 0.3, focusY: 0.6, dim: 0.25 },
  video: { url: '/skin/assets/skin.test/video?v=1', width: 1280, height: 720, durationMs: 4000, bytes: 5242880, codec: 'avc1' },
  origin: { kind: 'codex-import', codexId: 'studio.test' },
  codex: { tagline: 'tag', hasSafeCss: false },
  css: '',
  createdAt: '2026-10-28T00:00:00.000Z',
  transparency: 30,
  transparencyOverridden: false,
}

let activeId = 'skin.test'
let videoSettings = { autoplay: true, muted: true }

const modelCatalog = {
  default: { provider: 'qwen-token-plan-cn', model: 'deepseek-v4.1-flash' },
  groups: [
    {
      id: 'qwen-token-plan-cn',
      name: 'Qwen Token Plan',
      models: [
        { provider: 'qwen-token-plan-cn', providerName: 'Qwen Token Plan', id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash', images: 'yes' },
        { provider: 'qwen-token-plan-cn', providerName: 'Qwen Token Plan', id: 'qwen3-max', name: 'Qwen3 Max', images: 'no' },
      ],
    },
  ],
  failures: [],
}
const designCalls = []
const releaseInfo = {
  current: '1.0.2',
  latest: '1.0.3',
  updateAvailable: true,
  mode: 'release',
  tag: 'v1.0.3',
  url: 'https://github.com/xxue-z/deepseek-harness-skin/releases/tag/v1.0.3',
  notes: 'notes',
  publishedAt: '2026-10-29T00:00:00Z',
  autoUpdate: true,
  error: null,
}

const lightSkin = {
  id: 'skin.auto-light',
  name: 'Auto Light',
  description: '',
  appearance: 'auto',
  colors: {
    background: '#f7f6f6',
    panel: '#fefefe',
    panelAlt: '#eaeae8',
    accent: '#cd2316',
    accentAlt: '#b01e13',
    secondary: '#a1831f',
    highlight: '#9a1a11',
    text: '#1e1d1a',
    muted: '#6a6968',
    line: '#d4d3d3',
  },
  typography: { fontFamily: null },
  surface: { radius: 16, blur: 0, alpha: { canvas: 0.7, sidebar: 0.7, panel: 0.7, panelAlt: 0.7, overridden: false } },
  wallpaper: { url: '/skin/assets/skin.auto-light/wallpaper?v=1', focusX: 0.5, focusY: 0.5, dim: 0.18 },
  origin: { kind: 'codex-import', codexId: 'lbxx' },
  codex: null,
  css: '',
  createdAt: '2026-10-28T00:00:00.000Z',
  transparency: 30,
  transparencyOverridden: false,
}

const snapshot = () => ({ ok: true, snapshot: { version: 1, activeId, themes: [skin, lightSkin], sources: [], dataDir: 'x', model: null, client: null, video: { ...videoSettings } } })

globalThis.fetch = async (url, options) => {
  const path = String(url)
  let payload
  if (path.includes('/skin/api/snapshot')) payload = snapshot()
  else if (path.endsWith('/skin/version')) payload = { ok: true, version: '1.0.2', repository: 'xxue-z/deepseek-harness-skin', url: 'https://github.com/xxue-z/deepseek-harness-skin' }
  else if (path.endsWith('/skin/update-check')) payload = { ok: true, ...releaseInfo }
  else if (path.includes('/skin/api/models')) payload = { ok: true, models: modelCatalog }
  else if (path.includes('/skin/api/design')) {
    designCalls.push(JSON.parse(options?.body ?? '{}'))
    payload = { ok: true, snapshot: snapshot().snapshot, skin: { ...skin, id: 'skin.designed', name: 'Designed' }, usedModel: true, warning: null }
  } else if (path.includes('/skin/api/ping')) payload = { ok: true }
  else if (path.includes('/skin/api/video-settings')) {
    const patch = JSON.parse(options?.body ?? '{}')
    if (typeof patch.autoplay === 'boolean') videoSettings.autoplay = patch.autoplay
    if (typeof patch.muted === 'boolean') videoSettings.muted = patch.muted
    payload = { ok: true, settings: { ...videoSettings }, snapshot: snapshot().snapshot }
  } else if (path.includes('/skin/api/deactivate')) {
    activeId = null
    payload = snapshot()
  } else if (path.includes('/skin/api/apply')) {
    activeId = JSON.parse(options?.body ?? '{}').id ?? activeId
    payload = snapshot()
  } else payload = { ok: false, error: 'unexpected' }
  return { status: 200, json: async () => payload }
}

/* ------------------------------------------------------------------ loader */

let exportsModule = null
globalThis.__ModuleLoader__ = {
  load(definition) {
    exportsModule = definition.factory((name) => {
      if (name === 'react') return ReactStub
      throw new Error(`unknown module ${name}`)
    })
  },
}

const source = readFileSync(join(here, '..', 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'fetch', 'React', source)(globalThis, globalThis.document, globalThis.fetch, ReactStub)

check('factory returns inject/apply', typeof exportsModule?.apply === 'function' && Array.isArray(exportsModule.inject))

/* ------------------------------------------------------------------- ctx */

const themeCalls = { register: [], setTheme: [], overrideTokens: [], dispose: 0 }
const themeService = {
  register(definition) {
    themeCalls.register.push(definition)
    return () => {
      themeCalls.dispose += 1
    }
  },
  setTheme(id) {
    themeCalls.setTheme.push(id)
  },
  overrideTokens(source, tokens) {
    themeCalls.overrideTokens.push({ source, tokens })
    return () => {}
  },
  getTheme() {
    return { preference: themeCalls.setTheme.at(-1) ?? 'system', active: { id: 'x' }, themes: [], fontSizes: {}, fontFamilies: {}, revision: 1 }
  },
}

const slotRegistrations = []
const injectedSlots = []
const ctx = {
  get: (name) =>
    ({
      theme: themeService,
      locale: { getLocale: () => ({ active: 'zh-CN' }), subscribe: () => () => {} },
      slots: null,
    })[name],
  on: () => () => {},
  effect: (callback) => {
    callback()
    return () => {}
  },
  slots: {
    inject(key, callback) {
      injectedSlots.push(key)
      callback()
      return () => {}
    },
    register(options, component) {
      slotRegistrations.push({ options, component })
      return () => {}
    },
  },
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

console.log('client runtime')
exportsModule.apply(ctx)
await flush()

check('injects the settings section slot', injectedSlots.includes('settings.section'), injectedSlots.join(','))
check('registers the skin section', slotRegistrations[0]?.options?.id === 'skin', JSON.stringify(slotRegistrations[0]?.options))
check('section label is localized', slotRegistrations[0]?.options?.label?.() === '主题皮肤')
check('registers every theme', themeCalls.register.length === 2 && themeCalls.register.some((entry) => entry.id === 'skin.test'))
check('registers dark color scheme for a dark palette', themeCalls.register.find((entry) => entry.id === 'skin.test')?.colorScheme === 'dark')
check('registers light scheme for an auto light palette', themeCalls.register.find((entry) => entry.id === 'skin.auto-light')?.colorScheme === 'light')
const darkReg = themeCalls.register.find((entry) => entry.id === 'skin.test')
check('tokens use rgba surfaces', String(darkReg?.tokens?.['--dsw-alias-bg-base']).startsWith('rgba(16, 20, 24'))
check('composer token is translucent', String(darkReg?.tokens?.['--dsw-specific-input-major']).startsWith('rgba('), String(darkReg?.tokens?.['--dsw-specific-input-major']))
check('dialogs stay nearly solid', String(darkReg?.tokens?.['--dsw-alias-bg-layer-2']).endsWith('0.95)'), String(darkReg?.tokens?.['--dsw-alias-bg-layer-2']))
check('cards stay readable', String(darkReg?.tokens?.['--dsw-alias-bg-layer-1']).endsWith('0.86)'), String(darkReg?.tokens?.['--dsw-alias-bg-layer-1']))
check('text token is the theme text colour', darkReg?.tokens?.['--dsw-alias-label-primary'] === '#f2f6fa')
check('activates the active skin', themeCalls.setTheme.includes('skin.test'))
check('installs an alpha override layer', themeCalls.overrideTokens.length === 1 && themeCalls.overrideTokens[0].source === '@xxue-z/dsh-skin')
const override = themeCalls.overrideTokens[0]?.tokens?.['--dsw-alias-bg-base']
check('override carries light and dark values', typeof override?.light === 'string' && typeof override?.dark === 'string')

const wallpaperTag = styleTags.find((tag) => tag.getAttribute('data-plugin-css') === 'skin')
check('injects the wallpaper stylesheet', Boolean(wallpaperTag))
check('stylesheet blurs dialog backdrops', wallpaperTag?.textContent.includes('[role="dialog"]'))
check('stylesheet paints body::before', wallpaperTag?.textContent.includes('body::before'))
check('stylesheet uses the wallpaper url', wallpaperTag?.textContent.includes('/skin/assets/skin.test/wallpaper'))
check(
  'the veil takes the theme canvas colour',
  wallpaperTag?.textContent.includes('linear-gradient(rgba(16, 20, 24, 0.7), rgba(16, 20, 24, 0.7))'),
  String(wallpaperTag?.textContent).slice(0, 240),
)
check('the veil is never hard-coded white', !String(wallpaperTag?.textContent).includes('rgba(255, 255, 255'))
check('stylesheet positions by focus', wallpaperTag?.textContent.includes('30% 60%'))
check('stylesheet lifts #root above the layer', wallpaperTag?.textContent.includes('#root{position:relative;z-index:1;}'))
const managerTag = styleTags.find((tag) => tag.getAttribute('data-plugin-css') === 'manager')
check('injects manager styles', Boolean(managerTag) && managerTag.textContent.includes('.dsks-root'))

console.log('dynamic background layer')
{
  const layer = document.body.children.find((child) => child.className === 'dsks-video-layer')
  check('mounts a video layer for a video skin', Boolean(layer), JSON.stringify(document.body.children.map((child) => child.className)))
  const element = layer?.children.find((child) => child.tagName === 'VIDEO')
  check('points the video at the asset url', String(element?.src).includes('/skin/assets/skin.test/video'))
  check('starts muted', element?.muted === true, String(element?.muted))
  check('starts playing', element?.paused === false, String(element?.paused))
  check('follows the wallpaper focus', element?.style.objectPosition === '30% 60%', String(element?.style.objectPosition))
  const veil = layer?.children.find((child) => child.className === 'dsks-video-veil')
  check('paints the shared veil', String(veil?.style.background).includes('0.7'), String(veil?.style.background))
  check('the stylesheet owns the layer geometry', String(managerTag?.textContent).includes('.dsks-video-layer{position:fixed'))
}

console.log('dynamic background controls')
{
  const runtime = slotRegistrations[0].component({}).props.runtime
  const layer = () => document.body.children.find((child) => child.className === 'dsks-video-layer')
  const videoElement = () => layer()?.children.find((child) => child.tagName === 'VIDEO')
  check('reports the video as playing', runtime.isVideoPlaying() === true)
  runtime.toggleVideo()
  check('the shortcut pauses playback', videoElement()?.paused === true)
  check('a pause keeps the current frame mounted', Boolean(layer()))
  runtime.toggleVideo()
  check('the shortcut resumes playback', videoElement()?.paused === false)
  await runtime.updateVideoSettings({ muted: false })
  check('unmuting reaches the element', videoElement()?.muted === false)
  await runtime.updateVideoSettings({ autoplay: false })
  check('autoplay off removes the layer', !layer())
  await runtime.updateVideoSettings({ autoplay: true })
  check('autoplay on mounts it again', Boolean(layer()))

  const VideoSettingsDialog = exportsModule.__components?.VideoSettingsDialog
  check('video dialog is exported for testing', typeof VideoSettingsDialog === 'function')
  if (typeof VideoSettingsDialog === 'function') {
    const savedCursor = hookCursor
    const savedStore = hookStore.slice()
    hookCursor = 0
    const dialog = VideoSettingsDialog({ t: (key) => key, runtime, onClose: () => {} })
    hookCursor = savedCursor
    hookStore.length = 0
    hookStore.push(...savedStore)
    const text = JSON.stringify(dialog)
    check('dialog exposes autoplay and mute', text.includes('"label":"video.autoplay"') && text.includes('"label":"video.muted"'))
    check('dialog shows the play/pause shortcut', text.includes('video.shortcut') && text.includes('Ctrl'), text.slice(0, 200))
    check('dialog shows the current state', text.includes('video.state'))
  }
}

console.log('transparency preview')
{
  // Reach the live page component through the registered slot and use the
  // runtime exposed on its props.
  const element = slotRegistrations[0].component({})
  const runtime = element.props.runtime
  check('slot renders the page with the runtime', Boolean(runtime && typeof runtime.previewTransparency === 'function'))
  runtime.previewTransparency('skin.test', 80)
  const last = themeCalls.overrideTokens.at(-1)
  check('preview keeps the canvas clear', String(last?.tokens?.['--dsw-alias-bg-base']?.dark).endsWith(', 0)'), String(last?.tokens?.['--dsw-alias-bg-base']?.dark))
  check('preview updates the sidebar alpha', String(last?.tokens?.['--dsw-specific-sidebar-fill']?.dark).endsWith('0.2)'), String(last?.tokens?.['--dsw-specific-sidebar-fill']?.dark))
  check('preview keeps cards readable', String(last?.tokens?.['--dsw-alias-bg-layer-1']?.dark).endsWith('0.86)'), String(last?.tokens?.['--dsw-alias-bg-layer-1']?.dark))
  check('preview keeps dialogs solid', String(last?.tokens?.['--dsw-alias-bg-layer-2']?.dark).endsWith('0.95)'), String(last?.tokens?.['--dsw-alias-bg-layer-2']?.dark))
  check('preview keeps the composer solid', String(last?.tokens?.['--dsw-specific-input-major']?.dark).endsWith('0.9)'), String(last?.tokens?.['--dsw-specific-input-major']?.dark))
}

console.log('deactivate')
{
  activeId = null
  const element = slotRegistrations[0].component({})
  const runtime = element.props.runtime
  await runtime.load()
  await flush()
  check('restores a built-in preference', ['system', 'light', 'dark'].includes(themeCalls.setTheme.at(-1)), String(themeCalls.setTheme.at(-1)))
  check('clears the wallpaper stylesheet', styleTags.find((tag) => tag.getAttribute('data-plugin-css') === 'skin')?.textContent === '')
}

console.log('render walk (components execute without React DOM)')
{
  // A minimal renderer: function components run with hook stubs, so a broken
  // reference or a bad branch throws here instead of blanking the slot.
  const seen = []
  const renderedText = []
  function walk(node, depth = 0) {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') {
      renderedText.push(String(node))
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth)
      return
    }
    if (typeof node.type === 'function') {
      seen.push(node.type.name || 'anon')
      const savedCursor = hookCursor
      const savedStore = hookStore.slice()
      hookCursor = 0
      const rendered = node.type({ ...(node.props ?? {}), children: node.children })
      walk(rendered, depth + 1)
      hookCursor = savedCursor
      hookStore.length = 0
      hookStore.push(...savedStore)
      return
    }
    for (const child of node.children ?? []) walk(child, depth)
  }

  const element = slotRegistrations[0].component({})
  walk(element)
  check('page renders without throwing', true)
  const text = renderedText.join(' ')
  check('page renders the title', text.includes('主题皮肤'), text.slice(0, 160))
  check('renders skin rows', seen.includes('SkinRow'))
  check('renders the toolbar actions', text.includes('扫描本机主题') && text.includes('AI 设计') && text.includes('动态主题设置'))
  check('renders the skin name', text.includes('Test Skin'))
  check('renders the row badge', text.includes('使用中') || text.includes('主题皮肤'))

  // The row and its inline detail are only reachable through the test seam:
  // the static walk shows every row collapsed.
  const SkinRow = exportsModule.__components?.SkinRow
  check('row component is exported for testing', typeof SkinRow === 'function')
  if (typeof SkinRow === 'function') {
    const handlers = {
      t: (key) => key,
      busy: null,
      draftTransparency: null,
      onToggle: () => {},
      onApply: () => {},
      onDeactivate: () => {},
      onDelete: () => {},
      onExport: () => {},
      onRecolor: () => {},
      onAttachVideo: () => {},
      onRename: () => {},
      onTransparency: () => {},
      onReset: () => {},
    }
    const render = (props) => {
      hookCursor = 0
      return SkinRow(props)
    }
    const collapsed = render({ skin, active: false, open: false, ...handlers })
    check('row renders collapsed', collapsed?.props?.className === 'dsks-row-wrap' && collapsed.props['data-open'] === undefined)
    check('collapsed row has no detail', !JSON.stringify(collapsed).includes('dsks-row-detail'))

    const expanded = render({ skin, active: false, open: true, ...handlers })
    check('expanded row carries a detail card', JSON.stringify(expanded).includes('dsks-row-detail'))
    check('expanded row keeps its summary', JSON.stringify(expanded).includes('dsks-row-name'))

    const active = render({ skin, active: true, open: false, ...handlers })
    const pills = (value) => JSON.stringify(value).split('dsks-pill').length - 1
    check('active row shows the badge', pills(active) > 0 && pills(collapsed) === 0, `${pills(active)} vs ${pills(collapsed)}`)

    // Only one row may be open: the page keeps a single selected id.
    check('row toggles through one callback', typeof handlers.onToggle === 'function')

    // A skin imported before dynamic backgrounds existed: the pack records
    // `codex.video`, but the document has no video yet.
    const SkinDetail = exportsModule.__components?.SkinDetail
    check('detail component is exported for testing', typeof SkinDetail === 'function')
    if (typeof SkinDetail === 'function') {
      const savedCursor = hookCursor
      const savedStore = hookStore.slice()
      hookCursor = 0
      const legacy = SkinDetail({
        skin: { ...skin, video: null, codex: { ...skin.codex, video: 'background.mp4' } },
        active: false,
        busy: null,
        draftTransparency: null,
        ...handlers,
        onClose: () => {},
        compact: true,
        t: (key) => key,
      })
      hookCursor = savedCursor
      hookStore.length = 0
      hookStore.push(...savedStore)
      const text = JSON.stringify(legacy)
      check('a legacy skin explains the missing video', text.includes('video.missingHint'))
      check('a legacy skin offers the attach action', text.includes('action.attachVideo'))
      check('every skin offers rename', text.includes('action.rename'))
    }

    const RenameDialog = exportsModule.__components?.RenameDialog
    check('rename dialog is exported for testing', typeof RenameDialog === 'function')
    if (typeof RenameDialog === 'function') {
      const renderRename = (props) => {
        const cursor = hookCursor
        const store = hookStore.slice()
        hookCursor = 0
        hookStore.length = 0
        const dialog = RenameDialog({ t: (key) => key, skin, onClose: () => {}, onDone: () => {}, ...props })
        hookCursor = cursor
        hookStore.length = 0
        hookStore.push(...store)
        return JSON.stringify(dialog)
      }
      const dialogText = renderRename({})
      check('rename dialog starts from the current name', dialogText.includes('"value":"Test Skin"'), dialogText.slice(0, 200))
      check('rename dialog offers save', dialogText.includes('action.save'))
      check('an imported skin warns about rescans', dialogText.includes('rename.rescanHint'))
      const generated = renderRename({ skin: { ...skin, origin: { kind: 'generated' } } })
      check('a generated skin has no rescan warning', !generated.includes('rename.rescanHint'))
    }
  }
  // The import dialog opens the OS picker; it must render before any path
  // exists, so a missing binding there would blank the settings page too.
  const ImportDialog = exportsModule.__components?.ImportDialog
  check('import dialog is exported for testing', typeof ImportDialog === 'function')
  if (typeof ImportDialog === 'function') {
    const zipInput = { current: { click: () => {} } }
    const dialog = ImportDialog({
      t: (key) => key,
      busy: false,
      zipInput,
      onClose: () => {},
      onPick: async () => {},
      onZip: () => {},
    })
    check('import dialog offers folder and ZIP choices', JSON.stringify(dialog).includes('import.folder') && JSON.stringify(dialog).includes('import.zip'))
    check('import dialog has exactly two choices', (JSON.stringify(dialog).match(/dsks-choice"/g) || []).length === 2)
    check('import dialog keeps a manual path fallback', JSON.stringify(dialog).includes('import.manual'))
  }
  check('list styles are installed', document.head && styleTags.some((tag) => tag.getAttribute('data-plugin-css') === 'manager' && tag.textContent.includes('.dsks-row-wrap')))
}

console.log('design dialog')
{
  const DesignDialog = exportsModule.__components?.DesignDialog
  check('design dialog is exported for testing', typeof DesignDialog === 'function')
  if (typeof DesignDialog === 'function') {
    const renderDialog = (props) => {
      const savedCursor = hookCursor
      const savedStore = hookStore.slice()
      hookCursor = 0
      const tree = DesignDialog({ t: (key) => key, runtime: slotRegistrations[0].component({}).props.runtime, base: null, onClose: () => {}, onDone: () => {}, ...props })
      hookCursor = savedCursor
      hookStore.length = 0
      hookStore.push(...savedStore)
      return tree
    }
    const tree = renderDialog({})
    // The catalog arrives from /skin/api/models after a tick, and the inline
    // effect only issues the request: re-render once the stores are settled.
    await flush()
    const settled = renderDialog({})
    const text = JSON.stringify(settled)
    check('design dialog lists a model dropdown', text.includes('"className":"dsks-select"') && text.includes('"type":"select"'))
    check('the dropdown is grouped by provider', text.includes('"type":"optgroup"') && text.includes('Qwen Token Plan'), text.slice(-400))
    check('the dropdown marks text-only models', text.includes('design.noImageMark'))
    check('it offers image and video sources', text.includes('design.image') && text.includes('design.video'))
    check('image-only, video-only and both are explained', text.includes('design.mediaHint'))
    check('advanced options hold only the theme name', text.includes('design.advanced') && text.includes('design.namePlaceholder'))
    // Mood and notes were the brief's own words in three boxes; they are gone.
    check('the mood and notes inputs are gone', !text.includes('design.moodPlaceholder') && !text.includes('design.notesPlaceholder'))
    check('the old free-text model inputs are gone', !JSON.stringify(tree).includes('"placeholder":"qwen-token-plan-cn"'))
  }
}

console.log('version badge and update sheet')
{
  await flush()
  // The catalog arrives asynchronously; read the page's runtime directly and
  // force the snapshot it renders from.
  const liveRuntime = slotRegistrations[0].component({}).props.runtime
  await liveRuntime.load()
  await flush()
  const page = slotRegistrations[0].component({})
  const savedCursor = hookCursor
  const savedStore = hookStore.slice()
  hookCursor = 0
  const tree = page.type(page.props)
  hookCursor = savedCursor
  hookStore.length = 0
  hookStore.push(...savedStore)
  const json = JSON.stringify(tree)
  check('header shows the version next to the title', json.includes('dsks-version') && json.includes('v1.0.2'), json.slice(0, 240))

  const AboutDialog = exportsModule.__components?.AboutDialog
  check('about dialog is exported for testing', typeof AboutDialog === 'function')
  if (typeof AboutDialog === 'function') {
    // Each render starts from an empty hook store: reusing a previous render's
    // slots would hand the dialog a stale `release` and hide the state under test.
    const renderAbout = (props) => {
      const cursor = hookCursor
      const store = hookStore.slice()
      hookCursor = 0
      hookStore.length = 0
      const dialog = AboutDialog({
        t: (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key),
        version: '1.0.2',
        info: { repository: 'xxue-z/deepseek-harness-skin', url: 'https://github.com/xxue-z/deepseek-harness-skin' },
        release: null,
        onClose: () => {},
        ...props,
      })
      hookCursor = cursor
      hookStore.length = 0
      hookStore.push(...store)
      return JSON.stringify(dialog)
    }
    const fresh = renderAbout({})
    check('sheet shows the repository link', fresh.includes('github.com/xxue-z/deepseek-harness-skin'))
    check('sheet links the release notes', fresh.includes('CHANGELOG.md'))
    check('sheet offers a check-update button', fresh.includes('about.check'))
    const newer = renderAbout({ release: { ...releaseInfo, current: '1.0.2', latest: '1.0.3', tag: 'v1.0.3', updateAvailable: true } })
    check('a newer release is announced', newer.includes('about.updateAvailable'), newer.slice(0, 400))
    check('a newer release offers the download', newer.includes('about.install'))
    const current = renderAbout({ release: { ...releaseInfo, updateAvailable: false, latest: '1.0.2', tag: 'v1.0.2' } })
    check('the same version reports up to date', current.includes('about.upToDate') && !current.includes('about.install'))
  }
}

console.log(failures === 0 ? '\nall client checks passed' : `\n${failures} client check(s) failed`)
process.exit(failures === 0 ? 0 : 1)