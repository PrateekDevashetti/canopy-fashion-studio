/**
 * Real-model consistency check (no DB): recolor the tour render inside its garment mask and
 * measure how much the model drifted outside it, before and after compositing.
 *   node --env-file=.env.local --import tsx qa/consistency.mts
 */
import fs from "node:fs/promises";
import sharp from "sharp";
import { generateImages } from "../packages/core/src/engine/run";
import { compositeMasked, highlightRegion, outsideDrift, padMask, padToAspect, unpad } from "../packages/core/src/engine/imaging";
import { P } from "../packages/core/src/engine/prompts";

const base = await fs.readFile("apps/web/public/studio/tour/render.jpg");
const mask = await fs.readFile("apps/web/public/studio/tour/render-mask.png");
const color = { hex: "#1f2a44", name: "Navy" };

const { buf: padded, pad } = await padToAspect(base);
const pmask = await padMask(mask, pad);
const t0 = Date.now();
const [raw] = await generateImages(P.recolor(color, true, "jacket"), [padded, await highlightRegion(padded, pmask)], { resolution: "1K", aspect: pad.aspect }, 1, "fast");
const out = await unpad(raw, pad);
const drift = await outsideDrift(base, out, mask);
const final = await compositeMasked(base, out, mask, { dilate: 2 });
const after = await outsideDrift(base, final, mask);
await fs.mkdir("qa/out", { recursive: true });
await fs.writeFile("qa/out/consistency-recolor.png", final);
const m = await sharp(final).metadata();
console.log(JSON.stringify({ aspect: pad.aspect, ms: Date.now() - t0, driftBeforeComposite: +drift.toFixed(4), driftAfterComposite: +after.toFixed(4), size: [m.width, m.height] }));
