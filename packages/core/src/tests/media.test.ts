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
