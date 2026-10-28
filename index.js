/**
 * @local/dsh-skin — Host half.
 *
 * Owns the skin library on disk, serves the `/skin` HTTP surface the Web client
 * calls, and registers the `skin_theme` agent tool. The Web half (client.js)
 * renders the manager and applies the selected skin through `ctx.theme`.
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createSkinHandler } from './lib/api.js'
import { defaultCodexDirs, SkinService } from './lib/service.js'
import { SkinStore } from './lib/store.js'
import { createSkinTool } from './lib/tool.js'

export const name = '@local/dsh-skin'

function normalizeConfig(config) {
  const input = config && typeof config === 'object' ? config : {}
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  const dataDir = typeof input.dataDir === 'string' && input.dataDir.trim() !== '' ? resolve(input.dataDir) : join(home, 'skin')
  const codexDirs = Array.isArray(input.codexDirs)
    ? input.codexDirs.filter((entry) => typeof entry === 'string' && entry.trim() !== '').map((entry) => resolve(entry))
    : []
  const model = input.designerModel
  const designerModel =
    model && typeof model === 'object' && typeof model.provider === 'string' && typeof model.model === 'string'
      ? { provider: model.provider, model: model.model }
      : null
  return {
    dataDir,
    codexDirs: codexDirs.length > 0 ? codexDirs : defaultCodexDirs(),
    designerModel,
    enableTool: input.enableTool !== false,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config
 */
export function apply(ctx, config) {
  const options = normalizeConfig(config)
  const store = new SkinStore(options.dataDir)
  store.ensure()

  const log = (message) => {
    try {
      ctx.logger?.warn?.(`[dsh-skin] ${message}`)
    } catch {
      /* no logger on this context */
    }
    if (ctx.logger === undefined) console.log(`[dsh-skin] ${message}`)
  }

  const service = new SkinService({
    store,
    config: options,
    getLlm: () => ctx.get('llm'),
    getSelection: () => ctx.get('agentDefaultModel')?.currentSelection(),
    getClientModules: () => ctx.get('clientModules'),
  })

  const handler = createSkinHandler(service, { store, log })

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({ kind: 'prefix', path: '/skin', handler }))
  })

  const toolState = { registered: false, error: null }
  service.getToolState = () => toolState
  if (options.enableTool) {
    ctx.inject(['tools'], (toolCtx) => {
      try {
        const disposer = toolCtx.tools.register(createSkinTool(service))
        toolState.registered = true
        toolState.error = null
        toolCtx.effect(() => disposer)
      } catch (error) {
        toolState.registered = false
        toolState.error = error instanceof Error ? error.message : String(error)
        log(`skin_theme 注册失败：${toolState.error}`)
      }
    })
  }
}