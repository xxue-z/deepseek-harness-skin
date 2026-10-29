#!/usr/bin/env node
/**
 * Print the files a release archive should contain.
 *
 * The install bundle is not a copy of the repository: `package.json` `files` is
 * the only source, and this script resolves it the way npm does — a directory
 * entry ships its subtree, a glob may cross `/` (`locale/*.json`,
 * `bundled-themes/*​/*`). The release workflow pipes the output into tar.
 *
 *   node tools/pack-list.mjs            # one path per line
 *   node tools/pack-list.mjs --check    # exit 1 when a listed entry is missing
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** Turn one `files` entry into a regex over POSIX-style relative paths. */
function toRegex(entry) {
  const pattern = entry
    .split('**')
    .map((part) => part.split('*').map((chunk) => chunk.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*')
  return new RegExp(`^${pattern}$`)
}

function walk(directory, out) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
}

const files = []
/** Collect repository-relative POSIX paths, never with a leading `./`. */
function collect(directory) {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = directory === '' ? entry.name : `${directory}/${entry.name}`
    if (entry.isDirectory()) collect(path)
    else files.push(path)
  }
}
collect('')

const selected = new Set(['package.json'])
for (const entry of manifest.files ?? []) {
  const clean = entry.replace(/^\.\//, '').replace(/\/+$/, '')
  if (!clean.includes('*')) {
    if (!existsSync(join(root, clean))) continue
    if (statSync(join(root, clean)).isDirectory()) {
      for (const file of files) if (file === clean || file.startsWith(`${clean}/`)) selected.add(file)
    } else selected.add(clean)
    continue
  }
  const regex = toRegex(clean)
  for (const file of files) if (regex.test(file)) selected.add(file)
}

const list = [...selected].sort()
const missing = []
for (const path of manifest.files ?? []) {
  if (path.includes('*')) continue
  if (!existsSync(join(root, path))) missing.push(path)
}

if (process.argv.includes('--check')) {
  if (missing.length > 0) {
    console.error('package.json files 里列了不存在的路径：', missing.join(', '))
    process.exit(1)
  }
  const themes = list.filter((file) => file.startsWith('bundled-themes/') && file.endsWith('theme.json'))
  if (themes.length === 0) {
    console.error('打包清单里没有自带主题（bundled-themes/*/theme.json）')
    process.exit(1)
  }
  console.error(`打包清单：${list.length} 个文件，其中自带主题 ${themes.length} 个`)
}

process.stdout.write(`${list.join('\n')}\n`)