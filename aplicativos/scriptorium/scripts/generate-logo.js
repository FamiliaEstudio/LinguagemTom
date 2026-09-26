'use strict';

// Geometric source for the Scriptorium mark. No image editor or npm package is
// needed to regenerate the SVG, PNG and Windows icon.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const colors = {
  background: '#1b2844',
  cover: '#c4914d',
  left: '#f4ead4',
  right: '#fff6e4',
  line: '#8791a0',
  spine: '#d7a45e',
};
const shapes = [
  {kind: 'round', x: 8, y: 8, w: 240, h: 240, r: 48, fill: colors.background},
  {kind: 'polygon', points: [[31, 75], [78, 63], [128, 77], [178, 63], [225, 75], [225, 190], [178, 179], [128, 193], [78, 179], [31, 190]], fill: colors.cover},
  {kind: 'polygon', points: [[39, 80], [78, 70], [123, 83], [123, 179], [78, 166], [39, 176]], fill: colors.left},
  {kind: 'polygon', points: [[217, 80], [178, 70], [133, 83], [133, 179], [178, 166], [217, 176]], fill: colors.right},
  {kind: 'polygon', points: [[57, 103], [78, 98], [105, 105], [105, 110], [78, 103], [57, 108]], fill: colors.line},
  {kind: 'polygon', points: [[57, 125], [78, 120], [105, 127], [105, 132], [78, 125], [57, 130]], fill: colors.line},
  {kind: 'polygon', points: [[57, 147], [78, 142], [105, 149], [105, 154], [78, 147], [57, 152]], fill: colors.line},
  {kind: 'polygon', points: [[199, 103], [178, 98], [151, 105], [151, 110], [178, 103], [199, 108]], fill: colors.line},
  {kind: 'polygon', points: [[199, 125], [178, 120], [151, 127], [151, 132], [178, 125], [199, 130]], fill: colors.line},
  {kind: 'polygon', points: [[199, 147], [178, 142], [151, 149], [151, 154], [178, 147], [199, 152]], fill: colors.line},
  {kind: 'round', x: 124, y: 79, w: 8, h: 108, r: 4, fill: colors.spine},
];

function svg() {
  const elements = shapes.map(shape => shape.kind === 'round'
    ? `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.r}" fill="${shape.fill}"/>`
    : `<polygon points="${shape.points.map(point => point.join(',')).join(' ')}" fill="${shape.fill}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Livro aberto do Scriptorium">\n${elements.join('\n')}\n</svg>\n`;
}
function contains(shape, x, y) {
  if (shape.kind === 'polygon') {
    let inside = false;
    for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
      const a = shape.points[i], b = shape.points[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  const dx = Math.max(shape.x + shape.r - x, 0, x - (shape.x + shape.w - shape.r));
  const dy = Math.max(shape.y + shape.r - y, 0, y - (shape.y + shape.h - shape.r));
  return x >= shape.x && x < shape.x + shape.w && y >= shape.y && y < shape.y + shape.h && dx * dx + dy * dy <= shape.r * shape.r;
}
function rgba(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0); name.copy(output, 4); data.copy(output, 8);
  output.writeUInt32BE(crc32(output.subarray(4, 8 + data.length)), 8 + data.length);
  return output;
}
function png(size) {
  const bytes = Buffer.alloc(size * (1 + size * 4));
  const samples = size <= 48 ? 4 : 2;
  const palette = shapes.map(shape => rgba(shape.fill));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const px = (x + (sx + 0.5) / samples) * 256 / size;
        const py = (y + (sy + 0.5) / samples) * 256 / size;
        let selected = -1;
        for (let i = 0; i < shapes.length; i++) if (contains(shapes[i], px, py)) selected = i;
        if (selected >= 0) { for (let i = 0; i < 3; i++) sums[i] += palette[selected][i]; sums[3] += 255; }
      }
      const offset = y * (1 + size * 4) + 1 + x * 4;
      const n = samples * samples;
      for (let i = 0; i < 3; i++) bytes[offset + i] = sums[3] ? Math.round(sums[i] * 255 / sums[3]) : 0;
      bytes[offset + 3] = Math.round(sums[3] / n);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(bytes, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (let i = 0; i < images.length; i++) {
    const [size, data] = images[i], entry = 6 + i * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  }
  return Buffer.concat([header, ...images.map(([, data]) => data)]);
}
function main() {
  const destination = path.resolve(__dirname, '../assets');
  fs.mkdirSync(destination, {recursive: true});
  const sizes = [16, 32, 48, 256].map(size => [size, png(size)]);
  fs.writeFileSync(path.join(destination, 'scriptorium.svg'), svg());
  fs.writeFileSync(path.join(destination, 'scriptorium.png'), sizes.at(-1)[1]);
  fs.writeFileSync(path.join(destination, 'scriptorium.ico'), ico(sizes));
}
if (require.main === module) main();
module.exports = {main};
