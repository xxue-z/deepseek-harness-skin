/**
 * The model-facing `skin_theme` tool.
 *
 * It shares every operation with the settings page: listing, importing Codex
 * packs, activating, tuning transparency, deleting, and designing from a
 * description. The tool only formats results; the service owns the behaviour.
 */
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const ACTIONS = ['list', 'detail', 'import', 'design', 'apply', 'deactivate', 'transparency', 'delete']

function text(value) {
  return [{ type: 'text', text: value }]
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

/**
 * Read the design media an agent pointed at.
 *
 * The tool takes a path or an http(s) URL for each source; the settings sheet
 * uploads bytes instead. Either way the service receives `data:` URLs, so the
 * two callers cannot drift apart. A missing or unreadable file is reported in
 * the returned note rather than aborting a design the agent can still do from
 * its description.
 */
async function loadToolMedia(args) {
  const result = { imageDataUrl: null, videoDataUrl: null, note: null }
  const load = async (source, kind) => {
    if (typeof source !== 'string' || source.trim() === '') return null
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source)
      if (!response.ok) throw new Error(`无法下载${kind}：HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const type = String(response.headers.get('content-type') ?? '').split(';')[0].trim()
      return { buffer, type, url: source }
    }
    const file = resolve(source)
    return { buffer: readFileSync(file), type: '', url: file, path: file }
  }
  try {
    const image = await load(args?.imagePath ?? args?.image, '图片')
    if (image) {
      const type = image.type.startsWith('image/') ? image.type : extensionMediaType(image.url, IMAGE_EXTENSIONS)
      result.imageDataUrl = `data:${type};base64,${image.buffer.toString('base64')}`
    }
    const video = await load(args?.videoPath ?? args?.video, '视频')
    if (video) result.videoDataUrl = `data:video/mp4;base64,${video.buffer.toString('base64')}`
  } catch (error) {
    result.note = error instanceof Error ? error.message : String(error)
  }
  return result
}

function extensionMediaType(name, extensions) {
  const extension = extname(String(name)).toLowerCase()
  if (!extensions.has(extension)) return 'image/jpeg'
  return extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.gif' ? 'image/gif' : 'image/jpeg'
}

/** Compact one-line summary of a skin for tool output. */
function summarize(skin, activeId) {
  const marker = skin.id === activeId ? '* ' : '  '
  const source = skin.origin?.kind === 'codex-import' ? `codex:${skin.origin.codexId}` : skin.origin?.kind ?? 'manual'
  const wallpaper = skin.wallpaper ? '壁纸' : '无壁纸'
  const video = skin.video ? `动态 ${skin.video.width}×${skin.video.height}` : '静态'
  return `${marker}${skin.id}  ${skin.name}  [${skin.appearance}/${source}/${wallpaper}/${video}]  透明度 ${skin.transparency}%`
}

/**
 * @param {import('./service.js').SkinService} service
 * @returns {object} a ToolDefinition
 */
export function createSkinTool(service) {
  return {
    name: 'skin_theme',
    description: [
      'Manage the app’s wallpaper skin library (the same library the settings page shows).',
      'Use action=list to browse skins and design to create a new one from a description;',
      'import converts Codex Dream Skin theme folders or .zip packs on this machine.',
      'apply switches the running app to a skin; deactivate returns to the built-in theme.',
      'A design can use an image and/or an MP4 given as a path or http(s) URL: with both, the image is the poster and the video plays behind the UI.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: 'Operation to perform.',
        },
        id: { type: 'string', description: 'Exact skin id, for detail/apply/delete/transparency.' },
        path: { type: 'string', description: 'Absolute path of a Codex theme folder or .zip pack, for import.' },
        description: { type: 'string', description: 'Short visual brief, for design (e.g. "赛博霓虹，暗紫底色").' },
        baseId: { type: 'string', description: 'Exact skin id to restyle, for design.' },
        transparency: { type: 'number', description: '0-100 wallpaper visibility, for transparency.' },
        palette: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional dominant colours sampled from a user image (hex), for design.',
        },
        imagePath: { type: 'string', description: 'Absolute path or http(s) URL of a wallpaper image, for design.' },
        videoPath: { type: 'string', description: 'Absolute path or http(s) URL of an H.264 MP4 (≤16 MB), for design; its first frame becomes the poster when no image is given.' },
        name: { type: 'string', description: 'Optional exact theme name the design must use.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          activeId: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['text'],
      },
      render(_args, value) {
        return text(typeof value?.text === 'string' ? value.text : JSON.stringify(value))
      },
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : ''
      const id = typeof args?.id === 'string' ? args.id : ''
      switch (action) {
        case 'list': {
          const snapshot = service.snapshot()
          if (snapshot.themes.length === 0) {
            return {
              text: '皮肤库是空的。可以先用 import 导入 Codex 主题，或用 design 生成一个。',
              activeId: snapshot.activeId ?? '',
              ids: [],
            }
          }
          const lines = snapshot.themes.map((skin) => summarize(skin, snapshot.activeId))
          return {
            text: [`共 ${snapshot.themes.length} 个皮肤（* 表示正在使用）：`, ...lines].join('\n'),
            activeId: snapshot.activeId ?? '',
            ids: snapshot.themes.map((skin) => skin.id),
          }
        }
        case 'detail': {
          const snapshot = service.snapshot()
          const skin = snapshot.themes.find((entry) => entry.id === id)
          if (!skin) throw new Error(`没有这个皮肤：${id}`)
          const lines = [
            `id: ${skin.id}`,
            `名称: ${skin.name}`,
            `描述: ${skin.description || '（无）'}`,
            `外观: ${skin.appearance}`,
            `配色: ${Object.entries(skin.colors).map(([key, value]) => `${key}=${value}`).join(', ')}`,
            `壁纸: ${skin.wallpaper ? `焦点 ${skin.wallpaper.focusX}/${skin.wallpaper.focusY}` : '无'}`,
            `动态背景: ${skin.video ? `${skin.video.width}×${skin.video.height} · ${(skin.video.durationMs / 1000).toFixed(1)}s · ${Math.round((skin.video.bytes ?? 0) / 1024 / 1024 * 10) / 10}MB` : '无'}`,
            `透明度: ${skin.transparency}%${skin.transparencyOverridden ? '（手动）' : '（原主题）'}`,
            `来源: ${JSON.stringify(skin.origin)}`,
            skin.codex?.tagline ? `原主题标语: ${skin.codex.tagline}` : null,
          ].filter(Boolean)
          return { text: lines.join('\n'), activeId: snapshot.activeId ?? '', ids: [skin.id] }
        }
        case 'import': {
          const result = service.importPath(args?.path)
          const snapshot = service.snapshot()
          const warnings = result.warnings?.length ? `\n注意：${result.warnings.join('；')}` : ''
          return {
            text: `已导入 ${result.id}（${result.name}）。${warnings}`,
            activeId: snapshot.activeId ?? '',
            ids: [result.id],
          }
        }
        case 'design': {
          const media = await loadToolMedia(args)
          const result = await service.design({
            description: typeof args?.description === 'string' ? args.description : '',
            palette: Array.isArray(args?.palette) ? args.palette.filter((value) => typeof value === 'string') : [],
            imageDataUrl: media.imageDataUrl,
            videoDataUrl: media.videoDataUrl,
            details: {
              name: typeof args?.name === 'string' ? args.name : '',
            },
            baseId: typeof args?.baseId === 'string' && args.baseId !== '' ? args.baseId : null,
          })
          const source = result.usedModel ? '模型生成' : '离线配色'
          const warning = [result.warning, media.note].filter(Boolean).join('；')
          const video = result.skin.video ? `，动态背景 ${result.skin.video.width}×${result.skin.video.height}` : '，静态主题'
          return {
            text: `已生成皮肤 ${result.skin.id}「${result.skin.name}」，${source}${video}${warning ? `（${warning}）` : ''}。用 apply 启用，或在设置页预览。`,
            activeId: service.snapshot().activeId ?? '',
            ids: [result.skin.id],
          }
        }
        case 'apply': {
          const snapshot = service.apply(id)
          const skin = snapshot.themes.find((entry) => entry.id === id)
          return { text: `已切换到「${skin?.name ?? id}」。`, activeId: snapshot.activeId ?? '', ids: [id] }
        }
        case 'deactivate': {
          const snapshot = service.deactivate()
          return { text: '已关闭皮肤，回到内置主题。', activeId: snapshot.activeId ?? '', ids: [] }
        }
        case 'transparency': {
          const value = Number(args?.transparency)
          const result = service.setTransparency(id, value)
          return {
            text: `「${id}」的透明度已设为 ${Math.round(value)}%（壁纸可见度）。`,
            activeId: result.snapshot.activeId ?? '',
            ids: [id],
          }
        }
        case 'delete': {
          const snapshot = service.remove(id)
          return { text: `已删除 ${id}。`, activeId: snapshot.activeId ?? '', ids: [] }
        }
        default:
          throw new Error(`未知 action：${action}（支持 ${ACTIONS.join(', ')}）`)
      }
    },
  }
}