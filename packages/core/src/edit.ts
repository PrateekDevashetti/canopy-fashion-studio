import sharp from "sharp";
import { applyAdjust, isNeutral, type Adjust, type CropSpec } from "./adjust";
import { MAX_PIXELS } from "./media";

/**
 * Editor operations rendered on the server against the full-resolution master, so a saved edit
 * never loses resolution or picks up browser re-encoding. JPEG sources stay JPEG (q97, 4:4:4 —
 * visually lossless); everything else is written as PNG.
 */

const open = (buf: Buffer) => sharp(buf, { failOn: "none", limitInputPixels: MAX_PIXELS });

async function encode(img: sharp.Sharp, sourceMime: string, hasAlpha: boolean): Promise<Buffer> {
  if (sourceMime === "image/jpeg" && !hasAlpha) return img.jpeg({ quality: 97, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  return img.png({ compressionLevel: 6 }).toBuffer();
}

/** Upright RGBA pixels of the master. */
async function upright(buf: Buffer) {
  const { data, info } = await open(buf).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Crop + straighten. Mirrors the editor: the crop box (fractions of the image) is centred on
 * (cx, cy) and the image is rotated by -rot degrees about that centre. Areas outside the image
 * come out transparent, exactly as the live preview shows them.
 */
export async function cropImage(buf: Buffer, mime: string, c: CropSpec): Promise<Buffer> {
  const src = await upright(buf);
  const W = src.width;
  const H = src.height;
  const ow = Math.max(1, Math.round(c.w * W));
  const oh = Math.max(1, Math.round(c.h * H));
  const base = sharp(src.data, { raw: { width: W, height: H, channels: 4 } });
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

  // Rotate about the image centre (sharp: positive = clockwise, same as canvas), then find where the crop centre landed.
  const theta = -c.rot;
  const rotated = theta ? await base.rotate(theta, { background: transparent }).raw().toBuffer({ resolveWithObject: true }) : { data: src.data, info: { width: W, height: H } };
  const RW = rotated.info.width;
  const RH = rotated.info.height;
  const rad = (theta * Math.PI) / 180;
  const dx = c.cx * W - W / 2;
  const dy = c.cy * H - H / 2;
  const cx = RW / 2 + dx * Math.cos(rad) - dy * Math.sin(rad);
  const cy = RH / 2 + dx * Math.sin(rad) + dy * Math.cos(rad);

  // Pad so the crop window is always inside the canvas, then cut it out.
  const pad = Math.max(ow, oh);
  const left = Math.round(cx - ow / 2) + pad;
  const top = Math.round(cy - oh / 2) + pad;
  // Two passes: within one pipeline sharp would extract before extending.
  const padded = await sharp(rotated.data, { raw: { width: RW, height: RH, channels: 4 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: transparent })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = await sharp(padded.data, { raw: { width: padded.info.width, height: padded.info.height, channels: 4 } })
    .extract({ left: Math.max(0, left), top: Math.max(0, top), width: ow, height: oh })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { opaque = false; break; }
  const out = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  return encode(opaque ? out.removeAlpha() : out, mime, !opaque);
}

export async function adjustImage(buf: Buffer, mime: string, a: Adjust): Promise<Buffer> {
  if (isNeutral(a)) throw new Error("No adjustments to apply");
  const meta = await open(buf).metadata();
  const src = await upright(buf);
  applyAdjust(src.data, a, 4);
  const img = sharp(src.data, { raw: { width: src.width, height: src.height, channels: 4 } });
  return encode(meta.hasAlpha ? img : img.removeAlpha(), mime, Boolean(meta.hasAlpha));
}

/** Composite a transparent annotation layer (drawn in the editor) over the master. */
export async function annotateImage(buf: Buffer, mime: string, overlay: Buffer): Promise<Buffer> {
  const meta = await open(buf).metadata();
  const src = await upright(buf);
  const layer = await sharp(overlay, { limitInputPixels: MAX_PIXELS }).resize(src.width, src.height, { fit: "fill" }).ensureAlpha().png().toBuffer();
  const img = sharp(src.data, { raw: { width: src.width, height: src.height, channels: 4 } }).composite([{ input: layer }]);
  if (meta.hasAlpha) return encode(img, mime, true);
  // Flatten through a buffer: sharp applies removeAlpha before composite in a single pipeline.
  const flat = await img.raw().toBuffer({ resolveWithObject: true });
  return encode(sharp(flat.data, { raw: { width: flat.info.width, height: flat.info.height, channels: 4 } }).removeAlpha(), mime, false);
}
