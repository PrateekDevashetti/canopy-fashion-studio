import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

let storeImage: typeof import("../media").storeImage;
let getObjectBuffer: typeof import("../storage").getObjectBuffer;
let edit: typeof import("../edit");
let imaging: typeof import("../engine/imaging");

before(async () => {
  for (const k of ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) delete process.env[k];
  process.env.FASHION_STORAGE_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "fs-media-"));
  ({ storeImage } = await import("../media"));
  ({ getObjectBuffer } = await import("../storage"));
  edit = await import("../edit");
  imaging = await import("../engine/imaging");
});

/** Deterministic noisy test image (noise defeats compression, so re-encoding would be visible). */
async function photo(w: number, h: number, fmt: "jpeg" | "png" = "jpeg") {
  const raw = Buffer.alloc(w * h * 3);
  let seed = 7;
  for (let i = 0; i < raw.length; i++) raw[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff;
  const img = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
  return fmt === "jpeg" ? img.jpeg({ quality: 88 }).withMetadata({ orientation: 1 }).toBuffer() : img.png().toBuffer();
}

test("uploads are stored byte-for-byte", async () => {
  const input = await photo(640, 800);
  const s = await storeImage("prj_test", "ast_exact", input, { originalName: "look.jpg" });
  const back = await getObjectBuffer(s.storageKey);
  assert.ok(back && back.equals(input), "stored bytes must equal uploaded bytes");
  assert.equal(s.mime, "image/jpeg");
  assert.deepEqual([s.width, s.height], [640, 800]);
  assert.equal(s.meta.originalName, "look.jpg");
  assert.match(s.meta.sha256, /^[a-f0-9]{64}$/);
  assert.equal(s.previewKey, null, "small images need no preview");
});

test("large masters get a WebP preview; the master stays untouched", async () => {
  const input = await photo(3000, 3600, "png");
  const s = await storeImage("prj_test", "ast_big", input);
  assert.ok(s.previewKey?.endsWith(".webp"));
  const prev = await sharp((await getObjectBuffer(s.previewKey!))!).metadata();
  assert.ok(Math.max(prev.width!, prev.height!) <= 2560);
  assert.ok((await getObjectBuffer(s.storageKey))!.equals(input));
});

test("EXIF-rotated uploads report upright dimensions but keep original bytes", async () => {
  const input = await sharp(await photo(400, 300)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const s = await storeImage("prj_test", "ast_rot", input);
  assert.deepEqual([s.width, s.height], [300, 400]);
  assert.ok((await getObjectBuffer(s.storageKey))!.equals(input));
});

test("crop without rotation copies exact pixels from the master (PNG)", async () => {
  const input = await photo(200, 100, "png");
  const out = await edit.cropImage(input, "image/png", { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5, rot: 0 });
  const a = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([a.info.width, a.info.height], [100, 50]);
  const src = await sharp(input).extract({ left: 50, top: 25, width: 100, height: 50 }).raw().toBuffer();
  assert.ok(a.data.equals(src), "cropped pixels must match the source exactly");
});

test("rotated crop keeps the requested size", async () => {
  const input = await photo(300, 200, "png");
  const out = await edit.cropImage(input, "image/png", { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6, rot: 15 });
  const m = await sharp(out).metadata();
  assert.deepEqual([m.width, m.height], [180, 120]);
});

test("adjust refuses a neutral edit and changes pixels otherwise", async () => {
  const input = await photo(64, 64, "png");
  const neutral = { warmth: 0, contrast: 1, saturation: 1, brightness: 0, highlights: 0, shadows: 0, tint: 0, hue: 0 };
  await assert.rejects(edit.adjustImage(input, "image/png", neutral));
  const out = await edit.adjustImage(input, "image/png", { ...neutral, brightness: 20 });
  const m = await sharp(out).metadata();
  assert.deepEqual([m.width, m.height], [64, 64]);
  assert.ok(!(await sharp(out).raw().toBuffer()).equals(await sharp(input).raw().toBuffer()));
});

test("masked composite leaves every pixel outside the selection identical", async () => {
  const original = await photo(120, 120, "png");
  const edited = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const mask = await imaging.boxMask({ width: 120, height: 120 }, [0.25, 0.25, 0.75, 0.75]);
  const out = await imaging.compositeMasked(original, edited, mask, { feather: 0 });
  const o = await sharp(original).raw().toBuffer();
  const r = await sharp(out).removeAlpha().raw().toBuffer();
  // Corner region (well outside the box + feather) must be untouched.
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) for (let c = 0; c < 3; c++) assert.equal(r[(y * 120 + x) * 3 + c], o[(y * 120 + x) * 3 + c]);
});

test("feathered/dilated composites land exactly where the mask is", async () => {
  const W = 300, H = 200;
  const original = await sharp({ create: { width: W, height: H, channels: 3, background: "#808080" } }).png().toBuffer();
  const edited = await sharp({ create: { width: W, height: H, channels: 3, background: "#ff0000" } }).png().toBuffer();
  // Mask on the right side only.
  const mask = await imaging.boxMask({ width: W, height: H }, [0.6, 0.2, 0.9, 0.8]);
  for (const opts of [{}, { dilate: 3 }, { feather: 4, dilate: 10 }]) {
    const out = await imaging.compositeMasked(original, edited, mask, opts);
    const px = await sharp(out).removeAlpha().raw().toBuffer();
    const at = (x: number, y: number) => [...px.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];
    assert.deepEqual(at(225, 100), [255, 0, 0], `inside the mask is edited ${JSON.stringify(opts)}`);
    assert.deepEqual(at(60, 100), [128, 128, 128], `left side untouched ${JSON.stringify(opts)}`);
    assert.deepEqual(at(150, 100), [128, 128, 128], `middle untouched ${JSON.stringify(opts)}`);
  }
});

test("color match moves the garment onto the requested color and leaves the rest", async () => {
  const W = 200, H = 200;
  // Mid-blue "fabric" with texture in a box, grey around it.
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const inBox = x >= 50 && x < 150 && y >= 50 && y < 150;
    const n = ((x * 7 + y * 13) % 11) - 5;
    raw.set(inBox ? [70 + n, 100 + n, 160 + n] : [200, 200, 200], i);
  }
  const img = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const mask = await imaging.boxMask({ width: W, height: H }, [0.25, 0.25, 0.75, 0.75]);
  const r = await imaging.matchGarmentColor(img, mask, "#1f2a44");
  assert.ok(r.deltaBefore > 15 && r.deltaAfter < 4, `ΔE ${r.deltaBefore} → ${r.deltaAfter}`);
  const px = await sharp(r.buf).raw().toBuffer();
  assert.deepEqual([...px.subarray(0, 3)], [200, 200, 200], "outside untouched");
});

test("greyscale and grey+alpha inputs never produce misaligned (striped) pixels", async () => {
  const W = 120, H = 80;
  const grey = await sharp({ create: { width: W, height: H, channels: 3, background: "#777" } }).greyscale().png().toBuffer();
  const greyAlpha = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 90, g: 90, b: 90, alpha: 1 } } }).greyscale().png().toBuffer();
  for (const b of [grey, greyAlpha]) {
    const r = await imaging.rawRGB(sharp(b), 3);
    assert.equal(r.data.length, W * H * 3);
  }
  // Chroma key where the model returned a grey+alpha PNG: every row must key identically.
  const original = await sharp({ create: { width: W, height: H, channels: 3, background: "#c84" } }).png().toBuffer();
  const out = await imaging.chromaKey(greyAlpha, original);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  const row = (y: number) => data.subarray(y * W * 4, (y + 1) * W * 4);
  for (let y = 1; y < H; y++) assert.ok(row(y).equals(row(0)), `row ${y} differs (stripes)`);
  // Editor ops on a greyscale master.
  const cropped = await edit.cropImage(grey, "image/png", { cx: 0.5, cy: 0.5, w: 0.5, h: 0.5, rot: 0 });
  assert.deepEqual([(await sharp(cropped).metadata()).width, (await sharp(cropped).metadata()).height], [60, 40]);
});

test("pad → unpad round-trips odd aspect ratios without stretching", async () => {
  const input = await photo(1000, 1700, "png"); // ~0.588, between 9:16 and 2:3
  const { buf, pad } = await imaging.padToAspect(input);
  const m = await sharp(buf).metadata();
  assert.ok(["2:3", "9:16"].includes(pad.aspect));
  const [, r] = imaging.ASPECTS.find(([a]) => a === pad.aspect)!;
  assert.ok(Math.abs(m.width! / m.height! - r) < 0.003, "padded frame matches the model aspect");
  // Simulate a model returning the padded frame at a different resolution, untouched.
  const modelOut = await sharp(buf).resize(Math.round(m.width! * 0.6), Math.round(m.height! * 0.6)).png().toBuffer();
  const back = await imaging.unpad(modelOut, pad);
  const bm = await sharp(back).metadata();
  assert.deepEqual([bm.width, bm.height], [1000, 1700]);
  assert.ok((await imaging.outsideDrift(input, back, null)) < 0.03, "content stays aligned");
});

test("drift detects a reframed edit but ignores the masked region", async () => {
  const input = await photo(400, 400, "png");
  const mask = await imaging.boxMask({ width: 400, height: 400 }, [0.3, 0.3, 0.7, 0.7]);
  const blue = await sharp({ create: { width: 160, height: 160, channels: 3, background: "#00f" } }).png().toBuffer();
  const inside = await sharp(input).composite([{ input: blue, left: 120, top: 120 }]).png().toBuffer();
  assert.ok((await imaging.outsideDrift(input, inside, mask)) < 0.01, "changes inside the mask don't count");
  const shifted = await sharp(input).extract({ left: 40, top: 40, width: 360, height: 360 }).resize(400, 400).png().toBuffer();
  assert.ok((await imaging.outsideDrift(input, shifted, mask)) > 0.08, "a reframe is flagged");
});
