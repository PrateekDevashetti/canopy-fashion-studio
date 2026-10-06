import sharp from "sharp";

sharp.cache(false);

export type Dims = { width: number; height: number };

export async function dims(buf: Buffer): Promise<Dims> {
  const m = await sharp(buf).metadata();
  const rotated = (m.orientation ?? 1) >= 5;
  const width = m.width ?? 0;
  const height = m.height ?? 0;
  return rotated ? { width: height, height: width } : { width, height };
}

/** Provider-friendly data URI (downscaled JPEG, or PNG when transparency matters). */
export async function toDataUri(buf: Buffer, max = 2048, keepAlpha = false): Promise<string> {
  const img = sharp(buf, { failOn: "none" }).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
  if (keepAlpha) return `data:image/png;base64,${(await img.png().toBuffer()).toString("base64")}`;
  // Flatten transparency onto white so ghostforms don't turn black.
  const out = await img.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/**
 * Pixels as interleaved sRGB with exactly 3 or 4 channels, whatever the source (greyscale,
 * grey+alpha, palette, CMYK). Model outputs vary in format; assuming 3 channels on a grey+alpha
 * PNG misaligns every row (the "scan-line" artifact).
 */
export async function rawRGB(img: sharp.Sharp, channels: 3 | 4 = 3): Promise<{ data: Buffer; width: number; height: number }> {
  // Read whatever sharp produces, then normalise the layout ourselves: some pipelines (greyscale,
  // threshold) pin the output to 1 band no matter what colourspace is requested.
  const { data: src, info } = await img.toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const c = info.channels;
  if (c === channels) return { data: src, width: info.width, height: info.height };
  const out = Buffer.alloc(n * channels);
  for (let i = 0; i < n; i++) {
    const s = i * c;
    const d = i * channels;
    const [r, g, b] = c >= 3 ? [src[s], src[s + 1], src[s + 2]] : [src[s], src[s], src[s]];
    const a = c === 4 ? src[s + 3] : c === 2 ? src[s + 1] : 255;
    out[d] = r;
    out[d + 1] = g;
    out[d + 2] = b;
    if (channels === 4) out[d + 3] = a;
  }
  return { data: out, width: info.width, height: info.height };
}

/** Binary mask (white = selected) resized to the target, as a single-channel raw buffer. */
async function maskAlpha(mask: Buffer, size: Dims, featherPx: number, dilatePx = 0): Promise<Buffer> {
  // Stay in single-channel raw the whole way: round-tripping through an encoded image can come
  // back as 3 channels, which would misplace the mask.
  const raw = { raw: { width: size.width, height: size.height, channels: 1 as const } };
  let buf = await sharp(mask).resize(size.width, size.height, { fit: "fill" }).removeAlpha().extractChannel(0).raw().toBuffer();
  if (dilatePx > 0) buf = await sharp(buf, raw).blur(Math.max(0.3, dilatePx)).threshold(24).extractChannel(0).raw().toBuffer();
  if (featherPx > 0) buf = await sharp(buf, raw).blur(Math.max(0.3, featherPx)).extractChannel(0).raw().toBuffer();
  if (buf.length !== size.width * size.height) throw new Error(`mask buffer has ${buf.length / (size.width * size.height)} channels`);
  return buf;
}

/**
 * Paste `edited` over `original` only where `mask` is white (feathered). Keeps every pixel
 * outside the selection byte-identical — that's what makes region edits trustworthy.
 */
export async function compositeMasked(original: Buffer, edited: Buffer, mask: Buffer, opts: { feather?: number; dilate?: number } = {}): Promise<Buffer> {
  const size = await dims(original);
  const base = sharp(original).rotate().resize(size.width, size.height).removeAlpha().toColourspace("srgb");
  const top = (await rawRGB(sharp(edited).resize(size.width, size.height, { fit: "fill" }), 3)).data;
  const alpha = await maskAlpha(mask, size, opts.feather ?? Math.max(2, Math.round(Math.min(size.width, size.height) / 300)), opts.dilate ?? 0);
  const rgba = Buffer.alloc(size.width * size.height * 4);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 3) {
    rgba[i * 4] = top[j];
    rgba[i * 4 + 1] = top[j + 1];
    rgba[i * 4 + 2] = top[j + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  const overlay = await sharp(rgba, { raw: { width: size.width, height: size.height, channels: 4 } }).png().toBuffer();
  return base.composite([{ input: overlay }]).png().toBuffer();
}

/** Original with the selection tinted + outlined, to show a model *where* to edit. */
export async function highlightRegion(original: Buffer, mask: Buffer): Promise<Buffer> {
  const size = await dims(original);
  const alpha = await maskAlpha(mask, size, 0);
  const rgba = Buffer.alloc(size.width * size.height * 4);
  for (let i = 0; i < alpha.length; i++) {
    const on = alpha[i] > 127;
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 0;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = on ? 110 : 0;
  }
  const overlay = await sharp(rgba, { raw: { width: size.width, height: size.height, channels: 4 } }).png().toBuffer();
  return sharp(original).rotate().resize(size.width, size.height).composite([{ input: overlay }]).jpeg({ quality: 90 }).toBuffer();
}

/** Crop the masked region's bounding box (with padding) — used to show the garment being extracted. */
export async function cropToMask(original: Buffer, mask: Buffer, padRatio = 0.06): Promise<Buffer> {
  const size = await dims(original);
  const alpha = await maskAlpha(mask, size, 0);
  let x0 = size.width, y0 = size.height, x1 = 0, y1 = 0;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      if (alpha[y * size.width + x] > 127) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return sharp(original).rotate().jpeg().toBuffer();
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * padRatio);
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  const width = Math.min(size.width - left, x1 - x0 + pad * 2);
  const height = Math.min(size.height - top, y1 - y0 + pad * 2);
  return sharp(original).rotate().extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
}

/** Fraction of the image a mask covers (0–1). */
export async function maskCoverage(mask: Buffer): Promise<number> {
  const { data, info } = await sharp(mask).removeAlpha().greyscale().resize(256, 256, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 127) on++;
  return on / (info.width * info.height);
}

/** A rectangle mask (normalized 0–1 box) — fallback when segmentation is unavailable. */
export async function boxMask(size: Dims, box: [number, number, number, number]): Promise<Buffer> {
  const [x0, y0, x1, y1] = box;
  const w = Math.max(1, Math.round((x1 - x0) * size.width));
  const h = Math.max(1, Math.round((y1 - y0) * size.height));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><rect width="100%" height="100%" fill="black"/><rect x="${Math.round(x0 * size.width)}" y="${Math.round(y0 * size.height)}" width="${w}" height="${h}" rx="${Math.round(Math.min(w, h) * 0.08)}" fill="white"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Normalize any provider mask into black/white PNG at the target size. */
export async function binarizeMask(mask: Buffer, size: Dims): Promise<Buffer> {
  const meta = await sharp(mask).metadata();
  let img = sharp(mask).resize(size.width, size.height, { fit: "fill" });
  // SAM masks come back either as alpha cutouts or as white-on-black.
  img = meta.hasAlpha ? img.extractChannel("alpha") : img.removeAlpha().greyscale();
  return img.threshold(127).png().toBuffer();
}

/**
 * Key out a chroma-green background into transparency, applied to the ORIGINAL pixels where
 * possible (the green render only decides the alpha), with a soft edge and despill.
 */
export async function chromaKey(green: Buffer, original: Buffer): Promise<Buffer> {
  const od = await dims(original);
  const gd = await dims(green);
  // If the model reframed the image, the original's pixels no longer line up — key the model's own.
  const aligned = Math.abs(Math.log(gd.width / gd.height / (od.width / od.height))) < 0.02;
  const size = aligned ? od : gd;
  const g = (await rawRGB(sharp(green).resize(size.width, size.height, { fit: "fill" }), 3)).data;
  const o = aligned ? (await rawRGB(sharp(original).rotate().resize(size.width, size.height), 3)).data : g;
  const alpha = Buffer.alloc(size.width * size.height);
  for (let i = 0, j = 0; i < alpha.length; i++, j += 3) {
    const r = g[j], gg = g[j + 1], b = g[j + 2];
    // How "green-screen" is this pixel? 0 = subject, 1 = background.
    const dom = gg - Math.max(r, b);
    const t = Math.min(1, Math.max(0, (dom - 40) / 80));
    alpha[i] = Math.round((1 - t) * 255);
  }
  const softened = await sharp(alpha, { raw: { width: size.width, height: size.height, channels: 1 } }).blur(0.8).raw().toBuffer();
  const rgba = Buffer.alloc(size.width * size.height * 4);
  for (let i = 0, j = 0; i < softened.length; i++, j += 3) {
    rgba[i * 4] = o[j];
    rgba[i * 4 + 1] = Math.min(o[j + 1], Math.max(o[j], o[j + 2]) + 30); // despill
    rgba[i * 4 + 2] = o[j + 2];
    rgba[i * 4 + 3] = softened[i];
  }
  return sharp(rgba, { raw: { width: size.width, height: size.height, channels: 4 } }).png().toBuffer();
}

/* ---------------- consistency helpers ---------------- */

/** Aspect ratios the image models can output. */
export const ASPECTS: [string, number][] = [["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["2:3", 2 / 3], ["9:16", 9 / 16], ["5:4", 1.25], ["4:3", 4 / 3], ["3:2", 1.5], ["16:9", 16 / 9]];
export const nearestAspect = (r: number) => ASPECTS.reduce((a, b) => (Math.abs(Math.log(b[1] / r)) < Math.abs(Math.log(a[1] / r)) ? b : a));

export type Pad = { aspect: string; size: Dims; box: { left: number; top: number; width: number; height: number } };

/**
 * Mirror-pad an image to the nearest aspect the models support, so an edit comes back with the
 * same framing instead of being stretched to fit — that's what keeps composites seam-free.
 */
export async function padToAspect(buf: Buffer): Promise<{ buf: Buffer; pad: Pad }> {
  const upright = await sharp(buf, { failOn: "none" }).rotate().toBuffer();
  const { width: W, height: H } = await dims(upright);
  const [aspect, r] = nearestAspect(W / H);
  let w = W;
  let h = H;
  if (Math.abs(Math.log(W / H / r)) > 0.004) {
    if (W / H < r) w = Math.round(H * r);
    else h = Math.round(W / r);
  }
  const left = Math.floor((w - W) / 2);
  const top = Math.floor((h - H) / 2);
  const pad: Pad = { aspect, size: { width: w, height: h }, box: { left, top, width: W, height: H } };
  if (w === W && h === H) return { buf: upright, pad };
  const out = await sharp(upright)
    .extend({ left, right: w - W - left, top, bottom: h - H - top, extendWith: "mirror" })
    .png()
    .toBuffer();
  return { buf: out, pad };
}

/** Undo padToAspect on a model output: rescale to the padded frame, then cut the original area back out. */
export async function unpad(out: Buffer, pad: Pad): Promise<Buffer> {
  const frame = await sharp(out).resize(pad.size.width, pad.size.height, { fit: "fill" }).png().toBuffer();
  return sharp(frame).extract(pad.box).png().toBuffer();
}

/** Pad a mask with the same geometry (padding is never selected). */
export async function padMask(mask: Buffer, pad: Pad): Promise<Buffer> {
  const { box, size } = pad;
  const m = await sharp(mask).resize(box.width, box.height, { fit: "fill" }).removeAlpha().greyscale().toBuffer();
  if (box.width === size.width && box.height === size.height) return sharp(m).png().toBuffer();
  return sharp(m)
    .extend({ left: box.left, right: size.width - box.width - box.left, top: box.top, bottom: size.height - box.height - box.top, background: "#000000" })
    .png()
    .toBuffer();
}

/**
 * How much did an edit change the image *outside* the region it was meant to touch?
 * Mean absolute difference (0–1) on a 256px luminance thumbnail, ignoring the (dilated) mask.
 * Near 0 = the model respected the frame; high = it reframed, relit or redrew the scene.
 */
export async function outsideDrift(original: Buffer, edited: Buffer, mask: Buffer | null): Promise<number> {
  const S = 256;
  const a = await sharp(original).rotate().resize(S, S, { fit: "fill" }).removeAlpha().greyscale().raw().toBuffer();
  const b = await sharp(edited).resize(S, S, { fit: "fill" }).removeAlpha().greyscale().raw().toBuffer();
  const m = mask ? await sharp(mask).resize(S, S, { fit: "fill" }).removeAlpha().greyscale().blur(4).raw().toBuffer() : null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (m && m[i] > 8) continue;
    sum += Math.abs(a[i] - b[i]);
    n++;
  }
  return n ? sum / n / 255 : 0;
}

/** Crop a normalized box ([x0,y0,x1,y1], 0–1) with padding, upscaled so small faces still carry detail. */
export async function cropBox(buf: Buffer, box: [number, number, number, number], padRatio = 0.25, minEdge = 768): Promise<Buffer | null> {
  const { width: W, height: H } = await dims(buf);
  const [x0, y0, x1, y1] = box;
  const bw = (x1 - x0) * W;
  const bh = (y1 - y0) * H;
  if (bw < 8 || bh < 8) return null;
  const pad = Math.max(bw, bh) * padRatio;
  const left = Math.max(0, Math.round(x0 * W - pad));
  const top = Math.max(0, Math.round(y0 * H - pad));
  const width = Math.min(W - left, Math.round(bw + pad * 2));
  const height = Math.min(H - top, Math.round(bh + pad * 2));
  const scale = Math.max(1, minEdge / Math.max(width, height));
  return sharp(buf)
    .rotate()
    .extract({ left, top, width, height })
    .resize(Math.round(width * scale), Math.round(height * scale), { kernel: "lanczos3" })
    .jpeg({ quality: 94 })
    .toBuffer();
}

/* ---------------- color accuracy ---------------- */

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const fLab = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
const WX = 0.95047;
const WZ = 1.08883;

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r / 255), G = lin(g / 255), B = lin(b / 255);
  const x = fLab((0.4124 * R + 0.3576 * G + 0.1805 * B) / WX);
  const y = fLab(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = fLab((0.0193 * R + 0.1192 * G + 0.9505 * B) / WZ);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labToRgb(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const X = fInv(fy + a / 500) * WX, Y = fInv(fy), Z = fInv(fy - bb / 200) * WZ;
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, B = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const to = (c: number) => Math.max(0, Math.min(255, Math.round(gam(Math.max(0, c)) * 255)));
  return [to(R), to(G), to(B)];
}

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/**
 * Pull a recolored garment onto the exact requested color. Models tend to under-shoot dye changes
 * (navy comes back as mid-blue); this shifts the masked region's mean Lab color onto the target
 * while keeping its texture and shading (per-pixel deviations from the mean are preserved).
 * Returns the corrected image and the CIE76 ΔE of the garment's mean color before/after.
 */
export async function matchGarmentColor(buf: Buffer, mask: Buffer, hex: string): Promise<{ buf: Buffer; deltaBefore: number; deltaAfter: number }> {
  const { width, height } = await dims(buf);
  const rgb = (await rawRGB(sharp(buf).rotate(), 3)).data;
  const w = await maskAlpha(mask, { width, height }, 1.5);
  const target = rgbToLab(...hexRgb(hex));
  // Weighted mean of the selected (fully-inside) pixels.
  let sL = 0, sa = 0, sb = 0, n = 0;
  for (let i = 0, j = 0; i < w.length; i++, j += 3) {
    if (w[i] < 200) continue;
    const [L, a, b] = rgbToLab(rgb[j], rgb[j + 1], rgb[j + 2]);
    sL += L; sa += a; sb += b; n++;
  }
  if (n < 50) return { buf, deltaBefore: 0, deltaAfter: 0 };
  const mean = [sL / n, sa / n, sb / n];
  const de = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const deltaBefore = de(mean, target);
  if (deltaBefore < 3) return { buf, deltaBefore, deltaAfter: deltaBefore };
  // Lightness: shift the mean and compress contrast a little for very dark/light targets so texture survives.
  const lScale = Math.max(0.55, Math.min(1, 1 - Math.abs(target[0] - mean[0]) / 160));
  const out = Buffer.from(rgb);
  let oL = 0, oa = 0, ob = 0, on = 0;
  for (let i = 0, j = 0; i < w.length; i++, j += 3) {
    if (!w[i]) continue;
    const [L, a, b] = rgbToLab(rgb[j], rgb[j + 1], rgb[j + 2]);
    // Only the dyed fabric moves: hardware, trims and contrast stitching sit far from the fabric's
    // mean color and fade out of the correction.
    const dist = Math.hypot((L - mean[0]) * 0.5, a - mean[1], b - mean[2]);
    const sim = dist <= 18 ? 1 : dist >= 32 ? 0 : 1 - (dist - 18) / 14;
    if (!sim) continue;
    const nL = target[0] + (L - mean[0]) * lScale;
    const na = target[1] + (a - mean[1]);
    const nb = target[2] + (b - mean[2]);
    const [r2, g2, b2] = labToRgb(nL, na, nb);
    const t = (w[i] / 255) * sim;
    out[j] = Math.round(rgb[j] + (r2 - rgb[j]) * t);
    out[j + 1] = Math.round(rgb[j + 1] + (g2 - rgb[j + 1]) * t);
    out[j + 2] = Math.round(rgb[j + 2] + (b2 - rgb[j + 2]) * t);
    if (w[i] >= 200) {
      const q = rgbToLab(out[j], out[j + 1], out[j + 2]);
      oL += q[0]; oa += q[1]; ob += q[2]; on++;
    }
  }
  const deltaAfter = on ? de([oL / on, oa / on, ob / on], target) : deltaBefore;
  return { buf: await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer(), deltaBefore, deltaAfter };
}

/** Cut out the original using a (soft) white-on-black matte: original pixels, matte as alpha. */
export async function applyMatte(original: Buffer, matte: Buffer): Promise<Buffer> {
  const size = await dims(original);
  const rgb = (await rawRGB(sharp(original).rotate(), 3)).data;
  // Clean the matte: crush near-black/near-white, keep a soft 1–2px edge.
  const a = await maskAlpha(matte, size, 0);
  const alpha = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) alpha[i] = a[i] < 40 ? 0 : a[i] > 215 ? 255 : Math.round(((a[i] - 40) / 175) * 255);
  const soft = await sharp(alpha, { raw: { width: size.width, height: size.height, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer();
  const rgba = Buffer.alloc(size.width * size.height * 4);
  for (let i = 0, j = 0; i < soft.length; i++, j += 3) {
    rgba[i * 4] = rgb[j];
    rgba[i * 4 + 1] = rgb[j + 1];
    rgba[i * 4 + 2] = rgb[j + 2];
    rgba[i * 4 + 3] = soft[i];
  }
  return sharp(rgba, { raw: { width: size.width, height: size.height, channels: 4 } }).png().toBuffer();
}

export async function toPng(buf: Buffer): Promise<Buffer> {
  return sharp(buf).png().toBuffer();
}

export async function thumb(buf: Buffer, max = 512): Promise<Buffer> {
  return sharp(buf).rotate().resize({ width: max, height: max, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
}
