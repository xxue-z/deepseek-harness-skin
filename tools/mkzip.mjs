import { writeFileSync, readFileSync } from 'node:fs'
import { zipSync } from './zip-fixture.mjs'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAKUlEQVR42mNkYPhfz0AEYBxVSF+FjAxkKmRkYGBg+E+UQoYBUkgfhQAAtDMH+Q0l0xQAAAAASUVORK5CYII=', 'base64')
const theme = {
  schemaVersion: 1,
  id: 'studio.zip-probe',
  name: 'ZIP Probe',
  tagline: '打包导入自检',
  appearance: 'light',
  art: { focusX: 0.4, focusY: 0.3 },
  colors: { background: '#f6f7f9', panel: '#ffffff', panelAlt: '#eef1f5', accent: '#2f6fed', accentAlt: '#f0a63b', secondary: '#33b48b', highlight: '#8c6ff0', text: '#1d2126', muted: '#6b7480', line: 'rgba(47, 111, 237, .24)' },
}
const archive = zipSync({
  'probe/theme.json': JSON.stringify(theme, null, 2),
  'probe/theme.css': '[data-ds-part="composer"]{background-color:rgba(255,255,255,.8);border-radius:18px}',
  'probe/background.png': png,
})
writeFileSync('.scratch/zip-probe.zip', archive)
console.log('zip bytes', archive.length)

