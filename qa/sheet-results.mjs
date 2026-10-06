// Contact sheet of engine-test outputs (first output per tool, labeled): node qa/sheet-results.mjs
import fs from "node:fs";
import sharp from "sharp";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const { results } = JSON.parse(fs.readFileSync("qa/out/engine.json", "utf8"));
const cell = 260;
const ok = results.filter((r) => r[1] === "succeeded" && r[5]);
const tiles = [];
for (const [i, r] of ok.entries()) {
  const url = r[5].split(" ")[0];
  const buf = Buffer.from(await (await fetch(BASE + url)).arrayBuffer());
  const img = await sharp(buf).resize(cell, cell - 24, { fit: "contain", background: "#222" }).png().toBuffer();
  const label = Buffer.from(`<svg width="${cell}" height="24"><rect width="100%" height="100%" fill="#111"/><text x="6" y="17" font-family="Helvetica" font-size="14" fill="#ddd">${r[0]}</text></svg>`);
  tiles.push({ input: img, left: (i % 5) * (cell + 4), top: Math.floor(i / 5) * (cell + 4) + 24 });
  tiles.push({ input: label, left: (i % 5) * (cell + 4), top: Math.floor(i / 5) * (cell + 4) });
}
const rows = Math.ceil(ok.length / 5);
await sharp({ create: { width: 5 * (cell + 4), height: rows * (cell + 4), channels: 3, background: "#000" } }).composite(tiles).jpeg({ quality: 82 }).toFile("qa/out/results.jpg");
console.log(ok.length, "tiles");
