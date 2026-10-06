/** Real-model background removal check. node --env-file=.env.local --import tsx qa/bg-removal.mts */
import fs from "node:fs/promises";
import sharp from "sharp";
import { removeBackground as removeBackgroundForQa } from "../packages/core/src/engine/run";

const src = await fs.readFile("apps/web/public/studio/tour/tryon.jpg");
const t0 = Date.now();
const out = await removeBackgroundForQa(src);
const m = await sharp(out).metadata();
// Show on a checkerboard so transparency is visible.
const { width = 0, height = 0 } = m;
const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#ddd"/><rect width="16" height="16" fill="#aaa"/><rect x="16" y="16" width="16" height="16" fill="#aaa"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
await fs.mkdir("qa/out", { recursive: true });
void tile;
await sharp(out).flatten({ background: "#5ce65c" }).resize({ height: 600 }).jpeg().toFile("qa/out/bg-removal.jpg");
const { data, info } = await sharp(out).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
let opaque = 0;
for (const v of data) if (v > 200) opaque++;
console.log(JSON.stringify({ ms: Date.now() - t0, size: [width, height], channels: m.channels, subjectShare: +(opaque / (info.width * info.height)).toFixed(3) }));
