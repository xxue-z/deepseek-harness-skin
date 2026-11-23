/**
 * The app's own backend API, called through the page it renders.
 *
 * Everything here is a thin wrapper over `window.go.app.App.*`: the Wails
 * bindings are regenerated for the running build, so the only stable contract
 * is "the method exists and takes JSON-shaped arguments". That is why these
 * wrappers agree on two conventions instead of modelling every field:
 *
 * - results are **projected inside the page** (the raw objects carry dozens of
 *   uninteresting fields and BigInt identifiers, and shipping those over the
 *   protocol is both slow and lossy);
 * - `bigint` values are converted to numbers before crossing the boundary.
 */
import { evaluate, literal } from './cdp.js'

/**
 * Helpers injected into every evaluation.
 *
 * `pick` normalises the two shapes the app returns: a history row wraps the
 * series (`{series: {...}, episodeIndex, videoId, positionSec}`), while a feed
 * or search hit is the series itself.
 */
const PRELUDE = `
const A = () => window.go.app.App;
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);
const pick = (raw) => {
  const s = (raw && raw.series) ? raw.series : (raw || {});
  return {
    id: String(s.id ?? ''),
    title: s.title ?? '',
    cover: s.cover ?? '',
    episodes: num(s.episodeCount ?? null),
    watched: num(s.watchedEpisode ?? null),
    tags: Array.isArray(s.tags) ? s.tags.slice(0, 8) : (s.tags ?? null),
    kind: num(s.kind ?? null),
    score: num(s.score ?? null),
    intro: String(s.intro ?? '').slice(0, 160),
    lastEpisode: (raw && raw.series) ? num(raw.episodeIndex) : null,
    positionSec: (raw && raw.series) ? num(raw.positionSec) : null,
    updatedAt: (raw && raw.series) ? num(raw.updatedAt) : null,
  };
};
const page = (payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
  return {
    keys: items.length > 0 ? Object.keys(items[0]) : [],
    items: items.map(pick),
    cursor: payload?.cursor ?? '',
    hasMore: payload?.hasMore === true,
  };
};
const str = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? Number(x) : x));
`

/**
 * Run one page-side snippet and parse its JSON answer.
 *
 * @param {number} port
 * @param {string} body JavaScript that ends in a `return` of a JSON string
 * @param {{timeoutMs?: number}} [options]
 */
async function run(port, body, options = {}) {
  const expression = `(async () => {${PRELUDE}\n${body}\n})()`
  const answer = await evaluate(port, expression, options)
  if (typeof answer !== 'string') return answer ?? null
  try {
    return JSON.parse(answer)
  } catch {
    return answer
  }
}

/** Login/engine state. Never fails on a logged-out app. */
export function status(port) {
  return run(port, 'return JSON.stringify(await A().Status())')
}

/** Tabs the feed exposes: 漫剧=36, 真人剧=39, 关注=45, 推荐=16. */
export function feedCategories(port) {
  return run(port, 'return JSON.stringify(await A().FeedCategories())')
}

/** Watch history, newest first. `cursor` is '' for the first page. */
export function history(port, cursor = '') {
  return run(port, `return JSON.stringify(page(await A().History(${literal(String(cursor))})))`)
}

/** Feed page for one tab (see `feedCategories`). */
export function recommend(port, cursor = '') {
  return run(port, `return JSON.stringify(page(await A().Recommend(${literal(String(cursor))})))`)
}

/** Keyword search; the second argument is the paging cursor, not an index. */
export function search(port, query, cursor = '') {
  return run(port, `return JSON.stringify(page(await A().Search(${literal(String(query))}, ${literal(String(cursor))})))`)
}

/** One series with its episode list. */
export function seriesDetail(port, seriesId) {
  return run(
    port,
    `const v = await A().SeriesDetail(${literal(String(seriesId))});
     const s = v || {};
     return str({
       id: String(s.id ?? ${literal(String(seriesId))}),
       title: s.title ?? '',
       intro: String(s.intro ?? '').slice(0, 400),
       cover: s.cover ?? '',
       episodes: num(s.episodeCount ?? null),
       watched: num(s.watchedEpisode ?? null),
       status: num(s.status ?? null),
       kind: num(s.kind ?? null),
       tags: Array.isArray(s.tags) ? s.tags.slice(0, 8) : null,
       seasonIndex: num(s.seasonIndex ?? null),
       multiSeason: s.multiSeason === true,
       episodeList: Array.isArray(s.episodes)
         ? s.episodes.slice(0, 200).map((e) => ({ index: num(e.index ?? e.episodeIndex ?? null), id: String(e.id ?? e.videoId ?? ''), title: e.title ?? '', duration: num(e.duration ?? null) }))
         : [],
     })`,
    { timeoutMs: 45000 },
  )
}

/**
 * Resolve playable URLs for one episode.
 *
 * The app proxies the (possibly encrypted) upstream stream through
 * `127.0.0.1:<port>/media/...` and appends `?audio=1` for the audio track, the
 * same URLs the desktop player hands to its `<video>` element.
 */
export function playInfo(port, seriesId, episode = '0') {
  return run(
    port,
    `const v = await A().PlayInfo(${literal(String(seriesId))}, ${literal(String(episode))});
     const q = Array.isArray(v?.qualities) ? v.qualities : [];
     return str({
       videoId: String(v?.videoId ?? ''),
       duration: num(v?.duration ?? null),
       resumeSec: num(v?.resumeSec ?? null),
       default: v?.default ?? '',
       loudness: v?.loudness ?? null,
       qualities: q.map((entry) => ({
         name: entry?.name ?? '',
         width: num(entry?.width ?? null),
         height: num(entry?.height ?? null),
         url: entry?.url ?? '',
         codec: entry?.codec ?? '',
       })),
     })`,
    { timeoutMs: 90000 },
  )
}

/** Shareable phone link for one episode (works without a device id). */
export function shareLink(port, seriesId, episode = '0') {
  return run(port, `return JSON.stringify(await A().ShareLink(${literal(String(seriesId))}, ${literal(String(episode))}))`)
}

/** Start the QR login flow; the app returns the QR payload to draw or open. */
export function qrLoginStart(port) {
  return run(port, 'return str(await A().QRLoginStart())', { timeoutMs: 45000 })
}

/** Poll once for the QR login result. */
export function qrLoginPoll(port) {
  return run(port, 'return str(await A().QRLoginPoll())', { timeoutMs: 45000 })
}

/** Cancel a pending QR login. */
export function qrLoginCancel(port) {
  return run(port, 'return str(await A().QRLoginCancel())')
}

/** Favourites / follow-up lists, both paged like the history list. */
export function favorites(port, cursor = '') {
  return run(port, `return JSON.stringify(page(await A().Favorites(${literal(String(cursor))})))`)
}

export function followUpdates(port, cursor = '') {
  return run(port, `return JSON.stringify(page(await A().FollowUpdates(${literal(String(cursor))})))`)
}