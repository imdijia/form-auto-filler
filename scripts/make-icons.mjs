/**
 * Generates local PNG action icons (no network, no image library, no emoji).
 * WXT discovers public/icon/<size>.png and adds them to the manifest.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = join(ROOT, 'public', 'icon');
mkdirSync(OUT, { recursive: true });

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = pixels[y][x];
      row[1 + x * 4] = color[0];
      row[2 + x * 4] = color[1];
      row[3 + x * 4] = color[2];
      row[4 + x * 4] = color[3];
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [29, 78, 137, 255];
const INK = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

function draw(size) {
  const radius = Math.max(2, Math.round(size * 0.18));
  const canvas = Array.from({ length: size }, () => Array.from({ length: size }, () => CLEAR));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inCorner =
        (x < radius && y < radius && (x - radius) ** 2 + (y - radius) ** 2 > radius ** 2) ||
        (x >= size - radius && y < radius && (x - (size - radius - 1)) ** 2 + (y - radius) ** 2 > radius ** 2) ||
        (x < radius && y >= size - radius && (x - radius) ** 2 + (y - (size - radius - 1)) ** 2 > radius ** 2) ||
        (x >= size - radius && y >= size - radius &&
          (x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2 > radius ** 2);
      canvas[y][x] = inCorner ? CLEAR : BG;
    }
  }
  // A geometric "F": vertical stem + two cross bars. No font, no emoji.
  const left = Math.round(size * 0.32);
  const bar = Math.max(1, Math.round(size * 0.12));
  const top = Math.round(size * 0.22);
  const bottom = Math.round(size * 0.78);
  const stem = (x, y) => x >= left && x < left + bar && y >= top && y < bottom;
  const upper = (x, y) => y >= top && y < top + bar && x >= left && x < Math.round(size * 0.72);
  const middle = (x, y) =>
    y >= Math.round(size * 0.46) && y < Math.round(size * 0.46) + bar &&
    x >= left && x < Math.round(size * 0.62);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (stem(x, y) || upper(x, y) || middle(x, y)) canvas[y][x] = INK;
    }
  }
  return canvas;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(OUT, size + '.png'), png(size, draw(size)));
}
console.log('ICONS: wrote 16/32/48/128 png into public/icon');
