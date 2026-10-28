#!/usr/bin/env node
/**
 * Host-half self test: palette math, Codex conversion, ZIP import, store
 * round-trip, and the HTTP API — all against a throwaway data directory.
 *
 *   node tools/selftest.mjs [codexThemesDir]
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authoredTransparency, convertCodexTheme, findThemeRoot } from '../lib/convert.js'
import { SkinStore } from '../lib/store.js'
import { SkinService } from '../lib/service.js'
import { createSkinHandler } from '../lib/api.js'
import { contrastRatio, derivePalette, paletteFromText, parseColor } from '../lib/palette.js'
import { readZip } from '../lib/zip.js'
import { zipSync } from './zip-fixture.mjs'
import { makeMp4 } from './mp4-fixture.mjs'

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
  const themesDir = process.argv[2] ?? 'C:/Users/deyu.zhu/AppData/Local/CodexDreamSkin/themes'
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
  check('converted at least one theme', converted > 0, String(converted))
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
  const themesDir = process.argv[2] ?? 'C:/Users/deyu.zhu/AppData/Local/CodexDreamSkin/themes'
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
    return null
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

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)