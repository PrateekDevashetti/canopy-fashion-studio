// Contact sheet of generated assets for visual review: node scripts/sheet.mjs <dir> <out.jpg> [cell]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [dir, out, cellArg] = process.argv.slice(2);
const cell = Number(cellArg ?? 160);
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/.test(f)).sort();
const cols = Math.min(6, files.length);
const rows = Math.ceil(files.length / cols);
const tiles = await Promise.all(
  files.map(async (f, i) => ({
    input: await sharp(path.join(dir, f)).resize(cell, cell, { fit: "contain", background: { r: 20, g: 20, b: 20, alpha: 1 } }).png().toBuffer(),
    left: (i % cols) * (cell + 6),
    top: Math.floor(i / cols) * (cell + 6),
  })),
);
await sharp({ create: { width: cols * (cell + 6), height: rows * (cell + 6), channels: 3, background: "#141414" } }).composite(tiles).jpeg({ quality: 80 }).toFile(out);
console.log(files.join(" "));
