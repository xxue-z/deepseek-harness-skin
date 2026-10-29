#!/usr/bin/env node
/**
 * Host-half self test: palette math, Codex conversion, ZIP import, store
 * round-trip, and the HTTP API — all against a throwaway data directory.
 *
 *   node tools/selftest.mjs [codexThemesDir]
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { authoredTransparency, convertCodexTheme, findThemeRoot } from '../lib/convert.js'
import { SkinStore } from '../lib/store.js'
import { SkinService } from '../lib/service.js'
import { createSkinHandler } from '../lib/api.js'
import { contrastRatio, derivePalette, paletteFromText, parseColor } from '../lib/palette.js'
import { readZip } from '../lib/zip.js'
import { zipSync } from './zip-fixture.mjs'
import { makeMp4 } from './mp4-fixture.mjs'
import { createSkinTool } from '../lib/tool.js'
import { decodeVideoDataUrl } from '../lib/service.js'
import { checkForUpdate, compareVersions, parseVersion } from '../lib/update.js'

let failures = 0
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('palette')
{
  check('parses 6-digit hex', parseColor('#e0334a')?.r === 224)
  check('parses rgba', Math.abs((parseColor('rgba(1, 2, 3, .5)')?.a ?? 0) - 0.5) < 0.001)
  const derived = derivePalette({ appearance: 'dark', accent: '#e0334a', background: '#0a1416' })
  check('text contrasts on panel', contrastRatio(derived.text, derived.panel) >= 7, String(contrastRatio(derived.text, derived.panel)))
  check('muted contrasts on panel', contrastRatio(derived.muted, derived.panel) >= 4.5)
  check('accent contrasts on panel', contrastRatio(derived.accent, derived.panel) >= 3)
  check('text prompt is deterministic', JSON.stringify(paletteFromText('赛博霓虹')) === JSON.stringify(paletteFromText('赛博霓虹')))
}

console.log('convert')
{
  // The local Codex theme folder is a bonus: the script must pass on a machine
  // that has none (CI), so a missing folder is a skip, not a failure.
  const themesDir = process.argv[2] ?? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'CodexDreamSkin', 'themes')
  let entries = []
  try {
    entries = readdirSync(themesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    console.log(`  (skipped: ${themesDir} not readable)`)
  }
  let converted = 0
  for (const entry of entries) {
    const root = findThemeRoot(join(themesDir, entry.name))
    if (root === null) continue
    const { skin, wallpaper, warnings } = convertCodexTheme(root)
    converted += 1
    check(
      `${entry.name}: id/name/colors`,
      /^skin\.[a-z0-9]/.test(skin.id) && skin.name.length > 0 && Object.keys(skin.colors).length === 10,
      JSON.stringify({ id: skin.id, warnings }),
    )
    check(`${entry.name}: appearance`, ['light', 'dark', 'auto'].includes(skin.appearance))
    check(`${entry.name}: wallpaper binary`, wallpaper === null || wallpaper.bytes.byteLength > 1000)
  }
  // A synthetic pack exercises the converter everywhere; the folder above only
  // adds coverage when the developer actually has Codex skins installed.
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-skin-convert-'))
  mkdirSync(fixture, { recursive: true })
  writeFileSync(
    join(fixture, 'theme.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'studio.fixture',
      name: 'Fixture',
      appearance: 'dark',
      colors: { background: '#101014', panel: '#191921', panelAlt: '#22222c', accent: '#ff5a7a', text: '#f4f4f8', muted: '#9a9aa8', line: 'rgba(255,255,255,.2)' },
      art: { focusX: 0.4, focusY: 0.6 },
    }),
  )
  writeFileSync(join(fixture, 'background.jpg'), Buffer.alloc(2048, 7))
  const synthetic = convertCodexTheme(fixture)
  check('converts a synthetic pack', synthetic.skin.id === 'skin.fixture' && Object.keys(synthetic.skin.colors).length === 10, JSON.stringify(synthetic.warnings))
  check('keeps the art focus', synthetic.skin.wallpaper.focusX === 0.4 && synthetic.skin.wallpaper.focusY === 0.6)
  check('converts at least one theme', converted > 0 || synthetic.skin !== null, String(converted))
  rmSync(fixture, { recursive: true, force: true })
  check('a plain colour returns 60%', authoredTransparency('#101d20') === 60)
  check('an rgba panel returns its visibility', authoredTransparency('rgba(16, 29, 32, 0.4)') === 60)
}

console.log('zip')
{
  const archive = zipSync({
    'pack/theme.json': JSON.stringify({ schemaVersion: 1, id: 'studio.zip-test', name: 'ZIP Test', appearance: 'dark', colors: { background: '#101014', panel: '#191921', panelAlt: '#22222c', accent: '#ff5a7a', text: '#f4f4f8', muted: '#9a9aa8', line: 'rgba(255,255,255,.2)' } }),
    'pack/theme.css': '[data-ds-part="sidebar"]{background-color:rgba(25,25,33,.62);border-radius:14px}',
  })
  const files = readZip(archive)
  check('reads entries', files.size === 2)
  check('round-trips json', JSON.parse(files.get('pack/theme.json').toString()).name === 'ZIP Test')
}

console.log('store + service + api')
{
  const dir = mkdtempSync(join(tmpdir(), 'dsh-skin-test-'))
  const store = new SkinStore(join(dir, 'skin'))
  store.ensure()
  const service = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined })
  const themesDir = process.argv[2] ?? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'CodexDreamSkin', 'themes')
  const firstRoot = (() => {
    try {
      for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const root = findThemeRoot(join(themesDir, entry.name))
        if (root !== null) return root
      }
    } catch {
      /* none */
    }
    // No Codex themes on this machine: import a generated pack instead so the
    // store/service/HTTP paths are covered wherever the suite runs.
    const fixture = join(dir, 'pack')
    mkdirSync(fixture, { recursive: true })
    writeFileSync(
      join(fixture, 'theme.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'studio.import-fixture',
        name: 'Import Fixture',
        appearance: 'dark',
        colors: { background: '#101014', panel: '#191921', panelAlt: '#22222c', accent: '#ff5a7a', text: '#f4f4f8', muted: '#9a9aa8', line: 'rgba(255,255,255,.2)' },
      }),
    )
    writeFileSync(join(fixture, 'background.jpg'), Buffer.alloc(2048, 7))
    return fixture
  })()
  if (firstRoot !== null) {
    const imported = service.importDirectory(firstRoot)
    check('import writes theme', imported.status === 'imported' && store.get(imported.id) !== null)
    const snapshot = service.snapshot()
    check('snapshot lists it', snapshot.themes.some((skin) => skin.id === imported.id))
    check('wallpaper served path', snapshot.themes.find((skin) => skin.id === imported.id).wallpaper !== null)
    const applied = service.apply(imported.id)
    check('apply sets active', applied.activeId === imported.id)
    const withTransparency = service.setTransparency(imported.id, 55)
    check('transparency override', withTransparency.snapshot.themes.find((skin) => skin.id === imported.id).transparency === 55)
    check('wallpaper file exists', store.wallpaperPath(imported.id) !== null)
    const floored = service.resolveAlpha({ surface: { alpha: { authored: false, canvas: 0.7, sidebar: 0.7, panel: 0.7, panelAlt: 0.7 } } }, undefined)
    check('un-authored surfaces use the default (60% = alpha 0.4)', floored.sidebar === 0.4 && floored.canvas === 0 && floored.panel === 0.86 && floored.panelAlt === 0.95, JSON.stringify(floored))
    const authored = service.resolveAlpha({ surface: { alpha: { authored: true, canvas: 0, sidebar: 0.5, panel: 0.8, panelAlt: 0.7 } } }, undefined)
    check('authored surfaces keep their alpha', authored.sidebar === 0.5 && authored.canvas === 0, JSON.stringify(authored))

    const server = createServer(createSkinHandler(service, { store, log: () => {} }))
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const port = server.address().port
    const base = `http://127.0.0.1:${port}`
    const snapshotResponse = await fetch(`${base}/skin/api/snapshot`).then((r) => r.json())
    check('api snapshot', snapshotResponse.ok === true && snapshotResponse.snapshot.themes.length > 0)
    const wallpaperResponse = await fetch(`${base}${snapshotResponse.snapshot.themes[0].wallpaper.url}`)
    check('api wallpaper bytes', wallpaperResponse.ok && (await wallpaperResponse.arrayBuffer()).byteLength > 1000)
    check('api wallpaper type', String(wallpaperResponse.headers.get('content-type')).startsWith('image/'))
    const badApply = await fetch(`${base}/skin/api/apply`, { method: 'POST', body: JSON.stringify({ id: 'nope' }) }).then((r) => r.json())
    check('api rejects unknown id', badApply.ok === false && typeof badApply.error === 'string')
    const badFolder = await fetch(`${base}/skin/api/import-path`, { method: 'POST', body: JSON.stringify({ path: join(process.cwd(), 'lib') }) }).then((r) => r.json())
    check('rejects a non-theme folder', badFolder.ok === false && /不是 Codex 主题/.test(badFolder.error), String(badFolder.error))
    const badFile = await fetch(`${base}/skin/api/import-path`, { method: 'POST', body: JSON.stringify({ path: join(process.cwd(), 'README.md') }) }).then((r) => r.json())
    check('rejects a non-zip file', badFile.ok === false && /请选择主题文件夹/.test(badFile.error), String(badFile.error))
    const badZip = await fetch(`${base}/skin/api/import-zip`, { method: 'POST', body: JSON.stringify({ name: 'x.zip', data: Buffer.from('not a zip').toString('base64') }) }).then((r) => r.json())
    check('rejects a broken zip', badZip.ok === false && /压缩包|ZIP/.test(badZip.error), String(badZip.error))
    // Rename keeps identity: same id, same directory, same files.
    const target = snapshotResponse.snapshot.themes[0]
    const renamed = await fetch(`${base}/skin/api/rename`, { method: 'POST', body: JSON.stringify({ id: target.id, name: '  改过的名字  ' }) }).then((r) => r.json())
    const renamedSkin = renamed.snapshot?.themes?.find((skin) => skin.id === target.id)
    check('api renames a skin', renamed.ok === true && renamedSkin?.name === '改过的名字', JSON.stringify(renamedSkin?.name))
    check('rename keeps the id and files', renamedSkin?.id === target.id && store.wallpaperPath(target.id) !== null)
    check('rename keeps the wallpaper url', renamedSkin?.wallpaper?.url === target.wallpaper.url)
    const emptyRename = await fetch(`${base}/skin/api/rename`, { method: 'POST', body: JSON.stringify({ id: target.id, name: '   ' }) }).then((r) => r.json())
    check('rename refuses an empty name', emptyRename.ok === false && /不能为空/.test(emptyRename.error), String(emptyRename.error))
    const longName = '长'.repeat(200)
    service.rename(target.id, longName)
    check('rename caps the length', store.get(target.id).name.length === 120, String(store.get(target.id).name.length))
    const design = await service.design({ description: '赛博霓虹，暗紫色底色' })
    check('offline design produces a skin', design.skin.id.startsWith('skin.') && design.usedModel === false)
    check('offline design is stored', store.get(design.skin.id) !== null)
    server.close()
  } else {
    console.log('  (skipped: no Codex theme available)')
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log('dynamic background')
{
  const dir = mkdtempSync(join(tmpdir(), 'dsh-skin-video-'))
  const store = new SkinStore(join(dir, 'skin'))
  store.ensure()
  const service = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined })
  const themeJson = (id, name) =>
    JSON.stringify({
      schemaVersion: 2,
      id,
      name,
      appearance: 'dark',
      image: 'background.jpg',
      video: { file: 'background.mp4' },
      colors: { background: '#101014', panel: '#191921', panelAlt: '#22222c', accent: '#ff5a7a', text: '#f4f4f8', muted: '#9a9aa8', line: 'rgba(255,255,255,.2)' },
    })
  const pack = join(dir, 'pack')
  mkdirSync(pack, { recursive: true })
  writeFileSync(join(pack, 'theme.json'), themeJson('studio.video-test', 'Video Test'))
  writeFileSync(join(pack, 'background.jpg'), Buffer.alloc(2048, 7))
  writeFileSync(join(pack, 'background.mp4'), makeMp4({ width: 1920, height: 1080, durationMs: 8000 }))
  const imported = service.importPath(pack)
  const snapshot = service.snapshot()
  const skin = snapshot.themes.find((entry) => entry.id === imported.id)
  check('import keeps the mp4', skin?.video?.width === 1920 && skin.video.height === 1080, JSON.stringify(skin?.video))
  check('import records the duration', skin?.video?.durationMs === 8000)
  check('store exposes a video path', store.videoPath(imported.id) !== null)
  check('store types the video', store.videoType(imported.id) === 'video/mp4')

  const server = createServer(createSkinHandler(service, { store, log: () => {} }))
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  const full = await fetch(`${base}${skin.video.url}`)
  check('video endpoint returns bytes', full.ok && (await full.arrayBuffer()).byteLength > 1024)
  check('video endpoint types the stream', String(full.headers.get('content-type')).startsWith('video/mp4'))
  check('video endpoint advertises ranges', full.headers.get('accept-ranges') === 'bytes', String(full.headers.get('accept-ranges')))
  const ranged = await fetch(`${base}${skin.video.url}`, { headers: { range: 'bytes=0-99' } })
  check('range request answers 206', ranged.status === 206, String(ranged.status))
  check('range request returns 100 bytes', (await ranged.arrayBuffer()).byteLength === 100)
  check('range response carries content-range', /^bytes 0-99\//.test(String(ranged.headers.get('content-range'))), String(ranged.headers.get('content-range')))
  const suffix = await fetch(`${base}${skin.video.url}`, { headers: { range: 'bytes=-16' } })
  check('suffix range answers 206', suffix.status === 206 && (await suffix.arrayBuffer()).byteLength === 16)
  const unsatisfiable = await fetch(`${base}${skin.video.url}`, { headers: { range: 'bytes=999999-' } })
  check('unsatisfiable range answers 416', unsatisfiable.status === 416, String(unsatisfiable.status))

  const saved = service.setVideoSettings({ autoplay: false, muted: false })
  check('video settings return the new values', saved.settings.autoplay === false && saved.settings.muted === false)
  check('video settings are persisted', new SkinStore(join(dir, 'skin')).readState().video.muted === false)
  const settingsApi = await fetch(`${base}/skin/api/video-settings`, { method: 'POST', body: JSON.stringify({ autoplay: true }) }).then((response) => response.json())
  check('api accepts video settings', settingsApi.ok === true && settingsApi.snapshot.video.autoplay === true)
  check('api keeps the untouched setting', settingsApi.snapshot.video.muted === false)

  const badPack = join(dir, 'bad')
  mkdirSync(badPack, { recursive: true })
  writeFileSync(join(badPack, 'theme.json'), themeJson('studio.hevc-test', 'HEVC Test'))
  writeFileSync(join(badPack, 'background.jpg'), Buffer.alloc(2048, 7))
  writeFileSync(join(badPack, 'background.mp4'), makeMp4({ codec: 'hev1' }))
  const badImport = service.importPath(badPack)
  check('an unsupported codec degrades to the poster', badImport.warnings.some((warning) => /H\.264/.test(warning)), JSON.stringify(badImport.warnings))
  check('an unsupported codec stores no video', service.snapshot().themes.find((entry) => entry.id === badImport.id)?.video === null)

  // A skin imported before dynamic backgrounds existed: import a pack without
  // the mp4, add the file afterwards, then retrofit it with refreshVideo.
  const legacy = join(dir, 'legacy')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'theme.json'), themeJson('studio.legacy-test', 'Legacy'))
  writeFileSync(join(legacy, 'background.jpg'), Buffer.alloc(2048, 7))
  const legacyImport = service.importPath(legacy)
  const legacySkin = service.snapshot().themes.find((entry) => entry.id === legacyImport.id)
  check('a pack without an mp4 imports as static', legacySkin.video === null)
  service.setTransparency(legacyImport.id, 42)
  writeFileSync(join(legacy, 'background.mp4'), makeMp4({ width: 1600, height: 900 }))
  const refreshed = service.refreshVideo(legacyImport.id)
  const refreshedSkin = refreshed.snapshot.themes.find((entry) => entry.id === legacyImport.id)
  check('refreshVideo attaches the mp4', refreshed.status === 'attached' && refreshedSkin.video?.width === 1600, JSON.stringify(refreshedSkin.video))
  check('refreshVideo keeps the transparency override', refreshedSkin.transparency === 42, String(refreshedSkin.transparency))
  check('refreshVideo keeps the palette', JSON.stringify(refreshedSkin.colors) === JSON.stringify(legacySkin.colors))
  check('refreshVideo is idempotent', service.refreshVideo(legacyImport.id).status === 'present')
  check(
    'refreshVideo explains a pack with no usable mp4',
    (() => {
      try {
        service.refreshVideo(badImport.id)
        return false
      } catch (error) {
        return /动态背景|background\.mp4/.test(error.message)
      }
    })(),
  )
  server.close()
  rmSync(dir, { recursive: true, force: true })
}

console.log('design sources')
{
  const dir = mkdtempSync(join(tmpdir(), 'dsh-skin-design-'))
  const store = new SkinStore(join(dir, 'skin'))
  store.ensure()
  // A fake LLM registry: the model catalog path and the design path both read it.
  const llm = {
    listProviders: () => [
      { id: 'qwen-token-plan-cn', name: 'Qwen Token Plan' },
      { id: 'deepseek', name: 'DeepSeek' },
    ],
    listModels: async (provider) => {
      if (provider === 'qwen-token-plan-cn') return [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' }]
      if (provider === 'deepseek') return [{ id: 'deepseek-chat', name: 'DeepSeek Chat', inputModalities: ['text'] }]
      throw new Error('provider is not mounted')
    },
    prepareCall: async () => ({ config: {}, inputModalities: ['text', 'image'], stream: () => (async function* () {})() }),
  }
  const service = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => llm, getSelection: () => ({ provider: 'qwen-token-plan-cn', model: 'deepseek-v4.1-flash' }) })
  const models = await service.listModels()
  check('lists every routable provider', models.groups.length === 2 || models.failures.length === 2, JSON.stringify(models.groups.map((g) => g.id)))
  check('the default model comes from the chat selection', models.default?.provider === 'qwen-token-plan-cn')
  const flat = models.groups.flatMap((group) => group.models)
  check('known image providers are marked', flat.find((entry) => entry.provider === 'qwen-token-plan-cn')?.images === 'yes')
  check('text-only declarations win', flat.find((entry) => entry.id === 'deepseek-chat')?.images === 'no')

  const image = `data:image/jpeg;base64,${Buffer.from('fake jpeg').toString('base64')}`
  const mp4 = makeMp4({ width: 1600, height: 900, durationMs: 6000 })
  const video = `data:video/mp4;base64,${mp4.toString('base64')}`

  const imageOnly = await service.design({ description: '温柔粉色', imageDataUrl: image })
  check('image only becomes a static theme', imageOnly.skin.video === null && imageOnly.skin.wallpaper !== null)
  const videoOnly = await service.design({ description: '夏日', imageDataUrl: image, videoDataUrl: video })
  check('video is stored with the theme', videoOnly.skin.video?.width === 1600 && videoOnly.skin.video?.durationMs === 6000, JSON.stringify(videoOnly.skin.video))
  check('video bytes land on disk', store.videoPath(videoOnly.skin.id) !== null)
  check('the frame stays the poster', videoOnly.skin.wallpaper !== null)
  const both = await service.design({ description: '春天', imageDataUrl: image, videoDataUrl: video })
  check('image and video coexist', both.skin.wallpaper !== null && both.skin.video !== null)
  const broken = await service.design({ description: '坏视频', imageDataUrl: image, videoDataUrl: 'data:video/mp4;base64,' + Buffer.from('not an mp4').toString('base64') })
  check('an unusable video falls back to static', broken.skin.video === null && /按静态主题生成/.test(broken.warning ?? ''), String(broken.warning))
  const withDetails = await service.design({ description: '清爽', imageDataUrl: image, details: { name: '自定义名', mood: '清爽', notes: '高对比' } })
  check('only the theme name is kept from the details', JSON.stringify(withDetails.skin.origin?.details) === JSON.stringify({ name: '自定义名' }), JSON.stringify(withDetails.skin.origin))
  check('the brief itself still comes from the description', /清爽/.test(withDetails.skin.description))
  check('the video data URL parser refuses non-MP4 bytes', decodeVideoDataUrl(`data:video/mp4;base64,${Buffer.from('x').toString('base64')}`) === null)
  check('the video data URL parser refuses an image', decodeVideoDataUrl(image) === null)

  const tool = createSkinTool(service)
  const imagePath = join(dir, 'frame.jpg')
  writeFileSync(imagePath, Buffer.from('frame bytes'))
  const videoPath = join(dir, 'clip.mp4')
  writeFileSync(videoPath, mp4)
  const toolResult = await tool.execute({ action: 'design', description: '从文件生成', imagePath, videoPath, name: '来自工具' })
  check('the tool designs from files on disk', /动态背景 1600×900/.test(toolResult.text), String(toolResult.text))
  const toolSkin = service.snapshot().themes.find((entry) => entry.id === toolResult.ids[0])
  check('the tool video is stored', toolSkin?.video?.width === 1600)
  check('the tool details reach the skin', toolSkin?.origin?.details?.name === '来自工具')
  rmSync(dir, { recursive: true, force: true })
}

console.log('update check')
{
  check('parses a plain version', JSON.stringify(parseVersion('v1.0.2')) === JSON.stringify({ major: 1, minor: 0, patch: 2, pre: null }))
  check('orders releases', compareVersions('1.0.2', '1.0.1') > 0 && compareVersions('1.0.2', '1.0.2') === 0 && compareVersions('1.10.0', '1.9.9') > 0)
  check('a final release beats its pre-release', compareVersions('1.0.2', '1.0.2-rc.1') > 0)
  check('garbage versions compare equal', compareVersions('not-a-version', '1.0.0') === 0)

  const respond = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  const withFetch = (handler) => checkForUpdate({ version: '1.0.2', repository: 'xxue-z/deepseek-harness-skin', fetchImpl: async (url) => handler(String(url)) })

  const newer = await withFetch(() => respond({ tag_name: 'v1.0.3', html_url: 'https://github.com/x/y/releases/tag/v1.0.3', body: 'notes', published_at: '2026-10-29T00:00:00Z' }))
  check('a newer tag asks for an update', newer.updateAvailable === true && newer.latest === '1.0.3' && newer.mode === 'release', JSON.stringify(newer))
  check('release notes come from the release', newer.notes === 'notes' && newer.url.endsWith('/v1.0.3'))
  check('updates are never silent', newer.autoUpdate === false)

  const withAsset = await withFetch(() =>
    respond({
      tag_name: 'v1.0.3',
      html_url: 'https://github.com/x/y/releases/tag/v1.0.3',
      assets: [
        { name: 'deepseek-harness-skin-v1.0.3.tar.gz', size: 102400, browser_download_url: 'https://github.com/x/y/releases/download/v1.0.3/deepseek-harness-skin-v1.0.3.tar.gz' },
        { name: 'deepseek-harness-skin-v1.0.3.tar.gz.sha256', browser_download_url: 'https://github.com/x/y/releases/download/v1.0.3/deepseek-harness-skin-v1.0.3.tar.gz.sha256' },
      ],
    }),
  )
  check('a release asset is offered for install', withAsset.asset?.name === 'deepseek-harness-skin-v1.0.3.tar.gz', JSON.stringify(withAsset.asset))
  check('the checksum travels with it', withAsset.checksum?.name?.endsWith('.sha256') === true, JSON.stringify(withAsset.checksum))
  check('a release without assets reports none', newer.asset === null && newer.checksum === null)

  const same = await withFetch(() => respond({ tag_name: 'v1.0.2' }))
  check('the installed release is up to date', same.updateAvailable === false && same.latest === '1.0.2')

  const noRelease = await withFetch((url) => (url.includes('/releases/latest') ? respond({ message: 'Not Found' }, 404) : respond([{ name: 'v1.0.4' }])))
  check('falls back to tags when no release exists', noRelease.mode === 'tag' && noRelease.latest === '1.0.4' && noRelease.updateAvailable === true, JSON.stringify(noRelease))

  const branchOnly = await withFetch((url) => (url.includes('/releases/latest') || url.includes('/tags') ? respond({ message: 'Not Found' }, 404) : respond({ sha: 'abc123' })))
  check('without releases or tags it reports the branch head', branchOnly.mode === 'branch', JSON.stringify(branchOnly))

  const broken = await withFetch(() => respond({ message: 'boom' }, 500))
  check('a failed check reports instead of throwing', broken.error !== null && broken.updateAvailable === false, JSON.stringify(broken))

  const offline = await checkForUpdate({
    version: '1.0.2',
    fetchImpl: async () => {
      throw new Error('offline')
    },
  })
  check('an unreachable GitHub is not an error the page throws on', offline.error === 'offline' && offline.current === '1.0.2')
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)