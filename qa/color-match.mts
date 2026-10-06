/** Apply the color-accuracy pass to the saved recolor output and report ΔE. node --import tsx qa/color-match.mts */
import fs from "node:fs/promises";
import sharp from "sharp";
import { matchGarmentColor } from "../packages/core/src/engine/imaging";

const out = await fs.readFile("qa/out/consistency-recolor.png");
const mask = await fs.readFile("apps/web/public/studio/tour/render-mask.png");
const t0 = Date.now();
const r = await matchGarmentColor(out, mask, "#1f2a44");
await fs.writeFile("qa/out/consistency-colormatched.png", r.buf);
const a = await sharp(out).resize(300).toBuffer();
const b = await sharp(r.buf).resize(300).toBuffer();
const sw = await sharp({ create: { width: 60, height: 300, channels: 3, background: "#1f2a44" } }).png().toBuffer();
await sharp({ create: { width: 660, height: 300, channels: 3, background: "#fff" } })
  .composite([{ input: a, left: 0, top: 0 }, { input: b, left: 300, top: 0 }, { input: sw, left: 600, top: 0 }])
  .jpeg()
  .toFile("qa/out/cmp-color.jpg");
console.log(JSON.stringify({ ms: Date.now() - t0, deltaBefore: +r.deltaBefore.toFixed(1), deltaAfter: +r.deltaAfter.toFixed(1) }));
