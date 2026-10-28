/**
 * The theme-design agent.
 *
 * One operation, two callers: the manager's "AI 设计" panel and the
 * `skin_design` tool both call `generateSkin`. When a model is reachable the
 * model proposes the palette; when it is not (no provider, timeout, unparsable
 * reply) the same call falls back to a deterministic palette so the feature
 * still produces something usable.
 */
import { analyzeImageColors, derivePalette, directionFromText, isColor, normalizePalette, toHex } from './palette.js'

const MAX_TOKENS = 1600
const TIMEOUT_MS = 45_000

const SYSTEM_PROMPT = `You are a UI theme designer for the DeepSeek Harness desktop app.
Turn the user's brief into ONE theme and answer with a single JSON object and nothing else
(no markdown fence, no commentary).

Schema:
{
  "name": string,              // short theme name in the user's language, <= 20 chars
  "description": string,       // one sentence, <= 40 chars
  "appearance": "dark" | "light",
  "colors": {
    "background": "#rrggbb",   // canvas behind the wallpaper
    "panel": "#rrggbb",        // sidebar / raised surface
    "panelAlt": "#rrggbb",     // nested and overlay surface
    "accent": "#rrggbb",       // primary accent (buttons, links, focus)
    "accentAlt": "#rrggbb",    // secondary accent (warnings)
    "secondary": "#rrggbb",    // third accent (success)
    "highlight": "#rrggbb",    // decorative highlight
    "text": "#rrggbb",         // primary text
    "muted": "#rrggbb",        // secondary text
    "line": "rgba(r, g, b, a)" // border colour, alpha 0.15-0.45
  },
  "wallpaper": { "focusX": 0.5, "focusY": 0.5, "dim": 0.25 },
  "surface": { "radius": 16, "blur": 0 }
}

Rules:
- Colors must be valid CSS hex or rgba() strings.
- "text" must reach at least 7:1 contrast on "panel"; "muted" at least 4.5:1.
- "accent" must reach at least 3:1 contrast on "panel".
- Keep the whole palette coherent with the brief; dark briefs use a dark background.
- Never invent extra keys.`

/** Clamp a number into a range, tolerating strings from model output. */
function number(value, min, max, fallback) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/** Extract the first JSON object from a model reply. */
export function parseDesignJson(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

/** Compose the user-facing brief sent to the model. */
export function buildDesignPrompt({ description, palette, base, hasImage }) {
  const lines = [`Brief: ${description?.trim() || '一个干净、专业的主题'}`]
  if (Array.isArray(palette) && palette.length > 0) {
    lines.push(`Dominant colors sampled from the user's image: ${palette.slice(0, 8).join(', ')}`)
    lines.push('Use these as the palette anchor; keep text readable.')
  }
  if (hasImage) lines.push('A wallpaper image will be attached by the user; propose a dim level that keeps text readable over it.')
  if (base) {
    lines.push(
      `Base theme to modify (keep its identity unless the brief asks otherwise):\n${JSON.stringify({
        name: base.name,
        appearance: base.appearance,
        colors: base.colors,
        surface: base.surface ? { radius: base.surface.radius, blur: base.surface.blur } : undefined,
      })}`,
    )
  }
  lines.push('Return only the JSON object.')
  return lines.join('\n\n')
}

/**
 * Deterministic design used when no model reply is available.
 * @param {{ description?: string, palette?: string[], base?: object | null }} input
 */
export function fallbackDesign({ description = '', palette = [], base = null }) {
  const fromImage = Array.isArray(palette) && palette.length > 0 ? analyzeImageColors(palette) : null
  const fromText = directionFromText(description)
  const seed = fromImage ?? fromText
  const appearance = base?.appearance ?? seed.appearance ?? 'dark'
  const colors = derivePalette({ ...seed, appearance })
  const merged = base?.colors
    ? { ...colors, ...Object.fromEntries(Object.entries(base.colors).filter(([, value]) => isColor(value))) }
    : colors
  const named = base?.name ? `${base.name} · 变体` : nameFromPrompt(description)
  return {
    name: named,
    description: description.trim().slice(0, 40) || '按描述生成的离线配色',
    appearance,
    colors: merged,
    wallpaper: base?.wallpaper ? { ...base.wallpaper } : { focusX: 0.5, focusY: 0.5, dim: appearance === 'light' ? 0.18 : 0.26 },
    surface: base?.surface ? { radius: base.surface.radius ?? 16, blur: base.surface.blur ?? 0 } : { radius: 16, blur: 0 },
  }
}

function nameFromPrompt(description) {
  const cleaned = String(description ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
  if (cleaned === '') return 'AI 主题'
  const short = cleaned.slice(0, 12)
  return cleaned.length > 12 ? `${short}…` : short
}

/** Validate and normalize one model (or fallback) proposal into skin fields. */
export function normalizeDesign(proposal, { base = null, description = '', palette = [] } = {}) {
  const source = proposal && typeof proposal === 'object' ? proposal : {}
  const appearanceInput = source.appearance === 'light' ? 'light' : source.appearance === 'dark' ? 'dark' : null
  const seed = {
    appearance: appearanceInput ?? base?.appearance ?? 'dark',
    background: source.colors?.background ?? base?.colors?.background,
    accent: source.colors?.accent ?? base?.colors?.accent,
    accentAlt: source.colors?.accentAlt ?? base?.colors?.accentAlt,
  }
  const { colors, appearance } = normalizePalette(source.colors ?? {}, seed)
  // A partially specified palette keeps the model's explicit values but fills
  // the rest from a coherent derived set rather than from the previous theme.
  const effectiveAppearance = appearance ?? seed.appearance
  const wallpaperSource = source.wallpaper && typeof source.wallpaper === 'object' ? source.wallpaper : base?.wallpaper ?? {}
  return {
    name: typeof source.name === 'string' && source.name.trim() !== '' ? source.name.trim().slice(0, 40) : nameFromPrompt(description),
    description:
      typeof source.description === 'string' && source.description.trim() !== ''
        ? source.description.trim().slice(0, 80)
        : description.trim().slice(0, 40),
    appearance: effectiveAppearance === 'light' ? 'light' : 'dark',
    colors: { ...colors },
    wallpaper: {
      focusX: number(wallpaperSource.focusX, 0, 1, 0.5),
      focusY: number(wallpaperSource.focusY, 0, 1, 0.5),
      dim: number(wallpaperSource.dim, 0, 0.85, effectiveAppearance === 'light' ? 0.18 : 0.26),
    },
    surface: {
      radius: Math.round(number(source.surface?.radius, 6, 30, base?.surface?.radius ?? 16)),
      blur: Math.round(number(source.surface?.blur, 0, 30, base?.surface?.blur ?? 0)),
    },
  }
}

/** Join model helper: collect text deltas from an LLM stream. */
async function collectReply(stream) {
  let text = ''
  let failure = null
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'finish') {
      if (chunk.reason.kind === 'error') failure = chunk.reason.failure?.message ?? '模型调用失败'
      if (chunk.reason.kind === 'aborted') failure = '模型调用被取消'
      if (chunk.reason.kind === 'max-tokens') failure = '模型输出被截断'
    }
  }
  if (failure) throw new Error(failure)
  return text
}

/**
 * Ask the model for a theme; fall back deterministically on any failure.
 *
 * @param {{
 *   llm?: object, selection?: { provider: string, model: string } | null,
 *   description?: string, palette?: string[], base?: object | null, signal?: AbortSignal,
 * }} input
 * @returns {Promise<{ design: object, usedModel: boolean, warning: string | null }>}
 */
export async function generateSkin(input) {
  const { llm, selection, description = '', palette = [], base = null, signal } = input
  const proposal = { design: null, usedModel: false, warning: null }

  if (llm && selection?.provider && selection?.model) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const messages = [{ role: 'user', content: [{ type: 'text', text: buildDesignPrompt({ description, palette, base, hasImage: palette.length > 0 }) }] }]
      const prepared = typeof llm.prepareCall === 'function' ? await llm.prepareCall({ provider: selection.provider, model: selection.model, maxTokens: MAX_TOKENS }, controller.signal) : null
      const stream = prepared
        ? prepared.stream({ ...prepared.config, messages, system: SYSTEM_PROMPT, signal: controller.signal })
        : llm.stream({ provider: selection.provider, model: selection.model, messages, system: SYSTEM_PROMPT, maxTokens: MAX_TOKENS, signal: controller.signal })
      const reply = await collectReply(stream)
      const parsed = parseDesignJson(reply)
      if (parsed === null) {
        proposal.warning = '模型回复不是合法 JSON，已改用离线配色'
      } else {
        proposal.design = normalizeDesign(parsed, { base, description, palette })
        proposal.usedModel = true
      }
    } catch (error) {
      proposal.warning = `模型不可用（${error instanceof Error ? error.message : String(error)}），已改用离线配色`
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  } else {
    proposal.warning = '没有可用的默认模型，已改用离线配色'
  }

  if (proposal.design === null) {
    const fallback = fallbackDesign({ description, palette, base })
    proposal.design = normalizeDesign(fallback, { base, description, palette })
    if (proposal.warning === null) proposal.warning = '已改用离线配色'
  }
  return proposal
}

/** Build a skin document from a normalized design. */
export function skinFromDesign(design, { id, origin = 'generated', now = new Date(), wallpaper = null, css = '' } = {}) {
  const palette = derivePalette({
    appearance: design.appearance,
    background: design.colors?.background,
    accent: design.colors?.accent,
  })
  return {
    schemaVersion: 1,
    id,
    name: design.name,
    description: design.description,
    appearance: design.appearance,
    origin: { kind: origin, createdAt: now.toISOString() },
    wallpaper: wallpaper
      ? {
          file: wallpaper.file,
          focusX: design.wallpaper.focusX,
          focusY: design.wallpaper.focusY,
          dim: design.wallpaper.dim,
        }
      : null,
    colors: { ...palette, ...Object.fromEntries(Object.entries(design.colors ?? {}).filter(([, value]) => isColor(value))) },
    typography: { fontFamily: null },
    surface: {
      radius: design.surface.radius,
      blur: design.surface.blur,
      alpha: { canvas: null, sidebar: null, panel: null, panelAlt: null, authored: false },
    },
    css,
    createdAt: now.toISOString(),
  }
}

/** Short hex preview of a palette, used by tool output. */
export function paletteSummary(colors) {
  return Object.entries(colors ?? {})
    .map(([key, value]) => `${key}=${typeof value === 'string' ? toHex(value) : String(value)}`)
    .join(' ')
}