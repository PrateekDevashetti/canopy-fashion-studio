/**
 * Preview cards + rail icons for the new tools, built from real outputs of the audit runs (no
 * model calls). node --import tsx qa/make-new-tool-art.mts
 */
import fs from "node:fs/promises";
import sharp from "sharp";
import { traceLineArt } from "../packages/core/src/engine/vector";
import { rawRGB } from "../packages/core/src/engine/imaging";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const P = "p/prj_bvsxs25c3fomjxy4";
const get = async (key: string) => Buffer.from(await (await fetch(`${BASE}/api/files/${key}`, { redirect: "follow" })).arrayBuffer());
const OUT = "apps/web/public/studio";

const files = {
  trim: `${P}/previews/ast_mptywbf6c954a8ru.webp`,
  threeq: `${P}/ast_71q7gvwlmj38wnor.png`,
  front: `${P}/previews/ast_qgzx9mkr5n9sota3.webp`,
  onModel: `${P}/ast_hzidbrodqtbs52z3.png`,
  vectorFlat: `${P}/previews/ast_n09rj3gnex220bhb.webp`,
  detail: `${P}/previews/ast_fla5imn5zl4onjyw.webp`,
  print: `${P}/previews/ast_v543lzgkwtd719r5.webp`,
  mood: `${P}/ast_xmszhhkp5a7u9eo0.jpg`,
};
const img: Record<string, Buffer> = {};
for (const [k, v] of Object.entries(files)) img[k] = await get(v);
const sketch = await fs.readFile(`${OUT}/tour/sketch.jpg`);
const lineSvg = Buffer.from(await traceLineArt(sketch));

const card = (b: Buffer, bg = "#ffffff") => sharp(b, { density: 150 }).flatten({ background: bg }).resize(640, 640, { fit: "cover", position: "attention" }).jpeg({ quality: 86 }).toBuffer();
const contain = (b: Buffer, bg = "#f2f0ec") => sharp(b, { density: 150 }).flatten({ background: bg }).resize(560, 560, { fit: "contain", background: bg }).extend({ top: 40, bottom: 40, left: 40, right: 40, background: bg }).jpeg({ quality: 86 }).toBuffer();

/** 2×2 grid card. */
async function grid(bufs: Buffer[], bg = "#ececec") {
  const tiles = await Promise.all(bufs.map((b) => sharp(b).flatten({ background: "#fff" }).resize(312, 312, { fit: "cover" }).toBuffer()));
  return sharp({ create: { width: 640, height: 640, channels: 3, background: bg } })
    .composite(tiles.map((t, i) => ({ input: t, left: 8 + (i % 2) * 320, top: 8 + Math.floor(i / 2) * 320 })))
    .jpeg({ quality: 86 })
    .toBuffer();
}

/** Tile a print 3×3 to show it repeats. */
async function tiled(b: Buffer) {
  const t = await sharp(b).resize(214, 214).toBuffer();
  return sharp({ create: { width: 642, height: 642, channels: 3, background: "#fff" } })
    .composite([0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => ({ input: t, left: x * 214, top: y * 214 }))))
    .resize(640, 640)
    .jpeg({ quality: 86 })
    .toBuffer();
}

const previews: Record<string, Buffer> = {
  vector: await contain(lineSvg, "#ffffff"),
  "garment-vector": await contain(img.vectorFlat, "#ffffff"),
  mood: await card(img.mood),
  print: await tiled(img.print),
  trims: await card(img.trim),
  pdp: await grid([img.front, img.threeq, img.detail, img.onModel]),
  review: await grid([img.onModel, img.trim, img.front, img.mood], "#1b1b1b"),
  shopify: await grid([img.front, img.threeq, img.detail, img.onModel], "#95bf47"),
};
for (const [k, b] of Object.entries(previews)) await fs.writeFile(`${OUT}/previews/${k}.jpg`, b);

/* Icons: cut-outs of real pieces (white keyed out), 192px transparent. */
async function keyWhiteIcon(b: Buffer, crop?: { left: number; top: number; width: number; height: number }) {
  let s = sharp(b, { density: 150 }).flatten({ background: "#ffffff" });
  if (crop) {
    const m = await sharp(await s.png().toBuffer()).metadata();
    s = sharp(await s.png().toBuffer()).extract({ left: Math.round(crop.left * m.width!), top: Math.round(crop.top * m.height!), width: Math.round(crop.width * m.width!), height: Math.round(crop.height * m.height!) });
  }
  const { data, width: W, height: H } = await rawRGB(s.resize(360, 360, { fit: "contain", background: "#ffffff" }), 3);
  const bg = new Uint8Array(W * H);
  const white = (i: number) => data[i * 3] > 226 && data[i * 3 + 1] > 226 && data[i * 3 + 2] > 226;
  const st: number[] = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) {
    const i = st.pop()!;
    if (bg[i] || !white(i)) continue;
    bg[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) st.push(i - 1);
    if (x < W - 1) st.push(i + 1);
    if (y > 0) st.push(i - W);
    if (y < H - 1) st.push(i + W);
  }
  const a = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) a[i] = bg[i] ? 0 : 255;
  const soft = await sharp(a, { raw: { width: W, height: H, channels: 1 } }).blur(0.7).extractChannel(0).raw().toBuffer();
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = soft[i];
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 1 })
    .resize(176, 176, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** A small physical-looking card (rounded, slight tilt) from an image — for board-like tools. */
async function cardIcon(b: Buffer, tilt = -6) {
  const face = await sharp(b).resize(150, 150, { fit: "cover" }).png().toBuffer();
  const mask = Buffer.from(`<svg width="150" height="150"><rect width="150" height="150" rx="14" fill="#fff"/></svg>`);
  const rounded = await sharp(face).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp(rounded).rotate(tilt, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(176, 176, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/** Circular cut-out around a point (fractions) — e.g. a patch on a garment. */
async function circleIcon(b: Buffer, cx: number, cy: number, r: number) {
  const m = await sharp(b).metadata();
  const R = Math.round(r * Math.min(m.width!, m.height!));
  const left = Math.max(0, Math.round(cx * m.width! - R));
  const top = Math.max(0, Math.round(cy * m.height! - R));
  const face = await sharp(b).extract({ left, top, width: 2 * R, height: 2 * R }).resize(176, 176).png().toBuffer();
  const mask = Buffer.from(`<svg width="176" height="176"><circle cx="88" cy="88" r="86" fill="#fff"/></svg>`);
  const round = await sharp(face).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp(round).extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

// Line-art icon in warm ink so it reads on the dark rail.
const lineIcon = await sharp(Buffer.from((await traceLineArt(sketch)).replace(/fill="rgb\(0,0,0\)"/g, 'fill="rgb(236,226,206)"')), { density: 150 })
  .resize(176, 176, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const icons: Record<string, Buffer> = {
  vector: lineIcon,
  "garment-vector": await keyWhiteIcon(img.vectorFlat),
  mood: await cardIcon(img.mood, -7),
  print: await cardIcon(img.print, 6),
  trims: await circleIcon(img.trim, 0.665, 0.53, 0.2),
  pdp: await keyWhiteIcon(img.threeq),
  review: await cardIcon(img.onModel, -5),
  shopify: await cardIcon(img.front, 5),
};
for (const [k, b] of Object.entries(icons)) await fs.writeFile(`${OUT}/icons/${k}.png`, b);

// Contact sheet for review.
const all = [...Object.values(icons)];
await sharp({ create: { width: 200 * all.length, height: 200, channels: 3, background: "#1a1a1a" } })
  .composite(all.map((b, i) => ({ input: b, left: i * 200 + 4, top: 4 })))
  .jpeg()
  .toFile("qa/out/new-icons.jpg");
const pv = Object.values(previews);
await sharp({ create: { width: 4 * 330, height: 2 * 330, channels: 3, background: "#111" } })
  .composite(await Promise.all(pv.map(async (b, i) => ({ input: await sharp(b).resize(320, 320).toBuffer(), left: (i % 4) * 330 + 5, top: Math.floor(i / 4) * 330 + 5 }))))
  .jpeg()
  .toFile("qa/out/new-previews.jpg");
console.log("done", Object.keys(icons).length, "icons", Object.keys(previews).length, "previews");
