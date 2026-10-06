import sharp from "sharp";
// @ts-expect-error — no type definitions shipped
import ImageTracer from "imagetracerjs";
import { rawRGB } from "./imaging";

/**
 * Deterministic raster → SVG tracing. The image model draws a clean, faithful line drawing or flat
 * illustration first; tracing then turns exactly those pixels into vector paths (no hallucinated
 * detail, unlike text-to-vector models).
 */

type Rgba = { r: number; g: number; b: number; a: number };

async function imageData(buf: Buffer, maxEdge: number, prep: (s: sharp.Sharp) => sharp.Sharp) {
  const img = prep(sharp(buf).rotate().flatten({ background: "#ffffff" }).resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }));
  const { data, width, height } = await rawRGB(img, 4);
  return { width, height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

/** Drop paths filled with (near-)white so the background is transparent. */
function stripWhite(svg: string): string {
  return svg.replace(/<path[^>]*fill="rgb\((\d+),(\d+),(\d+)\)"[^>]*\/>/g, (m, r, g, b) => (Number(r) > 235 && Number(g) > 235 && Number(b) > 235 ? "" : m));
}

/** Line art (sketches, technical flats): black strokes, transparent background. */
export async function traceLineArt(buf: Buffer): Promise<string> {
  const img = await imageData(buf, 2048, (s) => s.greyscale().normalise().threshold(170).toColourspace("srgb"));
  const pal: Rgba[] = [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ];
  const svg: string = ImageTracer.imagedataToSVG(img, {
    ltres: 0.5,
    qtres: 0.5,
    pathomit: 6,
    rightangleenhance: false,
    colorsampling: 0,
    pal,
    numberofcolors: 2,
    strokewidth: 0,
    linefilter: false,
    roundcoords: 2,
    viewbox: true,
    desc: false,
  });
  return finish(stripWhite(svg), img.width, img.height);
}

/** Flat colour illustration (garment flats): posterised fills. */
export async function traceColor(buf: Buffer, colors = 14): Promise<string> {
  const img = await imageData(buf, 1600, (s) => s.median(3));
  const svg: string = ImageTracer.imagedataToSVG(img, {
    ltres: 1,
    qtres: 1,
    pathomit: 12,
    colorsampling: 2,
    numberofcolors: colors,
    mincolorratio: 0.002,
    colorquantcycles: 3,
    blurradius: 0,
    strokewidth: 0.5,
    linefilter: true,
    roundcoords: 1,
    viewbox: true,
    desc: false,
  });
  return finish(stripWhite(svg), img.width, img.height);
}

function finish(svg: string, width: number, height: number): string {
  // Ensure a proper root with viewBox + intrinsic size so it scales cleanly anywhere.
  return svg.replace(/<svg[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
}
