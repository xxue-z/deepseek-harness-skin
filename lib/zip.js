/**
 * Minimal ZIP reader used by theme-pack import.
 *
 * Theme packs are small archives with stored or deflated entries, so the
 * central-directory walk below is enough; ZIP64 is rejected rather than
 * mis-parsed. Nothing here writes outside memory.
 */
import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const MAX_ENTRIES = 2048
const MAX_ENTRY_BYTES = 48 * 1024 * 1024
const MAX_TOTAL_BYTES = 192 * 1024 * 1024

function findEndOfCentralDirectory(buffer) {
  const start = Math.max(0, buffer.length - 66_000)
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  return -1
}

/**
 * Read every file of a ZIP archive into memory.
 *
 * @param {Buffer} buffer archive bytes
 * @returns {Map<string, Buffer>} entry name → contents
 */
export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('不是有效的 ZIP 文件')
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（缺少中央目录）')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const directoryOffset = buffer.readUInt32LE(eocd + 16)
  if (entryCount > MAX_ENTRIES) throw new Error(`ZIP 条目过多（${entryCount}）`)
  if (directoryOffset === 0xffffffff) throw new Error('不支持 ZIP64 主题包')

  const files = new Map()
  let total = 0
  let cursor = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) throw new Error('ZIP 中央目录被截断')
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw new Error('ZIP 中央目录损坏')
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const rawName = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    cursor = nameStart + nameLength + extraLength + commentLength

    if (rawName.endsWith('/')) continue
    const name = normalizeEntryName(rawName)
    if (name === null) continue
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('不支持 ZIP64 主题包')
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error(`ZIP 内文件过大：${name}`)

    if (localOffset + 30 > buffer.length) throw new Error('ZIP 局部头被截断')
    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error('ZIP 局部头损坏')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > buffer.length) throw new Error('ZIP 数据被截断')
    const data = buffer.subarray(dataStart, dataEnd)

    let contents
    if (method === 0) contents = Buffer.from(data)
    else if (method === 8) contents = inflateRawSync(data)
    else throw new Error(`不支持的压缩方式 ${method}：${name}`)
    if (contents.length > MAX_ENTRY_BYTES) throw new Error(`ZIP 内文件过大：${name}`)
    total += contents.length
    if (total > MAX_TOTAL_BYTES) throw new Error('ZIP 解压后体积过大')
    files.set(name, contents)
  }
  return files
}

function normalizeEntryName(rawName) {
  const name = rawName.replace(/\\/g, '/').replace(/^\.\//, '')
  if (name === '' || name.endsWith('/')) return null
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return null
  if (name.split('/').includes('..')) return null
  if (name.startsWith('__MACOSX/') || name.split('/').pop() === '.DS_Store') return null
  return name
}