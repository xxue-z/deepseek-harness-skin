/**
 * Colour utilities for skin conversion and generation.
 *
 * A skin keeps the same ten semantic colours as a Codex theme, so everything
 * here works on plain CSS colour strings and returns plain CSS colour strings.
 * No external dependencies: the Host half must run from a bare package
 * directory inside the Harness profile.
 */

const NAMED = {
  black: '#000000',
  white: '#ffffff',
  transparent: 'transparent',
  gray: '#808080',
  grey: '#808080',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  orange: '#ffa500',
  yellow: '#ffff00',
  purple: '#800080',
  pink: '#ffc0cb',
}

/** Clamp a number into an inclusive range. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clampByte(value) {
  return clamp(Math.round(value), 0, 255)
}

/** True when a value is a usable CSS colour string. */
export function isColor(value) {
  return typeof value === 'string' && parseColor(value) !== null
}

/**
 * Parse a CSS colour into `{ r, g, b, a }`.
 * Supports hex (3/4/6/8 digits), rgb()/rgba() with commas or spaces.
 */
export function parseColor(input) {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  if (value === '') return null
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (NAMED[value]) return parseColor(NAMED[value])

  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (!/^[0-9a-f]+$/.test(hex)) return null
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1
      return { r, g, b, a }
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      return { r, g, b, a }
    }
    return null
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(value)
  if (!fn) return null
  const parts = fn[1]
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter((part) => part !== '')
  if (parts.length < 3) return null
  const channel = (text) => (text.endsWith('%') ? (parseFloat(text) / 100) * 255 : parseFloat(text))
  const r = channel(parts[0])
  const g = channel(parts[1])
  const b = channel(parts[2])
  let a = 1
  if (parts.length >= 4) {
    a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
  }
  if (![r, g, b, a].every((n) => Number.isFinite(n))) return null
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: clamp(a, 0, 1) }
}

/** Format `{ r, g, b }` plus an alpha as an `rgba()` string. */
export function toRgba(color, alpha) {
  const parsed = typeof color === 'string' ? parseColor(color) : color
  if (!parsed) return 'transparent'
  const a = alpha === undefined ? parsed.a : clamp(alpha, 0, 1)
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${Math.round(a * 1000) / 1000})`
}

/** Format as `#rrggbb`. */
export function toHex(color) {
  const parsed = typeof color === 'string' ? parseColor(color) : color
  if (!parsed) return '#000000'
  const part = (n) => clampByte(n).toString(16).padStart(2, '0')
  return `#${part(parsed.r)}${part(parsed.g)}${part(parsed.b)}`
}

/** Whether a colour is perceptually light (Rec. 709 luma). */
export function isLightColor(color) {
  const parsed = parseColor(color)
  if (!parsed) return false
  return (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255 > 0.58
}

/** Linear chroma/luma signal used to keep generated accents visible. */
export function relativeLuminance(color) {
  const parsed = parseColor(color)
  if (!parsed) return 0
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b)
}

/** WCAG contrast ratio between two opaque colours. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

/** Blend two colours; `t` is the weight of `b`. */
export function mix(a, b, t) {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return a
  const weight = clamp(t, 0, 1)
  return toHex({
    r: ca.r + (cb.r - ca.r) * weight,
    g: ca.g + (cb.g - ca.g) * weight,
    b: ca.b + (cb.b - ca.b) * weight,
  })
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h, s, l }
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = clampByte(l * 255)
    return { r: v, g: v, b: v }
  }
  const hue = (p, q, t) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: clampByte(hue(p, q, h + 1 / 3) * 255),
    g: clampByte(hue(p, q, h) * 255),
    b: clampByte(hue(p, q, h - 1 / 3) * 255),
  }
}

/** Rotate a colour's hue and optionally nudge saturation/lightness. */
export function shift(color, { hue = 0, saturation = 0, lightness = 0 } = {}) {
  const parsed = parseColor(color)
  if (!parsed) return color
  const hsl = rgbToHsl(parsed)
  const next = {
    h: (hsl.h + hue / 360 + 1) % 1,
    s: clamp(hsl.s + saturation, 0, 1),
    l: clamp(hsl.l + lightness, 0, 1),
  }
  return toHex(hslToRgb(next))
}

/** Push a colour away from a background until it reaches the contrast target. */
export function ensureContrast(color, background, minimum) {
  if (!parseColor(color) || !parseColor(background)) return color
  if (contrastRatio(color, background) >= minimum) return color
  const towardWhite = isLightColor(background) ? 'black' : 'white'
  let candidate = color
  for (let step = 1; step <= 20; step += 1) {
    candidate = mix(color, towardWhite, step / 20)
    if (contrastRatio(candidate, background) >= minimum) return candidate
  }
  return towardWhite
}

/** Pick the more readable of a light and a dark ink for a surface. */
export function readableInk(surface, light = '#f7fafc', dark = '#16181d') {
  return contrastRatio(light, surface) >= contrastRatio(dark, surface) ? light : dark
}

/**
 * Average a list of sampled pixels down to one colour.
 * @param {Array<{r:number,g:number,b:number,a:number}>} samples
 */
export function averageColor(samples) {
  const usable = samples.filter((s) => s && s.a > 0.2)
  if (usable.length === 0) return null
  const total = usable.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 },
  )
  return toHex({ r: total.r / usable.length, g: total.g / usable.length, b: total.b / usable.length })
}

/**
 * Build a complete, readable skin palette from a background and an accent.
 *
 * The ten colours follow the Codex theme contract, so an imported theme and a
 * generated one are indistinguishable to the renderer.
 *
 * @param {{ appearance?: 'light'|'dark'|'auto', background?: string, accent?: string, accentAlt?: string, name?: string }} input
 */
export function derivePalette(input = {}) {
  const appearance = input.appearance === 'light' || input.appearance === 'auto' ? input.appearance : 'dark'
  const dark = appearance !== 'light'
  const background = isColor(input.background) ? input.background : dark ? '#14161c' : '#f4f5f7'
  const accentSeed = isColor(input.accent) ? input.accent : dark ? '#7c9cff' : '#3f63d8'
  const panel = mix(background, dark ? '#ffffff' : '#000000', dark ? 0.05 : 0.03)
  const panelAlt = mix(background, dark ? '#ffffff' : '#000000', dark ? 0.11 : 0.07)
  const text = ensureContrast(dark ? '#eef2f6' : '#16181d', panel, 9)
  const muted = ensureContrast(mix(text, panel, 0.45), panel, 4.5)
  const accent = ensureContrast(accentSeed, panel, 3.2)
  const accentAlt = isColor(input.accentAlt)
    ? ensureContrast(input.accentAlt, panel, 3.2)
    : ensureContrast(shift(accent, { hue: 38, lightness: dark ? 0.1 : -0.04 }), panel, 3.2)
  const secondary = ensureContrast(shift(accent, { hue: -62, saturation: -0.05 }), panel, 3.2)
  const highlight = ensureContrast(shift(accent, { hue: 205, saturation: -0.1 }), panel, 3)
  const line = toRgba(text, dark ? 0.24 : 0.18)
  return {
    background: toHex(background),
    panel: toHex(panel),
    panelAlt: toHex(panelAlt),
    accent: toHex(accent),
    accentAlt: toHex(accentAlt),
    secondary: toHex(secondary),
    highlight: toHex(highlight),
    text: toHex(text),
    muted: toHex(muted),
    line,
  }
}

const KEYWORDS = [
  { match: /樱花|粉色|少女|甜|sakura|pink|blossom/i, appearance: 'light', accent: '#e0577f', background: '#fff6f8' },
  { match: /赛博|霓虹|cyber|neon|机甲|未来|futuristic/i, appearance: 'dark', accent: '#3fd2d8', background: '#0a1416' },
  { match: /海洋|深海|ocean|sea|aqua|水|蓝/i, appearance: 'dark', accent: '#4aa8e0', background: '#0b1a24' },
  { match: /森林|绿|forest|nature|苔|植物/i, appearance: 'dark', accent: '#6fbf5a', background: '#0d1a12' },
  { match: /日落|黄昏|橙|sunset|sunrise|暖/i, appearance: 'dark', accent: '#f08a3c', background: '#1d1210' },
  { match: /夜|暗黑|黑|dark|midnight|night|玄/i, appearance: 'dark', accent: '#8b93ff', background: '#0b0c10' },
  { match: /雪|白|简约|极简|light|minimal|clean/i, appearance: 'light', accent: '#3f63d8', background: '#f7f8fa' },
  { match: /紫|violet|purple|梦幻|星云/i, appearance: 'dark', accent: '#a06bff', background: '#120d1d' },
  { match: /金|gold|奢华|东方|仙/i, appearance: 'dark', accent: '#d9b86c', background: '#14120c' },
  { match: /红|crimson|血|赤/i, appearance: 'dark', accent: '#e0334a', background: '#160b0d' },
  { match: /青|teal|薄荷|mint/i, appearance: 'dark', accent: '#3fb8a0', background: '#0b1614' },
]

/**
 * Deterministic design direction for free-form text, used when no model is
 * reachable. Falls back to a stable hue derived from the prompt so different
 * prompts still produce different skins.
 */
export function directionFromText(text) {
  const prompt = typeof text === 'string' ? text : ''
  for (const entry of KEYWORDS) {
    if (entry.match.test(prompt)) {
      return { appearance: entry.appearance, accent: entry.accent, background: entry.background }
    }
  }
  let hash = 0
  for (const char of prompt) hash = (hash * 31 + char.codePointAt(0)) % 360
  const hsl = hslToRgb({ h: hash / 360, s: 0.55, l: 0.62 })
  return { appearance: 'dark', accent: toHex(hsl), background: shift(toHex(hsl), { saturation: -0.35, lightness: -0.4 }) }
}

/** Deterministic palette from free-form text. */
export function paletteFromText(text) {
  return derivePalette(directionFromText(text))
}

/**
 * Choose background and accent from colours sampled out of a wallpaper.
 * @param {string[]} colors
 */
export function paletteFromImageColors(colors) {
  const analyzed = analyzeImageColors(colors)
  return analyzed ? derivePalette(analyzed) : null
}

/** Appearance and seed colours implied by sampled wallpaper colours. */
export function analyzeImageColors(colors) {
  const usable = (Array.isArray(colors) ? colors : []).map(parseColor).filter(Boolean)
  if (usable.length === 0) return null
  const scored = usable.map((color) => {
    const hsl = rgbToHsl(color)
    return { color, hsl, chroma: hsl.s * (1 - Math.abs(hsl.l - 0.5) * 1.2) }
  })
  const sortedByLuma = [...scored].sort((a, b) => a.hsl.l - b.hsl.l)
  const darkest = sortedByLuma[0]
  const lightest = sortedByLuma[sortedByLuma.length - 1]
  const appearance = lightest.hsl.l > 0.72 ? 'light' : 'dark'
  const background = toHex(appearance === 'light' ? lightest.color : darkest.color)
  const accentPick = [...scored].sort((a, b) => b.chroma - a.chroma)[0]
  return { appearance, background, accent: toHex(accentPick.color) }
}

/** Normalize a loose palette object (for example model output) into ten colours. */
export function normalizePalette(input, fallbackInput = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const fallback = derivePalette(fallbackInput)
  const result = { ...fallback }
  for (const key of Object.keys(fallback)) {
    const value = source[key]
    if (typeof value === 'string' && isColor(value)) result[key] = key === 'line' ? value : toHex(value)
  }
  const appearance = source.appearance === 'light' || source.appearance === 'dark' ? source.appearance : undefined
  return { colors: result, appearance }
}