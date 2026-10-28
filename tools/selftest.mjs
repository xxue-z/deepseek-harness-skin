#!/usr/bin/env node
/**
 * Host-half self test: palette math, Codex conversion, ZIP import, store
 * round-trip, and the HTTP API — all against a throwaway data directory.
 *
 *   node tools/selftest.mjs [codexThemesDir]
 */
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { convertCodexTheme, findThemeRoot } from '../lib/convert.js'
import { SkinStore } from '../lib/store.js'
import { SkinService } from '../lib/service.js'
import { createSkinHandler } from '../lib/api.js'
import { contrastRatio, derivePalette, paletteFromText, parseColor } from '../lib/palette.js'
import { readZip } from '../lib/zip.js'
import { zipSync } from './zip-fixture.mjs'

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
    const design = await service.design({ description: '赛博霓虹，暗紫色底色' })
    check('offline design produces a skin', design.skin.id.startsWith('skin.') && design.usedModel === false)
    check('offline design is stored', store.get(design.skin.id) !== null)
    server.close()
  } else {
    console.log('  (skipped: no Codex theme available)')
  }
  rmSync(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)