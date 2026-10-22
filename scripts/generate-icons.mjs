// Generates valid PNG icons for the PWA manifest using only Node built-ins.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderIcon(size, maskable = false) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const margin = maskable ? 0 : Math.round(size * 0.06);
  const radius = maskable ? 0 : Math.round(size * 0.2);

  function insideRoundedRect(x, y) {
    if (x < margin || y < margin || x >= size - margin || y >= size - margin) return false;
    const rx = x - margin;
    const ry = y - margin;
    const w = size - margin * 2;
    const h = size - margin * 2;
    const cx = rx < radius ? radius : rx >= w - radius ? w - radius - 1 : rx;
    const cy = ry < radius ? radius : ry >= h - radius ? h - radius - 1 : ry;
    return (rx - cx) * (rx - cx) + (ry - cy) * (ry - cy) <= radius * radius;
  }

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const p = rowStart + 1 + x * 4;
      if (!insideRoundedRect(x, y)) {
        raw[p] = 0;
        raw[p + 1] = 0;
        raw[p + 2] = 0;
        raw[p + 3] = 0;
        continue;
      }
      // Dark warm stone background (#1c1917)
      let r = 28, g = 25, b = 23;

      // Staff lines across middle
      const ny = y / size;
      const nx = x / size;
      if (nx >= 0.16 && nx <= 0.84) {
        for (const lineY of [0.32, 0.41, 0.50, 0.59, 0.68]) {
          if (Math.abs(ny - lineY) < 0.009) {
            r = 120; g = 113; b = 108;
          }
        }
      }

      // Amber beamed eighth notes (#f59e0b)
      const dx1 = (nx - 0.36) / 0.085;
      const dy1 = (ny - 0.69) / 0.065;
      const dx2 = (nx - 0.64) / 0.085;
      const dy2 = (ny - 0.63) / 0.065;
      const inHead1 = dx1 * dx1 + dy1 * dy1 <= 1;
      const inHead2 = dx2 * dx2 + dy2 * dy2 <= 1;
      const inStem1 = Math.abs(nx - 0.425) < 0.022 && ny >= 0.30 && ny <= 0.69;
      const inStem2 = Math.abs(nx - 0.705) < 0.022 && ny >= 0.24 && ny <= 0.63;
      const beamY = 0.30 - ((nx - 0.425) / (0.705 - 0.425)) * 0.06;
      const inBeam = nx >= 0.41 && nx <= 0.725 && Math.abs(ny - beamY) < 0.032;

      if (inHead1 || inHead2 || inStem1 || inStem2 || inBeam) {
        r = 245; g = 158; b = 11;
      }

      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(resolve(outDir, 'icon-192.png'), renderIcon(192, false));
writeFileSync(resolve(outDir, 'icon-512.png'), renderIcon(512, false));
writeFileSync(resolve(outDir, 'icon-512-maskable.png'), renderIcon(512, true));
console.log('[generate-icons] Generated PWA icons in public/icons');
