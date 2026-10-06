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

/** Normalize an upload: auto-orient, strip metadata, cap to 4096px, keep alpha as PNG. */
export async function normalizeUpload(buf: Buffer): Promise<{ buf: Buffer; mime: string; width: number; height: number }> {
  const img = sharp(buf, { failOn: "none" }).rotate();
  const m = await img.metadata();
  const resized = img.resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true });
  const out = m.hasAlpha ? await resized.png().toBuffer({ resolveWithObject: true }) : await resized.jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  return { buf: out.data, mime: m.hasAlpha ? "image/png" : "image/jpeg", width: out.info.width, height: out.info.height };
}

/** Provider-friendly data URI (downscaled JPEG, or PNG when transparency matters). */
export async function toDataUri(buf: Buffer, max = 2048, keepAlpha = false): Promise<string> {
  const img = sharp(buf, { failOn: "none" }).rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
  if (keepAlpha) return `data:image/png;base64,${(await img.png().toBuffer()).toString("base64")}`;
  // Flatten transparency onto white so ghostforms don't turn black.
  const out = await img.flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

/** Binary mask (white = selected) resized to the target, as a single-channel raw buffer. */
async function maskAlpha(mask: Buffer, size: Dims, featherPx: number, dilatePx = 0): Promise<Buffer> {
  let m = sharp(mask).resize(size.width, size.height, { fit: "fill" }).removeAlpha().greyscale();
  if (dilatePx > 0) m = sharp(await m.blur(dilatePx).threshold(24).toBuffer());
  if (featherPx > 0) m = sharp(await m.toBuffer()).blur(featherPx);
  return m.raw().toBuffer();
}

/**
 * Paste `edited` over `original` only where `mask` is white (feathered). Keeps every pixel
 * outside the selection byte-identical — that's what makes region edits trustworthy.
 */
export async function compositeMasked(original: Buffer, edited: Buffer, mask: Buffer, opts: { feather?: number; dilate?: number } = {}): Promise<Buffer> {
  const size = await dims(original);
  const base = sharp(original).rotate().resize(size.width, size.height).removeAlpha().toColourspace("srgb");
  const top = await sharp(edited).resize(size.width, size.height, { fit: "fill" }).removeAlpha().toColourspace("srgb").raw().toBuffer();
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

export async function toPng(buf: Buffer): Promise<Buffer> {
  return sharp(buf).png().toBuffer();
}

export async function thumb(buf: Buffer, max = 512): Promise<Buffer> {
  return sharp(buf).rotate().resize({ width: max, height: max, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
}
