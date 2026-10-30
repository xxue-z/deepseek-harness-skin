#!/usr/bin/env node
/**
 * Tiny tar + gzip writer used only by the self test (no runtime dependency).
 *
 * The release asset is a `.tar.gz`, which is the exact shape the Host has to
 * unpack, so a real archive is built here rather than reaching for the `tar`
 * binary (absent on some Windows machines).
 *
 * Entries are ustar with a 100-byte name field; longer paths are written with
 * a 155-byte prefix, which is what `--format=gnu` produces for a normal tree.
 * No symlinks, devices or PAX headers.
 */
import { gzipSync } from 'node:zlib'

const BLOCK = 512

function splitPath(path) {
  if (Buffer.byteLength(path, 'utf8') <= 100) return { name: path, prefix: '' }
  // Split at a separator so the tail fits the name field and the head the
  // prefix field (the way ustar is meant to be used).
  const parts = path.split('/')
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const name = parts.slice(index).join('/')
    const prefix = parts.slice(0, index).join('/')
    if (Buffer.byteLength(name, 'utf8') <= 100 && Buffer.byteLength(prefix, 'utf8') <= 155) return { name, prefix }
  }
  throw new Error(`path too long for a ustar entry: ${path}`)
}

function octal(value, length) {
  // width includes the trailing NUL that every ustar number field carries
  const text = value.toString(8)
  return `${'0'.repeat(Math.max(0, length - 1 - text.length))}${text}\0`
}

function header({ path, size, typeflag }) {
  const block = Buffer.alloc(BLOCK)
  const { name, prefix } = splitPath(path)
  block.write(name, 0, 100, 'utf8')
  block.write(octal(typeflag === '5' ? 0o755 : 0o644, 8), 100, 8, 'ascii')
  block.write(octal(0, 8), 108, 8, 'ascii')
  block.write(octal(typeflag === '5' ? 0 : 0, 8), 116, 8, 'ascii')
  block.write(octal(size, 12), 124, 12, 'ascii')
  block.write(octal(1750000000, 12), 136, 12, 'ascii')
  block.write('        ', 148, 8, 'ascii')
  block.write(typeflag, 156, 1, 'ascii')
  block.write('ustar\0', 257, 6, 'ascii')
  block.write('00', 263, 2, 'ascii')
  block.write(prefix, 345, 155, 'utf8')
  let sum = 0
  for (const byte of block) sum += byte
  block.write(`${'0'.repeat(6)}${sum.toString(8)}\0 `, 148, 8, 'ascii')
  return block
}

/**
 * Build a gzip'd tar archive.
 * @param {{ path: string, data?: Buffer | string, dir?: boolean }[]} entries
 * @returns {Buffer}
 */
export function makeTarball(entries) {
  const parts = []
  for (const entry of entries) {
    const isDir = entry.dir === true || entry.path.endsWith('/')
    const data = isDir ? Buffer.alloc(0) : Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '', 'utf8')
    parts.push(header({ path: entry.path, size: data.length, typeflag: isDir ? '5' : '0' }))
    if (!isDir) {
      parts.push(data)
      const padding = (BLOCK - (data.length % BLOCK)) % BLOCK
      if (padding > 0) parts.push(Buffer.alloc(padding))
    }
  }
  // Two zero blocks terminate the archive.
  parts.push(Buffer.alloc(BLOCK * 2))
  return gzipSync(Buffer.concat(parts))
}