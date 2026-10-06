/** Real-model identity check (no DB): one Photo Shoot frame with face/outfit close-up refs. node --env-file=.env.local --import tsx qa/identity.mts */
import fs from "node:fs/promises";
import sharp from "sharp";
import { generateImages } from "../packages/core/src/engine/run";
import { locateSubject } from "../packages/core/src/engine/detect";
import { cropBox } from "../packages/core/src/engine/imaging";
import { P, SHOOT_SHOTS } from "../packages/core/src/engine/prompts";

const look = await fs.readFile("apps/web/public/studio/tour/tryon.jpg");
const t0 = Date.now();
const loc = await locateSubject(look);
const face = loc.face ? await cropBox(look, loc.face, 0.35, 768) : null;
const outfit = loc.outfit && (loc.outfit[2] - loc.outfit[0]) * (loc.outfit[3] - loc.outfit[1]) < 0.6 ? await cropBox(look, loc.outfit, 0.05, 1024) : null;
const refs = [face, outfit].filter((b): b is Buffer => !!b);
const flags = { face: !!face, outfit: !!outfit };
const [out] = await generateImages(P.photoShoot("a sunlit Parisian street with limestone facades", SHOOT_SHOTS[2], flags), [look, ...refs], { resolution: "1K", aspect: "4:5" }, 1, "pro");
await fs.mkdir("qa/out", { recursive: true });
const tiles = await Promise.all([look, ...(face ? [face] : []), out].map((b) => sharp(b).resize({ height: 360 }).toBuffer()));
const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
let x = 0;
const comps = tiles.map((t, i) => {
  const c = { input: t, left: x, top: 0 };
  x += metas[i].width! + 8;
  return c;
});
await sharp({ create: { width: x, height: 360, channels: 3, background: "#fff" } }).composite(comps).jpeg().toFile("qa/out/identity.jpg");
console.log(JSON.stringify({ ms: Date.now() - t0, loc, flags }));
