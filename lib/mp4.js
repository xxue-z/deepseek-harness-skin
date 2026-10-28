/**
 * Bounded MP4 structure reader for wallpaper videos.
 *
 * The desktop app plays videos through Chromium, so this module never decodes
 * anything: it only walks the ISO-BMFF box tree far enough to answer four
 * questions that decide whether a file is a usable background:
 *
 *   - is it a plain (non-fragmented) MP4 the renderer can open?
 *   - does it carry exactly one video track?
 *   - is that track H.264 (`avc1`), the one codec Electron always ships?
 *   - how big and how long is it?
 *
 * Every read is bounds-checked against the buffer, boxes are never allocated by
 * a declared length, and the walk stops after a fixed number of boxes. A file
 * that fails any check throws with a short, user-facing Chinese message; the
 * importer turns that into a warning and keeps the static poster.
 */

const MAX_VIDEO_BYTES = 16 * 1024 * 1024
const MAX_MOOV_BYTES = 2 * 1024 * 1024
const MAX_BOXES = 4096
const MAX_WIDTH = 2560
const MAX_HEIGHT = 1600
const MAX_PIXELS = 3_686_400
const MIN_DURATION_MS = 200
const MAX_DURATION_MS = 300_000

const BRANDS = new Set(['isom', 'mp42', 'mp41', 'iso2', 'iso4', 'iso5', 'M4V ', 'avc1'])

function fail(message) {
  const error = new Error(message)
  error.code = 'video.parse'
  return error
}

function typeAt(view, offset) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
}

/** Read the box headers that start exactly at `start` and end by `end`. */
function readBoxes(view, start, end, _depth, counter) {
  const boxes = []
  let offset = start
  while (offset + 8 <= end) {
    if (counter.count++ > MAX_BOXES) throw fail('视频结构过于复杂')
    let size = view.getUint32(offset)
    const type = typeAt(view, offset + 4)
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) throw fail('视频结构被截断')
      const high = view.getUint32(offset + 8)
      const low = view.getUint32(offset + 12)
      // 64-bit sizes beyond 2^53 cannot be addressed by a Buffer anyway.
      if (high > 0x1fffff) throw fail('视频结构长度异常')
      size = high * 0x100000000 + low
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header || offset + size > end) throw fail('视频结构被截断')
    boxes.push({ type, start: offset + header, end: offset + size })
    offset += size
  }
  return boxes
}

function find(boxes, type) {
  return boxes.find((box) => box.type === type) ?? null
}

function findAll(boxes, type) {
  return boxes.filter((box) => box.type === type)
}

function readMvhd(view, box) {
  const start = box.start
  if (box.end - start < 20) throw fail('视频头信息不完整')
  const version = view.getUint8(start)
  const timescale = version === 1 ? view.getUint32(start + 20) : view.getUint32(start + 12)
  const duration = version === 1 ? view.getUint32(start + 24) * 0x100000000 + view.getUint32(start + 28) : view.getUint32(start + 16)
  if (timescale === 0) throw fail('视频时长信息缺失')
  return { timescale, duration, durationMs: Math.round((duration / timescale) * 1000) }
}

function readTkhd(view, box) {
  const start = box.start
  if (box.end - start < 84) throw fail('视频轨道头信息不完整')
  const version = view.getUint8(start)
  const widthOffset = version === 1 ? start + 88 : start + 76
  const heightOffset = version === 1 ? start + 92 : start + 80
  if (heightOffset + 4 > box.end) throw fail('视频轨道头信息不完整')
  // tkhd widths are 16.16 fixed point.
  return {
    width: Math.round(view.getUint32(widthOffset) / 0x10000),
    height: Math.round(view.getUint32(heightOffset) / 0x10000),
  }
}

function readHandler(view, box) {
  const start = box.start
  if (box.end - start < 12) return null
  return typeAt(view, start + 8)
}

function readSampleEntry(view, stsd) {
  const start = stsd.start
  if (stsd.end - start < 16) return null
  // version/flags (4) + entry_count (4), then the first entry.
  const entry = start + 8
  if (entry + 8 > stsd.end) return null
  return { codec: typeAt(view, entry + 4) }
}

/**
 * Read the track-level facts of one `trak`.
 * @returns {{ handler: string | null, width: number, height: number, codec: string | null }}
 */
function readTrak(view, trak) {
  const children = readBoxes(view, trak.start, trak.end, 1, { count: 0 })
  const tkhd = find(children, 'tkhd')
  const size = tkhd ? readTkhd(view, tkhd) : { width: 0, height: 0 }
  const mdia = find(children, 'mdia')
  if (mdia === null) return { handler: null, codec: null, ...size }
  const mdiaChildren = readBoxes(view, mdia.start, mdia.end, 2, { count: 0 })
  const hdlr = find(mdiaChildren, 'hdlr')
  const minf = find(mdiaChildren, 'minf')
  let codec = null
  if (minf !== null) {
    const minfChildren = readBoxes(view, minf.start, minf.end, 3, { count: 0 })
    const stbl = find(minfChildren, 'stbl')
    if (stbl !== null) {
      const stblChildren = readBoxes(view, stbl.start, stbl.end, 4, { count: 0 })
      const stsd = find(stblChildren, 'stsd')
      if (stsd !== null) codec = readSampleEntry(view, stsd)?.codec ?? null
    }
  }
  return { handler: hdlr ? readHandler(view, hdlr) : null, codec, ...size }
}

/**
 * Parse an MP4 enough to decide whether it can back a wallpaper.
 *
 * @param {Buffer | Uint8Array} bytes
 * @returns {{ width: number, height: number, durationMs: number, codec: string, brand: string, tracks: number, audioTracks: number }}
 */
export function parseMp4(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (data.byteLength === 0) throw fail('视频文件为空')
  if (data.byteLength > MAX_VIDEO_BYTES) throw fail(`视频超过 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB`)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const top = readBoxes(view, 0, data.byteLength, 0, { count: 0 })
  const ftyp = top[0]
  if (ftyp === undefined || ftyp.type !== 'ftyp') throw fail('不是 MP4 文件')
  const brand = typeAt(view, ftyp.start)
  if (!BRANDS.has(brand)) throw fail(`不支持的 MP4 品牌：${brand.trim()}`)
  if (find(top, 'moof') !== null || find(top, 'mfra') !== null) throw fail('不支持分片 MP4')
  const moov = find(top, 'moov')
  if (moov === null) throw fail('MP4 缺少 moov（视频未编码完成）')
  if (moov.end - moov.start > MAX_MOOV_BYTES) throw fail('MP4 头信息异常')
  if (find(top, 'mdat') === null) throw fail('MP4 缺少视频数据')

  const moovChildren = readBoxes(view, moov.start, moov.end, 1, { count: 0 })
  const mvhd = find(moovChildren, 'mvhd')
  if (mvhd === null) throw fail('MP4 缺少时长信息')
  const timing = readMvhd(view, mvhd)
  if (!Number.isFinite(timing.durationMs) || timing.durationMs < MIN_DURATION_MS) throw fail('视频时长太短')
  if (timing.durationMs > MAX_DURATION_MS) throw fail('视频时长超过 5 分钟')

  const traks = findAll(moovChildren, 'trak')
  const video = []
  let audioTracks = 0
  for (const trak of traks) {
    const info = readTrak(view, trak)
    if (info.handler === 'vide') video.push(info)
    else if (info.handler === 'soun') audioTracks += 1
  }
  if (video.length === 0) throw fail('MP4 中没有视频轨道')
  if (video.length > 1) throw fail('MP4 中有多条视频轨道')
  if (audioTracks > 1) throw fail('MP4 中有多条音轨')

  const track = video[0]
  if (track.codec === null) throw fail('MP4 视频轨道缺少编码信息')
  if (track.codec !== 'avc1') throw fail(`视频编码是 ${track.codec}，壁纸只支持 H.264（avc1）`)
  const width = track.width
  const height = track.height
  if (width <= 0 || height <= 0) throw fail('视频尺寸无效')
  if (width > MAX_WIDTH || height > MAX_HEIGHT || width * height > MAX_PIXELS) throw fail(`视频分辨率超过 ${MAX_WIDTH}×${MAX_HEIGHT}`)
  return {
    width,
    height,
    durationMs: timing.durationMs,
    codec: track.codec,
    brand: brand.trim(),
    tracks: traks.length,
    audioTracks,
  }
}

/** Hard limit the importer and the asset endpoint share. */
export { MAX_VIDEO_BYTES }