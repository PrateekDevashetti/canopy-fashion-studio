/** Offline tracing check (no model calls). node --import tsx qa/trace.mts */
import fs from "node:fs/promises";
import sharp from "sharp";
import { traceColor, traceLineArt } from "../packages/core/src/engine/vector";

await fs.mkdir("qa/out", { recursive: true });
const sketch = await fs.readFile("apps/web/public/studio/tour/sketch.jpg");
const render = await fs.readFile("apps/web/public/studio/tour/render.jpg");
let t = Date.now();
const line = await traceLineArt(sketch);
console.log("line", line.length, "bytes", Date.now() - t, "ms");
t = Date.now();
const color = await traceColor(render);
console.log("color", color.length, "bytes", Date.now() - t, "ms");
const tiles = await Promise.all(
  [sketch, Buffer.from(line), render, Buffer.from(color)].map((b) => sharp(b, { density: 96 }).flatten({ background: "#fff" }).resize({ height: 420 }).toBuffer()),
);
const metas = await Promise.all(tiles.map((x) => sharp(x).metadata()));
let x = 0;
const comps = tiles.map((input, i) => {
  const c = { input, left: x, top: 0 };
  x += metas[i].width! + 8;
  return c;
});
await sharp({ create: { width: x, height: 420, channels: 3, background: "#888" } }).composite(comps).jpeg().toFile("qa/out/trace.jpg");
