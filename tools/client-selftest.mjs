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
function createElement(tagName) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    attributes: {},
    style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' },
    _text: '',
    isConnected: false,
    setAttribute(name, value) {
      this.attributes[name] = String(value)
    },
    getAttribute(name) {
      return this.attributes[name] ?? null
    },
    remove() {
      this.isConnected = false
    },
    get textContent() {
      return this._text
    },
    set textContent(value) {
      this._text = String(value)
    },
    append() {},
  }
  return element
}

globalThis.document = {
  head: {
    append(element) {
      element.isConnected = true
      styleTags.push(element)
    },
  },
  body: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {} },
  createElement,
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
  documentElement: { style: {} },
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
  useEffect: () => {},
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
  origin: { kind: 'codex-import', codexId: 'studio.test' },
  codex: { tagline: 'tag', hasSafeCss: false },
  css: '',
  createdAt: '2026-10-28T00:00:00.000Z',
  transparency: 30,
  transparencyOverridden: false,
}

let activeId = 'skin.test'
const snapshot = () => ({ ok: true, snapshot: { version: 1, activeId, themes: [skin], sources: [], dataDir: 'x', model: null, client: null } })

globalThis.fetch = async (url, options) => {
  const path = String(url)
  let payload
  if (path.includes('/skin/api/snapshot')) payload = snapshot()
  else if (path.includes('/skin/api/ping')) payload = { ok: true }
  else if (path.includes('/skin/api/deactivate')) {
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
check('registers one theme', themeCalls.register.length === 1 && themeCalls.register[0].id === 'skin.test')
check('registers dark color scheme', themeCalls.register[0]?.colorScheme === 'dark')
check('tokens use rgba surfaces', String(themeCalls.register[0]?.tokens?.['--dsw-alias-bg-base']).startsWith('rgba(16, 20, 24'))
check('text token is the theme text colour', themeCalls.register[0]?.tokens?.['--dsw-alias-label-primary'] === '#f2f6fa')
check('activates the active skin', themeCalls.setTheme.includes('skin.test'))
check('installs an alpha override layer', themeCalls.overrideTokens.length === 1 && themeCalls.overrideTokens[0].source === '@local/dsh-skin')
const override = themeCalls.overrideTokens[0]?.tokens?.['--dsw-alias-bg-base']
check('override carries light and dark values', typeof override?.light === 'string' && typeof override?.dark === 'string')

const wallpaperTag = styleTags.find((tag) => tag.getAttribute('data-plugin-css') === 'skin')
check('injects the wallpaper stylesheet', Boolean(wallpaperTag))
check('stylesheet paints body::before', wallpaperTag?.textContent.includes('body::before'))
check('stylesheet uses the wallpaper url', wallpaperTag?.textContent.includes('/skin/assets/skin.test/wallpaper'))
check('stylesheet positions by focus', wallpaperTag?.textContent.includes('30% 60%'))
check('stylesheet lifts #root above the layer', wallpaperTag?.textContent.includes('#root{position:relative;z-index:1;}'))
const managerTag = styleTags.find((tag) => tag.getAttribute('data-plugin-css') === 'manager')
check('injects manager styles', Boolean(managerTag) && managerTag.textContent.includes('.dsks-root'))

console.log('transparency preview')
{
  // Reach the live page component through the registered slot and use the
  // runtime exposed on its props.
  const element = slotRegistrations[0].component({})
  const runtime = element.props.runtime
  check('slot renders the page with the runtime', Boolean(runtime && typeof runtime.previewTransparency === 'function'))
  runtime.previewTransparency('skin.test', 80)
  const last = themeCalls.overrideTokens.at(-1)
  check('preview updates the override layer', String(last?.tokens?.['--dsw-alias-bg-base']?.dark).endsWith('0.2)'), String(last?.tokens?.['--dsw-alias-bg-base']?.dark))
  check('preview keeps a canvas floor', String(last?.tokens?.['--dsw-alias-bg-base']?.dark).includes('0.2'), String(last?.tokens?.['--dsw-alias-bg-base']?.dark))
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
  check('renders skin cards', seen.includes('SkinCard'))
  check('renders the toolbar actions', text.includes('扫描本机主题') && text.includes('AI 设计'))
  check('renders the skin name', text.includes('Test Skin'))
  check('renders the card action', text.includes('应用') || text.includes('使用中'))

  const Design = element.type ? null : null
  void Design
}

console.log(failures === 0 ? '\nall client checks passed' : `\n${failures} client check(s) failed`)
process.exit(failures === 0 ? 0 : 1)