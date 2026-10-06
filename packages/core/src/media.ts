import crypto from "node:crypto";
import sharp from "sharp";
import { putObject } from "./storage";

/**
 * Master + preview storage for images.
 *
 * Masters are never re-encoded: an upload is stored byte-for-byte as received (so a download is
 * the exact file the user gave us), and a generation is stored exactly as the model/compositor
 * produced it. Only formats a browser can't show (HEIC, TIFF…) are converted, losslessly, to PNG.
 *
 * The feed and editor display a small WebP preview whenever the master is large, so pages stay
 * fast and every displayed image is served same-origin (canvas-safe) within Vercel's body limit.
 */

const WEB_FORMATS: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

/** Previews kick in above this size or this many pixels on the long edge. */
const PREVIEW_BYTES = 1.5 * 1024 * 1024;
const PREVIEW_EDGE = 2560;
/** Hard cap on decoded size (≈ 60 MP) — protects the workers' memory. */
export const MAX_PIXELS = 60_000_000;

export type Inspected = { buf: Buffer; mime: string; width: number; height: number; format: string; converted: boolean; hasAlpha: boolean };

/** Validate an image and work out its displayed size. Returns the bytes to store (unchanged unless conversion was required). */
export async function inspectImage(input: Buffer): Promise<Inspected> {
  const m = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata();
  if (!m.width || !m.height || !m.format) throw new Error("unreadable image");
  const rotated = (m.orientation ?? 1) >= 5;
  const width = rotated ? m.height : m.width;
  const height = rotated ? m.width : m.height;
  const mime = WEB_FORMATS[m.format];
  if (mime) return { buf: input, mime, width, height, format: m.format, converted: false, hasAlpha: Boolean(m.hasAlpha) };
  // Not viewable in browsers: convert losslessly so nothing about the pixels changes.
  const png = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().png({ compressionLevel: 6 }).toBuffer();
  return { buf: png, mime: "image/png", width, height, format: m.format, converted: true, hasAlpha: Boolean(m.hasAlpha) };
}

export const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

/** WebP preview (auto-oriented, ≤2560px) or null when the master is already light enough. */
export async function makePreview(img: Pick<Inspected, "buf" | "width" | "height" | "mime">): Promise<Buffer | null> {
  const big = img.buf.length > PREVIEW_BYTES || Math.max(img.width, img.height) > PREVIEW_EDGE;
  if (!big && img.mime !== "image/avif") return null;
  return sharp(img.buf, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 90, effort: 4 })
    .toBuffer();
}

const isSvg = (buf: Buffer) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(buf.subarray(0, 2048).toString("utf8"));

/**
 * Remove anything executable from an SVG: scripts, event handlers, foreign objects and external
 * references. Served SVGs also get a sandboxing CSP, so this is defence in depth.
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("|')\s*(?!#|data:image\/)[^"']*\2/gi, "")
    .replace(/javascript:/gi, "");
}

async function storeSvg(projectId: string, assetId: string, input: Buffer, opts: { originalName?: string }) {
  const svg = Buffer.from(sanitizeSvg(input.toString("utf8")), "utf8");
  const m = await sharp(svg, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!m.width || !m.height) throw new Error("unreadable image");
  const scale = Math.min(1, PREVIEW_EDGE / Math.max(m.width, m.height));
  const preview = await sharp(svg, { density: 72 * Math.max(1, 1 / scale) })
    .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: "inside" })
    .webp({ quality: 90, alphaQuality: 95 })
    .toBuffer();
  const storageKey = `p/${projectId}/${assetId}.svg`;
  const previewKey = `p/${projectId}/previews/${assetId}.webp`;
  await Promise.all([putObject(storageKey, svg), putObject(previewKey, preview)]);
  return {
    storageKey,
    previewKey,
    mime: "image/svg+xml",
    width: m.width,
    height: m.height,
    bytes: svg.length,
    meta: { sha256: sha256(svg), format: "svg", ...(opts.originalName ? { originalName: opts.originalName } : {}) },
  };
}

/** Store a master image (as-is) and its preview. Returns the storage fields for an asset row. */
export async function storeImage(projectId: string, assetId: string, input: Buffer, opts: { originalName?: string } = {}) {
  if (isSvg(input)) return storeSvg(projectId, assetId, input, opts);
  const img = await inspectImage(input);
  const storageKey = `p/${projectId}/${assetId}.${EXT[img.mime] ?? "png"}`;
  const preview = await makePreview(img);
  const previewKey = preview ? `p/${projectId}/previews/${assetId}.webp` : null;
  await Promise.all([putObject(storageKey, img.buf), preview && previewKey ? putObject(previewKey, preview) : null]);
  return {
    storageKey,
    previewKey,
    mime: img.mime,
    width: img.width,
    height: img.height,
    bytes: img.buf.length,
    meta: { sha256: sha256(img.buf), format: img.format, ...(opts.originalName ? { originalName: opts.originalName } : {}) },
  };
}
