#!/usr/bin/env node
/**
 * Synthetic MP4 writer for the Host self test.
 *
 * The tests must not ship a real video, so this builds the smallest box tree
 * that exercises the parser: `ftyp`, `moov` (`mvhd` + one `trak`), and an
 * `mdat`. Only the fields the reader looks at carry meaningful values.
 */

function box(type, ...payloads) {
  const body = Buffer.concat(payloads)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + body.length, 0)
  header.write(type, 4, 'ascii')
  return Buffer.concat([header, body])
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

function zeros(length) {
  return Buffer.alloc(length)
}

/** `ftyp` announcing an ISO-BMFF file. */
function ftyp(brand = 'isom') {
  return box('ftyp', Buffer.from(brand, 'ascii'), u32(512), Buffer.from('isommp42', 'ascii'))
}

function mvhd(timescale, duration) {
  return box('mvhd', u32(0), u32(0), u32(0), u32(timescale), u32(duration), zeros(80))
}

function tkhd(width, height) {
  const body = Buffer.alloc(84)
  body.writeUInt32BE(0, 0) // version 0 + flags
  body.writeUInt32BE(1, 12) // track id
  body.writeUInt32BE(4000, 20) // duration
  body.writeUInt32BE(width * 0x10000, 76)
  body.writeUInt32BE(height * 0x10000, 80)
  return box('tkhd', body)
}

function hdlr(handler) {
  return box('hdlr', u32(0), u32(0), Buffer.from(handler, 'ascii'), zeros(13))
}

function stsd(codec) {
  const entry = Buffer.alloc(8)
  entry.writeUInt32BE(8, 0)
  entry.write(codec, 4, 'ascii')
  return box('stsd', u32(0), u32(1), entry)
}

function videoTrak({ width, height, codec }) {
  const mdia = box('mdia', hdlr('vide'), box('minf', box('stbl', stsd(codec))))
  return box('trak', tkhd(width, height), mdia)
}

function audioTrak() {
  const mdia = box('mdia', hdlr('soun'), box('minf', box('stbl', stsd('mp4a'))))
  return box('trak', tkhd(0, 0), mdia)
}

/**
 * @param {{ width?: number, height?: number, durationMs?: number, codec?: string, brand?: string, fragmented?: boolean, audio?: boolean, moov?: boolean }} [options]
 * @returns {Buffer}
 */
export function makeMp4(options = {}) {
  const { width = 1280, height = 720, durationMs = 4000, codec = 'avc1', brand = 'isom', fragmented = false, audio = false, moov = true } = options
  const timescale = 1000
  const parts = [ftyp(brand)]
  if (moov) {
    const moovBox = box('moov', mvhd(timescale, durationMs), videoTrak({ width, height, codec }), ...(audio ? [audioTrak()] : []))
    parts.push(moovBox)
  }
  if (fragmented) parts.push(box('moof', u32(0)))
  parts.push(box('mdat', Buffer.alloc(2048)))
  return Buffer.concat(parts)
}