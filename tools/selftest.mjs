#!/usr/bin/env node
/**
 * Host-half self test: palette math, Codex conversion, ZIP import, store
 * round-trip, and the HTTP API — all against a throwaway data directory.
 *
 *   node tools/selftest.mjs [codexThemesDir]
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authoredTransparency, convertCodexTheme, findThemeRoot } from '../lib/convert.js'
import { SkinStore } from '../lib/store.js'
import { SkinService } from '../lib/service.js'
import { assertReleaseUrl, createSkinHandler, fetchReleaseAsset } from '../lib/api.js'
import { contrastRatio, derivePalette, paletteFromText, parseColor } from '../lib/palette.js'
import { readZip } from '../lib/zip.js'
import { zipSync } from './zip-fixture.mjs'
import { makeMp4 } from './mp4-fixture.mjs'
import { makeTarball } from './tar-fixture.mjs'
import { createSkinTool } from '../lib/tool.js'
import { decodeVideoDataUrl } from '../lib/service.js'
import { checkForUpdate, compareVersions, parseVersion } from '../lib/update.js'
import { listBundled, seedBundledThemes } from '../lib/bundled.js'
import { installStagedBundle, readTarGz, unpackBundle } from '../index.js'

/** Package root, shared with the bundled-theme checks below. */
const here = dirname(fileURLToPath(import.meta.url))

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

  // A theme that stopped playing must not keep its mp4 open. The check opens the
  // file for writing: on Windows a live handle elsewhere makes that fail.
  const released = await fetch(`${base}/skin/api/release-video`, { method: 'POST', body: JSON.stringify({ id: skin.id }) }).then((response) => response.json())
  check('release-video reports the handle state', released.ok === true && ['released', 'inUse'].includes(released.lock), JSON.stringify(released))
  check('a finished request releases the file', released.lock === 'released', `lock=${released.lock}`)
  const noVideo = await fetch(`${base}/skin/api/release-video`, { method: 'POST', body: JSON.stringify({ id: 'skin.missing' }) }).then((response) => response.json())
  check('release-video tolerates a theme without video', noVideo.ok === true && noVideo.lock === 'absent', JSON.stringify(noVideo))

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

console.log('folder playlist')
{
  const dir = mkdtempSync(join(tmpdir(), 'dsh-skin-playlist-'))
  const store = new SkinStore(join(dir, 'skin'))
  store.ensure()
  const service = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined })
  const folder = join(dir, 'clips')
  mkdirSync(folder, { recursive: true })
  for (const name of ['第10集.mp4', '第2集.mp4', '第1集.mp4']) writeFileSync(join(folder, name), Buffer.alloc(1024, 3))
  writeFileSync(join(folder, 'notes.txt'), 'not a video')
  mkdirSync(join(folder, 'sub'), { recursive: true })
  writeFileSync(join(folder, 'sub', 'nested.mp4'), Buffer.alloc(16, 1))

  const listing = service.listPlaylistVideos(folder)
  check('the listing keeps only videos', listing.videos.length === 3, JSON.stringify(listing.videos.map((entry) => entry.name)))
  check('the listing follows natural order', listing.videos.map((entry) => entry.name).join(',') === '第1集.mp4,第2集.mp4,第10集.mp4', listing.videos.map((entry) => entry.name).join(','))
  check('the listing does not recurse', !listing.videos.some((entry) => entry.name === 'nested.mp4'))
  check('the listing carries signatures in order', listing.order.length === 3 && listing.order[0].startsWith('第1集.mp4\u0000'))
  check('every clip gets an asset url', listing.videos.every((entry) => entry.url.startsWith('/skin/assets/playlist/video?folder=')))

  const saved = service.setPlaylistSettings({ folder, speed: 1.5, pictureInPicture: true })
  check('settings are saved', saved.settings.folder === folder && saved.settings.speed === 1.5 && saved.settings.pictureInPicture === true, JSON.stringify(saved.settings))
  check('the folder joins the history', saved.settings.history[0] === folder, JSON.stringify(saved.settings.history))
  check('settings are persisted', new SkinStore(join(dir, 'skin')).readState().playlist.speed === 1.5)
  service.setPlaylistSettings({ speed: 3 })
  check('an unsupported speed falls back to 1x', service.playlistSettings().speed === 1, String(service.playlistSettings().speed))
  service.setPlaylistSettings({ folder: 'relative/path' })
  check('a relative folder is refused', service.playlistSettings().folder === '', service.playlistSettings().folder)
  service.setPlaylistSettings({ folder })

  // The switch itself must never survive a restart.
  check('the switch starts off', service.getPlaylistStatus().enabled === false)
  service.setPlaylistEnabled(true)
  check('the switch turns on', service.getPlaylistStatus().enabled === true && service.snapshot().playlist.enabled === true)
  check(
    'a restarted service starts switched off',
    new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined }).getPlaylistStatus().enabled === false,
  )

  // Position: remember the middle clip, then delete it and fall back.
  service.trackPlaylist({ folder, signature: listing.order[1], index: 1, second: 42.5 })
  const restored = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined }).getPlaylistStatus().tracked
  check('the position survives a restart', restored.signature === listing.order[1] && restored.second === 42.5, JSON.stringify(restored))
  service.trackPlaylist({ folder: dir, index: 2, second: 1 })
  check('a folder that was never configured is refused', service.getPlaylistStatus().tracked.folder === folder, service.getPlaylistStatus().tracked.folder)

  // Turning the switch off must not forget where the folder was left.
  service.setPlaylistEnabled(true)
  service.trackPlaylist({ folder, signature: listing.order[2], index: 2, second: 77 })
  service.setPlaylistEnabled(false)
  const afterOff = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined }).getPlaylistStatus()
  check('the switch is off after turning it off', afterOff.enabled === false)
  check('turning it off keeps the playback position', afterOff.tracked.signature === listing.order[2] && afterOff.tracked.second === 77, JSON.stringify(afterOff.tracked))

  // The asset route: bytes, ranges, and refusal outside the folder.
  const server = createServer(createSkinHandler(service, { store, log: () => {} }))
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = await fetch(`${base}/skin/api/videos?folder=${encodeURIComponent(folder)}`).then((response) => response.json())
  check('the api lists the folder', api.ok === true && api.videos.length === 3, JSON.stringify(api).slice(0, 160))
  const clip = await fetch(`${base}${api.videos[0].url}`)
  check('the asset route serves the clip', clip.ok === true && (await clip.arrayBuffer()).byteLength === 1024, String(clip.status))
  check('the asset route types the clip', String(clip.headers.get('content-type')).startsWith('video/mp4'))
  check('the asset route advertises ranges', clip.headers.get('accept-ranges') === 'bytes')
  const part = await fetch(`${base}${api.videos[0].url}`, { headers: { range: 'bytes=10-19' } })
  check('the asset route answers a range', part.status === 206 && (await part.arrayBuffer()).byteLength === 10, String(part.status))
  const escape = await fetch(`${base}/skin/assets/playlist/video?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent('..\\notes.txt')}`)
  check('a parent path is refused', escape.status === 404, String(escape.status))
  const nested = await fetch(`${base}/skin/assets/playlist/video?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent('sub/nested.mp4')}`)
  check('a nested path is refused', nested.status === 404, String(nested.status))
  const outside = await fetch(`${base}/skin/assets/playlist/video?folder=${encodeURIComponent(dir)}&name=skin%2Fstate.json`)
  check('a file outside the folder is refused', outside.status === 404, String(outside.status))
  const unknown = await fetch(`${base}/skin/api/videos?folder=${encodeURIComponent(join(dir, 'missing'))}`).then((response) => response.json())
  check('a missing folder reports why', unknown.ok === false && /不存在/.test(unknown.error), JSON.stringify(unknown))
  server.close()
  service.stop()
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

console.log('update state against disk')
{
  // The version in Settings is read once, at process start. The files can be
  // newer than that, and the page has to be able to tell — otherwise it keeps
  // offering "download and update" for a release that is already installed.
  const dir = mkdtempSync(join(tmpdir(), 'dsh-skin-updatestate-'))
  const store = new SkinStore(join(dir, 'skin'))
  store.ensure()
  const makeService = (running, disk) => {
    const service = new SkinService({ store, config: { codexDirs: [] }, getLlm: () => undefined, getSelection: () => undefined })
    let onDisk = disk
    service.updateState = () => ({
      runningVersion: running,
      diskVersion: onDisk,
      pendingRestart: onDisk !== '0.0.0' && onDisk !== running,
    })
    service.updateCheck = async () => ({ current: running, latest: '1.0.14', updateAvailable: compareVersions('1.0.14', running) > 0, error: null })
    return { service, setLatest: (latest) => { service.updateCheck = async () => ({ current: running, latest, updateAvailable: compareVersions(latest, running) > 0, error: null }) } }
  }

  const call = async (entry) => {
    const server = createServer(createSkinHandler(entry.service, { store, log: () => {} }))
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const checkResult = await fetch(`${base}/skin/update-check`).then((r) => r.json())
      const stateResult = await fetch(`${base}/skin/update/state`).then((r) => r.json())
      return { check: checkResult, state: stateResult }
    } finally {
      server.close()
    }
  }

  // Running 1.0.13, disk 1.0.13: nothing to do.
  {
    const { check: result, state } = await call(makeService('1.0.13', '1.0.13'))
    // The page rejects a response without `ok` as "接口返回异常（HTTP 200）",
    // however good the rest of it is.
    check('the update check keeps its ok envelope', result.ok === true, JSON.stringify(Object.keys(result)))
    check('the update state keeps its ok envelope', state.ok === true, JSON.stringify(Object.keys(state)))
    check('a newer release is still offered when the disk is old', result.updateAvailable === true, JSON.stringify({ updateAvailable: result.updateAvailable, latest: result.latest }))
    check('an in-sync install is not flagged as installed', result.alreadyInstalled === false, JSON.stringify(result))
    check('an in-sync install is not pending a restart', state.pendingRestart === false, JSON.stringify(state))
  }

  // Running 1.0.13, disk 1.0.14: the release is already installed, so the page
  // must stop offering it and ask for a restart instead.
  {
    const { check: result, state } = await call(makeService('1.0.13', '1.0.14'))
    check('an installed-but-not-running release is flagged', result.alreadyInstalled === true, JSON.stringify(result))
    check('an installed release is not offered again', result.updateAvailable === false, JSON.stringify(result))
    check('the running and disk versions are both reported', result.running === '1.0.13' && result.installed === '1.0.14', JSON.stringify({ running: result.running, installed: result.installed }))
    check('the state says a restart is pending', state.pendingRestart === true, JSON.stringify(state))
  }

  // Running 1.0.13, disk 1.0.14, and a 1.0.15 appears: still an update to offer.
  {
    const entry = makeService('1.0.13', '1.0.14')
    entry.setLatest('1.0.15')
    const { check: result } = await call(entry)
    check('a release newer than the disk is offered again', result.updateAvailable === true && result.alreadyInstalled === false, JSON.stringify({ updateAvailable: result.updateAvailable, alreadyInstalled: result.alreadyInstalled }))
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log('update download proxy')
{
  // The page cannot fetch a release itself: neither GitHub hop sends a CORS
  // header. The Host fetches it instead, so its URL checks are the only thing
  // standing between the page and an arbitrary download.
  const response = (body, headers = {}) => ({
    ok: true,
    status: 200,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  })

  const refused = (url) => {
    try {
      assertReleaseUrl(url)
      return null
    } catch (error) {
      return error
    }
  }
  check('a release URL on GitHub passes', refused('https://github.com/x/y/releases/download/v1.0.3/a.tgz') === null)
  check('the asset host passes', refused('https://release-assets.githubusercontent.com/a.tgz?sig=1') === null)
  check('another host is refused', /不支持的更新下载源/.test(refused('https://evil.example/a.tgz')?.message ?? ''))
  check('plain http is refused', /https/.test(refused('http://github.com/x/y/a.tgz')?.message ?? ''))
  check('a file URL is refused', /https/.test(refused('file:///C:/Windows/System32/notepad.exe')?.message ?? ''))
  check('garbage is refused', /不合法/.test(refused('not a url')?.message ?? ''))

  const assetUrl = 'https://github.com/x/y/releases/download/v1.0.3/a.tgz'

  // Real bytes come back, and the download follows the redirect the way curl
  // in a shell would (the Host is not subject to CORS).
  const fetched = await fetchReleaseAsset(assetUrl, {
    fetchImpl: async (url, options) => {
      check('the Host follows redirects itself', options?.redirect === 'follow', String(options?.redirect))
      return response(new Uint8Array([42, 43, 44]), { 'content-type': 'application/octet-stream' })
    },
  })
  check('the proxy returns the asset bytes', fetched.bytes.length === 3 && fetched.bytes[0] === 42)
  check('the proxy reports the content type', fetched.contentType === 'application/octet-stream')

  // Size limits come from both the declared length and the actual body.
  const tooBigDeclared = await fetchReleaseAsset(assetUrl, {
    maxBytes: 2,
    fetchImpl: async () => response(new Uint8Array([1]), { 'content-length': '999' }),
  }).then(
    () => null,
    (error) => error,
  )
  check('an oversized declared length is refused', /过大/.test(tooBigDeclared?.message ?? ''), String(tooBigDeclared?.message))

  const tooBigBody = await fetchReleaseAsset(assetUrl, {
    maxBytes: 2,
    fetchImpl: async () => response(new Uint8Array([1, 2, 3])),
  }).then(
    () => null,
    (error) => error,
  )
  check('an oversized body is refused', /过大/.test(tooBigBody?.message ?? ''), String(tooBigBody?.message))

  const empty = await fetchReleaseAsset(assetUrl, { fetchImpl: async () => response(new Uint8Array(0)) }).then(
    () => null,
    (error) => error,
  )
  check('an empty body is refused', /为空/.test(empty?.message ?? ''), String(empty?.message))

  const failed = await fetchReleaseAsset(assetUrl, {
    fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }),
  }).then(
    () => null,
    (error) => error,
  )
  check('a GitHub error is reported with its status', /HTTP 404/.test(failed?.message ?? ''), String(failed?.message))

  // A download that never finishes has to end, not hang the request.
  const timedOut = await fetchReleaseAsset(assetUrl, {
    timeoutMs: 20,
    fetchImpl: (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      }),
  }).then(
    () => null,
    (error) => error,
  )
  check('a stalled download times out', /超时/.test(timedOut?.message ?? ''), String(timedOut?.message))
}

console.log('update install')
{
  // The release asset is a .tar.gz. Staging has to unpack it: the swap is a
  // rename of a directory, and an installed tree is not one archive.
  const manifest = JSON.stringify({ name: '@xxue-z/dsh-skin', version: '1.0.11' })
  const bundle = makeTarball([
    { path: './package.json', data: Buffer.from(manifest) },
    { path: './index.js', data: Buffer.from('export {}\n') },
    { path: './lib/', dir: true },
    { path: './lib/playlist.js', data: Buffer.from('// playlist\n') },
    { path: './bundled-themes/', dir: true },
  ])
  const unpackRoot = mkdtempSync(join(tmpdir(), 'dsh-skin-unpack-'))
  const unpacked = unpackBundle(bundle, unpackRoot)
  check('a release tarball unpacks', unpacked.files === 3, JSON.stringify(unpacked))
  check('the unpacked manifest is the bundle one', readFileSync(join(unpackRoot, 'package.json'), 'utf8') === manifest)
  check('nested files land in place', readFileSync(join(unpackRoot, 'lib', 'playlist.js'), 'utf8') === '// playlist\n')
  check('directories are created', statSync(join(unpackRoot, 'bundled-themes')).isDirectory())
  rmSync(unpackRoot, { recursive: true, force: true })

  // A member that climbs out of the target is refused, and nothing is written
  // outside it.
  const escapeRoot = mkdtempSync(join(tmpdir(), 'dsh-skin-escape-'))
  let escaped = null
  try {
    unpackBundle(
      makeTarball([
        { path: './package.json', data: Buffer.from('{}') },
        { path: '../evil.txt', data: Buffer.from('x') },
      ]),
      join(escapeRoot, 'nested'),
    )
  } catch (error) {
    escaped = error
  }
  check('a path escaping the target is refused', /越界路径/.test(escaped?.message ?? ''), String(escaped?.message))
  check('the escaping path was not written', !existsSync(join(escapeRoot, 'evil.txt')))
  rmSync(escapeRoot, { recursive: true, force: true })

  // A bundle without a manifest is exactly the failure this used to ship:
  // it must be named at unpack time, not at swap time.
  const noManifestRoot = mkdtempSync(join(tmpdir(), 'dsh-skin-badmanifest-'))
  let missingManifest = null
  try {
    unpackBundle(makeTarball([{ path: './index.js', data: Buffer.from('x') }]), noManifestRoot)
  } catch (error) {
    missingManifest = error
  }
  check('a tarball without a manifest is refused', /缺少 package.json/.test(missingManifest?.message ?? ''), String(missingManifest?.message))
  rmSync(noManifestRoot, { recursive: true, force: true })

  const rejects = (bytes) => {
    try {
      readTarGz(bytes)
      return null
    } catch (error) {
      return error
    }
  }
  check('a non-gzip body is refused', /gzip/.test(rejects(Buffer.from('not a tarball'))?.message ?? ''), String(rejects(Buffer.from('not a tarball'))?.message))
  check('an empty body is refused', /为空/.test(rejects(Buffer.alloc(0))?.message ?? ''), String(rejects(Buffer.alloc(0))?.message))

  // The profile links the package (plugin_manager install_bundle), so the
  // directory the plugin runs in can be a junction into the user's checkout.
  // installStagedBundle must refuse that rename — otherwise only the link is
  // moved aside and the plugin silently stays on its old version.
  const directory = mkdtempSync(join(tmpdir(), 'dsh-skin-install-'))
  const library = join(directory, 'skin')
  const install = join(directory, 'checkout')
  mkdirSync(install)
  writeFileSync(join(install, 'package.json'), JSON.stringify({ name: '@xxue-z/dsh-skin', version: '1.0.8' }))
  const staging = join(library, 'update', 'v-1.0.9-x')
  mkdirSync(staging, { recursive: true })
  writeFileSync(join(staging, 'package.json'), JSON.stringify({ name: '@xxue-z/dsh-skin', version: '1.0.9' }))
  const readVersionAt = (path) => JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).version

  // The plain case first: an ordinary installed directory is swapped.
  const plain = join(directory, 'plain')
  mkdirSync(plain)
  writeFileSync(join(plain, 'package.json'), JSON.stringify({ name: '@xxue-z/dsh-skin', version: '1.0.8' }))
  const swapped = await installStagedBundle({ directory: staging, target: plain, root: library })
  check('an ordinary install is replaced', readVersionAt(plain) === '1.0.9' && readVersionAt(swapped.backup) === '1.0.8')
  // The swap reports the disk version; the running Host keeps its own. The
  // install route must therefore ask for a restart, never a page reload.
  check('the swap does not claim the new build is running', swapped.version === undefined)

  // A link has to be refused before anything is renamed.
  const restaged = join(library, 'update', 'v-1.0.9-y')
  mkdirSync(restaged, { recursive: true })
  writeFileSync(join(restaged, 'package.json'), JSON.stringify({ name: '@xxue-z/dsh-skin', version: '1.0.9' }))
  const link = join(directory, 'linked')
  symlinkSync(install, link, process.platform === 'win32' ? 'junction' : 'dir')
  let refusal = null
  try {
    await installStagedBundle({ directory: restaged, target: link, root: library })
  } catch (error) {
    refusal = error
  }
  check('a linked install is refused', refusal !== null && /符号链接/.test(refusal.message), String(refusal?.message))
  check('the refusal names the checkout to update', refusal !== null && refusal.message.includes(install), String(refusal?.message))
  check('the linked install is left on its version', readVersionAt(link) === '1.0.8')

  // The staging guard is checked before either branch touches the disk.
  let outside = null
  try {
    await installStagedBundle({ directory: install, target: plain, root: library })
  } catch (error) {
    outside = error
  }
  check('a bundle outside the skin library is refused', outside !== null && /暂存目录/.test(outside.message), String(outside?.message))
  rmSync(directory, { recursive: true, force: true })
}

console.log('bundled themes')
{
  const available = listBundled(join(here, '..'))
  check('the package ships default themes', available.length >= 2, available.map((theme) => theme.id).join(', '))
  check('one of them is dynamic', available.some((theme) => theme.document.video !== null))
  check('their documents are self-consistent', available.every((theme) => theme.document.id.startsWith('skin.') && theme.document.name.length > 0))

  const dir = mkdtempSync(join(tmpdir(), 'dsh-skin-bundled-'))
  const store = new SkinStore(join(dir, 'skin'))
  store.ensure()
  const first = seedBundledThemes(store, join(here, '..'))
  check('a first start imports them', first.alreadySeeded === false && first.seeded.length === available.length, JSON.stringify(first))
  check('they land in the library', available.every((theme) => store.get(theme.id) !== null))
  const dynamic = available.find((theme) => theme.document.video !== null)
  check('the dynamic one keeps its video file', dynamic ? store.videoPath(dynamic.id) !== null : false)

  // Deleting a bundled theme must stay deleted: the marker is what prevents a
  // silent re-import on the next start.
  const removable = available.find((theme) => store.readState().activeId !== theme.id)
  store.remove(removable.id)
  const second = seedBundledThemes(store, join(here, '..'))
  check('a deleted bundled theme is not restored', second.alreadySeeded === true && store.get(removable.id) === null)

  // A library that already had one under the same id keeps the user's copy.
  const fresh = new SkinStore(join(dir, 'other'))
  fresh.ensure()
  const kept = available[0]
  mkdirSync(fresh.themeDir(kept.id), { recursive: true })
  writeFileSync(join(fresh.themeDir(kept.id), 'theme.json'), JSON.stringify({ ...kept.document, name: '我的改名版本' }))
  const third = seedBundledThemes(fresh, join(here, '..'))
  check('an existing copy is kept', third.skipped.includes(kept.id) && fresh.get(kept.id)?.name === '我的改名版本')
  rmSync(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)