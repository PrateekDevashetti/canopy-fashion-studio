/**
 * Generate rail icons for new tools (photoreal object on white → transparent PNG, 192px).
 *   node --env-file=.env.local --import tsx qa/gen-icons.mts [name,...]
 */
import fs from "node:fs/promises";
import sharp from "sharp";
import { openrouterImage } from "../packages/core/src/engine/providers";

const ICONS: Record<string, string> = {
  vector: "a vintage brass drafting compass, slightly open",
  "garment-vector": "a folded kraft-paper sewing pattern piece printed with a dashed cutting line and notches",
  mood: "a small cork pinboard with three pinned photo prints and two fabric swatches",
  review: "a vintage brass and glass magnifying loupe",
  print: "a hand-carved wooden block-printing stamp with indigo ink on its face",
  trims: "a round embroidered patch next to three antique brass snap buttons",
  shopify: "a kraft paper shopping bag with twisted paper handles",
  pdp: "a small stack of cardboard clothing hang tags tied with cotton string",
};

/** Make near-white pixels connected to the border transparent (flood fill), soft edge. */
async function keyWhite(buf: Buffer) {
  const { data, info } = await sharp(buf).resize(384, 384, { fit: "contain", background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const bg = new Uint8Array(W * H);
  const white = (i: number) => data[i * 3] > 232 && data[i * 3 + 1] > 232 && data[i * 3 + 2] > 232;
  const stack: number[] = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (bg[i] || !white(i)) continue;
    bg[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }
  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = bg[i] ? 0 : 255;
  const soft = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.7).raw().toBuffer();
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = soft[i];
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).resize(176, 176, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

const only = process.argv[2]?.split(",");
for (const [name, object] of Object.entries(ICONS)) {
  if (only && !only.includes(name)) continue;
  const prompt = `Studio product photograph of ${object}. Single object, centered, three-quarter view, photorealistic, warm natural materials, soft diffused light, isolated on a pure white (#FFFFFF) background, no shadow, no props, no text.`;
  const [img] = await openrouterImage(prompt, [], { aspect: "1:1", model: "google/gemini-3.1-flash-image" });
  await fs.writeFile(`apps/web/public/studio/icons/${name}.png`, await keyWhite(img));
  console.log("icon", name);
}
