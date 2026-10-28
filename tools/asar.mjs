#!/usr/bin/env node
// Minimal read-only inspector for an Electron .asar archive.
// Usage:
//   node tools/asar.mjs list <asar> [regex]
//   node tools/asar.mjs read <asar> <innerPath>
//   node tools/asar.mjs extract <asar> <innerPath> <outFile>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function readHeader(file) {
  const fd = readFileSync(file);
  const headerSizeBuf = fd.subarray(8, 12);
  const headerSize = headerSizeBuf.readUInt32LE(0);
  const headerStringSize = fd.readUInt32LE(12);
  const headerJson = fd.subarray(16, 16 + headerStringSize).toString('utf8');
  // Electron pads the pickle header to a 4-byte boundary, so the data area
  // begins 4 bytes after the recorded header size.
  const baseOffset = 12 + headerSize;
  return { fd, header: JSON.parse(headerJson), baseOffset };
}

function walk(node, prefix, out) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) {
      walk(child, prefix ? `${prefix}/${name}` : name, out);
    }
    return;
  }
  out.push({ path: prefix, size: node.size, offset: node.offset, unpacked: !!node.unpacked });
}

const [cmd, asar, a, b] = process.argv.slice(2);
const { fd, header, baseOffset } = readHeader(asar);
const entries = [];
walk(header, '', entries);

if (cmd === 'list') {
  const re = a ? new RegExp(a) : null;
  for (const entry of entries) {
    if (re && !re.test(entry.path)) continue;
    console.log(`${String(entry.size).padStart(9)}  ${entry.path}`);
  }
} else if (cmd === 'read' || cmd === 'extract') {
  const entry = entries.find((e) => e.path === a);
  if (!entry) {
    console.error(`not found: ${a}`);
    process.exit(1);
  }
  const bytes = fd.subarray(baseOffset + Number(entry.offset), baseOffset + Number(entry.offset) + entry.size);
  if (cmd === 'read') process.stdout.write(bytes);
  else {
    mkdirSync(dirname(b), { recursive: true });
    writeFileSync(b, bytes);
    console.error(`wrote ${b} (${entry.size} bytes)`);
  }
} else {
  console.error('usage: list|read|extract');
  process.exit(2);
}