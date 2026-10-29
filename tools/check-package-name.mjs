#!/usr/bin/env node
/**
 * One invariant, checked in CI: the plugin is named the same everywhere.
 *
 * The package name doubles as the module name the loader resolves through
 * `node_modules`, so `package.json.name`, the bundle patch row, the Host's
 * exported `name`, and the client's registered module id must agree. A
 * half-renamed tree installs and then loads nothing (1.0.5 shipped exactly
 * that), which is why this runs before every release.
 *
 *   node tools/check-package-name.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(join(root, file), 'utf8')

const manifest = JSON.parse(read('package.json'))
const expected = manifest.name
const problems = []

if (typeof expected !== 'string' || expected.trim() === '') problems.push('package.json 没有 name')

const patchName = /^\s*name:\s*'([^']+)'\s*$/m.exec(read('cordis.patch.yml'))?.[1] ?? null
if (patchName !== expected) problems.push(`cordis.patch.yml 的 name 是 ${patchName ?? '（缺失）'}，应为 ${expected}`)

const hostName = /export const name = '([^']+)'/.exec(read('index.js'))?.[1] ?? null
if (hostName !== expected) problems.push(`index.js 的 export const name 是 ${hostName ?? '（缺失）'}，应为 ${expected}`)

const clientId = /^ {2}id: '([^']+)',$/m.exec(read('client.js'))?.[1] ?? null
if (clientId !== expected) problems.push(`client.js 注册的模块 id 是 ${clientId ?? '（缺失）'}，应为 ${expected}`)

const pluginId = /const PLUGIN_ID = '([^']+)'/.exec(read('client.js'))?.[1] ?? null
if (pluginId !== expected) problems.push(`client.js 的 PLUGIN_ID 是 ${pluginId ?? '（缺失）'}，应为 ${expected}`)

const pkgName = manifest.pkg?.name ?? null
if (pkgName !== null && pkgName !== expected) problems.push(`package.json 的 pkg.name 是 ${pkgName}，应为 ${expected}`)

if (problems.length > 0) {
  console.error('包名不一致：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`包名一致：${expected}`)