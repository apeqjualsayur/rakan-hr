// Generates placeholder PWA icons (brand-green tile with a white "r").
// Replace with designed artwork before go-live (build step 18).
// Run: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PRIMARY = [0x1e, 0x6b, 0x52];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Shapes in unit coordinates (0..1).
function inRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inGlyph(x, y) {
  const stem = x >= 0.34 && x <= 0.46 && y >= 0.3 && y <= 0.74;
  const [cx, cy, outer, inner] = [0.62, 0.54, 0.24, 0.12];
  const d = Math.hypot(x - cx, y - cy);
  const shoulder =
    y <= cy - 0.06 && x >= 0.4 && x <= 0.7 && d <= outer && d >= inner;
  return stem || shoulder;
}

function render(size, { maskable }) {
  const samples = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tile = 0;
      let glyph = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (!maskable && !inRoundedSquare(x, y, 0.22)) continue;
          tile++;
          // Maskable icons keep the glyph inside the central safe zone.
          const scale = maskable ? 0.75 : 1;
          const gx = (x - 0.5) / scale + 0.5;
          const gy = (y - 0.5) / scale + 0.5;
          if (inGlyph(gx, gy)) glyph++;
        }
      }
      const total = samples * samples;
      const i = (py * size + px) * 4;
      const g = tile ? glyph / tile : 0;
      for (let c = 0; c < 3; c++) {
        rgba[i + c] = Math.round(PRIMARY[c] * (1 - g) + WHITE[c] * g);
      }
      rgba[i + 3] = Math.round((tile / total) * 255);
    }
  }
  return png(size, rgba);
}

mkdirSync("public/icons", { recursive: true });
const outputs = [
  ["public/icons/icon-192.png", 192, { maskable: false }],
  ["public/icons/icon-512.png", 512, { maskable: false }],
  ["public/icons/maskable-512.png", 512, { maskable: true }],
  ["src/app/apple-icon.png", 180, { maskable: true }],
  ["src/app/icon.png", 64, { maskable: false }],
];
for (const [path, size, opts] of outputs) {
  writeFileSync(path, render(size, opts));
  console.log("wrote", path);
}
