/**
 * The model-facing `hongguo` tool.
 *
 * It exists to do the three things the app's own UI cannot: read the user's
 * watch history into the conversation, rank candidates by a stated taste, and
 * put the result on screen as the app's background video.
 *
 * Playback happens in one of two ways, and the difference is deliberate:
 *
 * - `share` hands back a `novelquickapp.com` link, which is what a phone opens.
 * - `background` downloads the episode through the app's own local proxy into a
 *   folder and switches the skin playlist to it. The theme then plays it like
 *   any other clip — no CORS, no range plumbing, no codec gamble.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import * as api from './api.js'
import { clearClips, clipName, downloadClip, listClips } from './media.js'
import { invalidateListing } from '../playlist.js'

const ACTIONS = ['status', 'login', 'history', 'search', 'recommend', 'series', 'share', 'play', 'clips', 'prefetch']

/** Upper bound for one prefetch request; each episode is a few MB. */
const MAX_PREFETCH = 10

function text(value) {
  return [{ type: 'text', text: value }]
}

function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function tagList(tags) {
  return Array.isArray(tags) && tags.length > 0 ? tags.slice(0, 4).join('/') : '无标签'
}

function episodeLine(item) {
  const parts = []
  if (Number.isFinite(item.episodes) && item.episodes > 0) parts.push(`${item.episodes}集`)
  if (item.kind === 'comic') parts.push('漫剧')
  parts.push(tagList(item.tags))
  return parts.join(' · ')
}

/** History rows store a 0-based episode index; humans (and PlayInfo) use 1. */
function watchedAt(item) {
  if (!Number.isFinite(item.lastEpisode)) return ''
  const seconds = Number.isFinite(item.positionSec) ? Math.round(item.positionSec) : 0
  return `看到第${item.lastEpisode + 1}集 ${seconds}s`
}

/**
 * @param {{engine: object, service: object, clipsDir: string, log: (message: string) => void}} deps
 */
export function createHongguoPlayTool(deps) {
  const { engine, service, clipsDir, log } = deps
  /** CDP port of the instance in use; null until the engine answers. */
  let activePort = null

  async function ensurePort() {
    if (activePort) return activePort
    const engineInfo = await engine.ensure()
    activePort = engineInfo.port
    return activePort
  }

  function coverPath(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return ''
    return `/skin/hongguo/img?u=${encodeURIComponent(url)}`
  }

  function seriesLines(items, options = {}) {
    const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 12
    return items.slice(0, limit).map((item, index) => {
      const tail = options.watched ? ` · ${watchedAt(item)}` : ''
      return `${index + 1}. ${oneLine(item.title)} — ${episodeLine(item)}${tail} · id=${item.id}`
    })
  }

  /**
   * Resolve one episode's playable qualities.
   *
   * `PlayInfo` takes the *episode video id*, not the episode number: passing an
   * index makes the app ask upstream for a non-existent video, which comes back
   * as "服务端返回了空内容" or hangs. So resolve the index through SeriesDetail.
   */
  async function resolvePlay(seriesId, episodeIndex) {
    const port = await ensurePort()
    const detail = await api.seriesDetail(port, seriesId)
    const episodes = Array.isArray(detail?.episodeList) ? detail.episodeList : []
    const episode = episodes.find((entry) => Number(entry.index) === Number(episodeIndex)) ?? episodes[0]
    if (!episode?.id) throw new Error(`第 ${episodeIndex} 集没有 videoId`)
    const info = await api.playInfo(port, seriesId, episode.id)
    const qualities = Array.isArray(info?.qualities) ? info.qualities : []
    if (qualities.length === 0) throw new Error('这一集没有返回任何清晰度')
    // Prefer H.264 when the service offers it: the theme plays in Chromium,
    // where HEVC needs an OS codec pack. 红果 is mostly HEVC-only today.
    const h264 = qualities.find((entry) => /h\.?264|avc/i.test(String(entry.codec ?? '')))
    return { detail, episode, info, quality: h264 ?? qualities[qualities.length - 1], qualities }
  }

  /**
   * Download a run of episodes into the clip folder, skipping ones already there.
   *
   * Sequential on purpose: every episode costs one `PlayInfo` round-trip plus a
   * media transfer through the app's single loopback proxy, and the playlist
   * only ever needs them in order. Re-running is cheap because existing files
   * are skipped, so "prefetch 3 more" is safe to repeat.
   *
   * @param {{detail: object, from: number, count: number, onProgress?: (text: string) => void}} job
   * @returns {Promise<{downloaded: Array<{episode: number, bytes: number}>, skipped: number[]}>}
   */
  async function prefetchEpisodes({ detail, from, count, onProgress }) {
    const port = await ensurePort()
    const episodes = Array.isArray(detail?.episodeList) ? detail.episodeList : []
    const title = oneLine(detail?.title) || String(detail?.id ?? '')
    const wanted = episodes
      .filter((entry) => Number.isFinite(Number(entry.index)) && Number(entry.index) >= from)
      .slice(0, count)
    mkdirSync(clipsDir, { recursive: true })
    const downloaded = []
    const skipped = []
    for (const entry of wanted) {
      const index = Number(entry.index)
      const file = join(clipsDir, clipName(title, index))
      if (existsSync(file)) {
        skipped.push(index)
        continue
      }
      const info = await api.playInfo(port, String(detail.id), String(entry.id))
      const qualities = Array.isArray(info?.qualities) ? info.qualities : []
      const h264 = qualities.find((q) => /h\.?264|avc/i.test(String(q.codec ?? '')))
      const quality = h264 ?? qualities[qualities.length - 1]
      const url = String(quality?.url ?? '')
      if (url === '') {
        skipped.push(index)
        continue
      }
      onProgress?.(`hongguo: 预取第 ${index} 集（${quality.name || '默认'}）`)
      const result = await downloadClip({ url, directory: clipsDir, title, episode: index })
      downloaded.push({ episode: index, bytes: result.bytes })
    }
    if (downloaded.length > 0) invalidateListing(clipsDir)
    return { downloaded, skipped }
  }

  function audioUrl(url) {
    return `${url}${String(url).includes('?') ? '&' : '?'}audio=1`
  }

  return {
    name: 'hongguo',
    description: [
      '红果短剧（番茄短剧）内容助手：读用户的历史观看与追更、按方向搜索并排序推荐漫剧/短剧、给出可直接在手机打开的分享链接，',
      '或把某一集下载到本机并铺成 DSH 皮肤的动态视频背景。',
      '首次使用会自动下载约 18MB 的便携引擎并在后台离屏启动它（需要登录红果账号时用 action=login 扫码）。',
      'seriesId 与 episode（从 1 开始）来自 action=history / search / series 的输出。',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: 'Operation to perform.' },
        query: { type: 'string', description: 'Keyword for search.' },
        cursor: { type: 'string', description: 'Paging cursor from a previous page; omit for the first page.' },
        seriesId: { type: 'string', description: 'Series id, from history/search/series output.' },
        episode: { type: 'number', description: '1-based episode index, for share/play/prefetch. Defaults to 1.' },
        prefetch: {
          type: 'number',
          description: `How many following episodes to download ahead (0-${MAX_PREFETCH}); used by play mode=background and action=prefetch.`,
        },
        limit: { type: 'number', description: 'How many rows to print (default 12).' },
        mode: {
          type: 'string',
          enum: ['share', 'url', 'background'],
          description: 'For play: share=phone link, url=local media URL, background=download and use as the skin background.',
        },
        clips: {
          type: 'string',
          enum: ['list', 'clear'],
          description: 'For action=clips: list or delete the downloaded background clips.',
        },
        confirm: {
          type: 'boolean',
          description: 'For action=login: poll once for the result the phone confirmed (omit to just start the QR flow).',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      render(_args, value) {
        return text(typeof value?.text === 'string' ? value.text : JSON.stringify(value))
      },
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : ''
      const limit = Number(args?.limit)
      const episode = Number.isFinite(Number(args?.episode)) && Number(args.episode) >= 1 ? Math.floor(Number(args.episode)) : 1
      const prefetch = (() => {
        const value = Number(args?.prefetch)
        if (!Number.isFinite(value) || value <= 0) return 0
        return Math.min(MAX_PREFETCH, Math.floor(value))
      })()

      switch (action) {
        case 'status': {
          let port = null
          let engineLine = ''
          try {
            const info = await engine.ensure()
            activePort = info.port
            port = info.port
            engineLine = info.reused ? `红果引擎：复用已在运行的实例（CDP ${port}）` : `红果引擎：已启动（CDP ${port}）`
          } catch (error) {
            return { text: `红果引擎不可用：${error instanceof Error ? error.message : String(error)}` }
          }
          const state = await api.status(port)
          const account = state?.account ?? {}
          const login = account.loggedIn === true ? `已登录 ${oneLine(account.nickname)}（uid ${account.userId}）` : '未登录，用 action=login 扫码'
          let tabs = ''
          try {
            const feeds = await api.feedCategories(port)
            tabs = Array.isArray(feeds) ? feeds.map((entry) => `${entry.name}(${entry.tabType})`).join('  ') : ''
          } catch {
            tabs = ''
          }
          const clips = listClips(clipsDir)
          return {
            text: [
              engineLine,
              `登录：${login}`,
              tabs ? `分类：${tabs}` : '',
              `背景片段目录：${clipsDir}（${clips.length} 个文件）`,
            ]
              .filter(Boolean)
              .join('\n'),
          }
        }

        case 'login': {
          const port = await ensurePort()
          const state = await api.status(port)
          if (state?.account?.loggedIn === true) {
            return { text: `已经登录（${oneLine(state.account.nickname)}），无需重新扫码。` }
          }
          // `login` starts the QR flow; `login confirm:true` polls once for the
          // result the phone sent back.
          if (args?.confirm === true) {
            const polled = await api.qrLoginPoll(port)
            const after = await api.status(port)
            const done = after?.account?.loggedIn === true
            return {
              text: done
                ? `登录成功：${oneLine(after.account.nickname)}（uid ${after.account.userId}）。`
                : `还没确认登录。手机端结果：${JSON.stringify(polled).slice(0, 400)}\n可以在手机上点确认后再调一次 action=login confirm=true。`,
            }
          }
          const started = await api.qrLoginStart(port)
          return {
            text: [
              '已开始扫码登录。扫码入口在红果客户端窗口里（这台电脑上的引擎实例）。',
              '把二维码内容/链接发给用户，扫完在手机上确认，然后调：',
              'hongguo(action: "login", confirm: true)',
              `当前返回：${JSON.stringify(started).slice(0, 600)}`,
            ].join('\n'),
          }
        }

        case 'history': {
          const port = await ensurePort()
          const page = await api.history(port, typeof args?.cursor === 'string' ? args.cursor : '')
          const items = Array.isArray(page?.items) ? page.items : []
          if (items.length === 0) return { text: '历史记录是空的（或者还没登录）。' }
          const shown = seriesLines(items, { limit: Number.isFinite(limit) && limit > 0 ? limit : 20, watched: true })
          return {
            text: [`历史记录 ${items.length} 条：`, ...shown, page.hasMore ? `（还有更多，cursor=${page.cursor}）` : '']
              .filter(Boolean)
              .join('\n'),
          }
        }

        case 'search': {
          const query = typeof args?.query === 'string' ? args.query.trim() : ''
          if (query === '') throw new Error('search 需要 query')
          const port = await ensurePort()
          const page = await api.search(port, query, typeof args?.cursor === 'string' ? args.cursor : '')
          const items = Array.isArray(page?.items) ? page.items : []
          if (items.length === 0) return { text: `没有搜到「${query}」。` }
          const shown = seriesLines(items, { limit: Number.isFinite(limit) && limit > 0 ? limit : 12 })
          return {
            text: [`「${query}」搜到 ${items.length} 部：`, ...shown, page.hasMore ? `（还有更多，cursor=${page.cursor}）` : '']
              .filter(Boolean)
              .join('\n'),
          }
        }

        case 'recommend': {
          const port = await ensurePort()
          const page = await api.recommend(port, typeof args?.cursor === 'string' ? args.cursor : '')
          const items = Array.isArray(page?.items) ? page.items : []
          if (items.length === 0) return { text: '推荐流是空的。' }
          const shown = seriesLines(items, { limit: Number.isFinite(limit) && limit > 0 ? limit : 12 })
          const comics = items.filter((item) => item.kind === 'comic').length
          return {
            text: [`推荐流 ${items.length} 部（其中漫剧 ${comics} 部）：`, ...shown].join('\n'),
          }
        }

        case 'series': {
          const seriesId = typeof args?.seriesId === 'string' ? args.seriesId.trim() : ''
          if (seriesId === '') throw new Error('series 需要 seriesId')
          const port = await ensurePort()
          const detail = await api.seriesDetail(port, seriesId)
          const episodes = Array.isArray(detail?.episodeList) ? detail.episodeList : []
          const head = [
            `${oneLine(detail?.title)}（id=${detail?.id}）`,
            `${detail?.episodes ?? episodes.length} 集 · ${detail?.kind === 'comic' ? '漫剧' : '短剧'} · ${tagList(detail?.tags)} · ${detail?.status ?? ''}`,
            detail?.intro ? `简介：${oneLine(detail.intro).slice(0, 200)}` : '',
            episodes.length > 0 ? `集数：${episodes.slice(0, 15).map((entry) => `${entry.index}.${entry.title}(${entry.duration}s)`).join('  ')}` : '',
            `封面：${coverPath(detail?.cover) || '（无）'}`,
          ].filter(Boolean)
          return { text: head.join('\n') }
        }

        case 'share': {
          const seriesId = typeof args?.seriesId === 'string' ? args.seriesId.trim() : ''
          if (seriesId === '') throw new Error('share 需要 seriesId')
          const port = await ensurePort()
          const link = await api.shareLink(port, seriesId, String(episode))
          return { text: `第 ${episode} 集分享链接（手机打开即可播放）：\n${link}` }
        }

        case 'play': {
          const seriesId = typeof args?.seriesId === 'string' ? args.seriesId.trim() : ''
          if (seriesId === '') throw new Error('play 需要 seriesId')
          const mode = ['share', 'url', 'background'].includes(String(args?.mode)) ? String(args.mode) : 'share'
          const port = await ensurePort()

          if (mode === 'share') {
            const link = await api.shareLink(port, seriesId, String(episode))
            return { text: `第 ${episode} 集分享链接：\n${link}` }
          }

          const { quality, detail, episode: episodeInfo } = await resolvePlay(seriesId, episode)
          const url = String(quality.url ?? '')
          if (url === '') throw new Error('播放地址为空')
          const codec = String(quality.codec ?? '')

          if (mode === 'url') {
            const proxied = `/skin/hongguo/media?u=${encodeURIComponent(url)}`
            return {
              text: [
                `第 ${episode} 集 · ${quality.name || '默认清晰度'} ${quality.width ?? '?'}×${quality.height ?? '?'} · ${codec || '未知编码'}`,
                `本机可直接播放（同源代理，带音轨）：`,
                proxied,
                audioUrl(proxied),
              ].join('\n'),
            }
          }

          // background: download through the app's own proxy (it decrypts CENC on
          // the fly), then point the skin playlist at the folder.
          mkdirSync(clipsDir, { recursive: true })
          const title = oneLine(detail?.title) || seriesId
          log(`hongguo: 下载背景片段 ${title} 第${episode}集`)
          const downloaded = await downloadClip({ url, directory: clipsDir, title, episode })
          invalidateListing(clipsDir)
          service.setPlaylistSettings({ folder: clipsDir })
          service.setPlaylistEnabled(true)
          // Warm the next episodes *after* the current one is on screen, so the
          // user sees a background immediately and the playlist already holds
          // what comes next.
          let ahead = []
          if (prefetch > 0) {
            const run = await prefetchEpisodes({ detail, from: episode + 1, count: prefetch, onProgress: log })
            ahead = run.downloaded
          }
          const hevc = /bytevc1|hevc|h\.?265/i.test(codec) || codec === ''
          return {
            text: [
              `已下载第 ${episode} 集（${episodeInfo?.duration ? `${episodeInfo.duration}s · ` : ''}${Math.round((downloaded.bytes / 1048576) * 10) / 10} MB · ${quality.name || '默认'} ${quality.width ?? '?'}×${quality.height ?? '?'} · ${codec || '未知编码'}）。`,
              ahead.length > 0
                ? `已预取后续 ${ahead.length} 集：${ahead.map((entry) => `第${entry.episode}集(${Math.round((entry.bytes / 1048576) * 10) / 10}MB)`).join('、')}——播放到结尾会自动切下一集。`
                : '',
              `背景视频列表已切到这个目录并打开：${clipsDir}`,
              hevc
                ? '提示：这一集是 HEVC(H.265) 编码，Chromium 只有在系统装有「HEVC 视频扩展」时才能解码；播放器目录里就带了一个 `HEVC视频扩展-双击安装.appx`。若背景是黑的，装完它再重开应用即可。'
                : '',
              '注意：视频列表开关是内存态，重启应用后需要重新打开（设置 → 高级 里可以一键开）。',
            ]
              .filter(Boolean)
              .join('\n'),
          }
        }

        case 'prefetch': {
          const seriesId = typeof args?.seriesId === 'string' ? args.seriesId.trim() : ''
          if (seriesId === '') throw new Error('prefetch 需要 seriesId')
          const count = prefetch > 0 ? prefetch : 3
          const port = await ensurePort()
          const detail = await api.seriesDetail(port, seriesId)
          const run = await prefetchEpisodes({ detail, from: episode, count, onProgress: log })
          const lines = [
            `预取 ${oneLine(detail?.title) || seriesId} 第 ${episode} 集起 ${count} 集：`,
            run.downloaded.length > 0
              ? `新下载 ${run.downloaded.length} 集：${run.downloaded.map((entry) => `第${entry.episode}集(${Math.round((entry.bytes / 1048576) * 10) / 10}MB)`).join('、')}`
              : '没有新下载（都在本地了或没有播放地址）',
            run.skipped.length > 0 ? `跳过：${run.skipped.map((index) => `第${index}集`).join('、')}（已存在）` : '',
            `片段目录：${clipsDir}`,
            '背景列表没动；要让它们接在背景里播，用 play mode=background。',
          ].filter(Boolean)
          return { text: lines.join('\n') }
        }

        case 'clips': {
          const wanted = String(args?.clips ?? 'list')
          if (wanted === 'clear') {
            const removed = clearClips(clipsDir)
            invalidateListing(clipsDir)
            return { text: `已删除 ${removed} 个背景片段。` }
          }
          const files = listClips(clipsDir)
          if (files.length === 0) return { text: `背景片段目录还是空的：${clipsDir}` }
          return {
            text: [
              `背景片段目录：${clipsDir}`,
              ...files.map((file, index) => `${index + 1}. ${file.name} — ${Math.round(file.bytes / 1048576 * 10) / 10} MB`),
            ].join('\n'),
          }
        }

        default:
          throw new Error(`未知 action：${action}（支持 ${ACTIONS.join(', ')}）`)
      }
    },
  }
}