/**
 * Image adjustments shared by the editor's live preview (browser canvas) and the saved result
 * (server, applied to the full-resolution master) — one implementation, identical output.
 * Pure: safe to import from client components via `@fashion/core/adjust`.
 */

export type Adjust = { warmth: number; contrast: number; saturation: number; brightness: number; highlights: number; shadows: number; tint: number; hue: number };

export type CropSpec = { cx: number; cy: number; w: number; h: number; rot: number };

export const NEUTRAL: Adjust = { warmth: 0, contrast: 1, saturation: 1, brightness: 0, highlights: 0, shadows: 0, tint: 0, hue: 0 };

export const isNeutral = (a: Adjust) => a.warmth === 0 && a.contrast === 1 && a.saturation === 1 && a.brightness === 0 && a.highlights === 0 && a.shadows === 0 && a.tint === 0 && a.hue === 0;

const clampNum = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Validate untrusted adjust params. */
export function parseAdjust(raw: unknown): Adjust {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    warmth: clampNum(r.warmth, -100, 100, 0),
    contrast: clampNum(r.contrast, 0, 3, 1),
    saturation: clampNum(r.saturation, 0, 3, 1),
    brightness: clampNum(r.brightness, -100, 100, 0),
    highlights: clampNum(r.highlights, -100, 100, 0),
    shadows: clampNum(r.shadows, -100, 100, 0),
    tint: clampNum(r.tint, -100, 100, 0),
    hue: clampNum(r.hue, -180, 180, 0),
  };
}

/** Validate untrusted crop params (fractions of the image; rot in degrees). */
export function parseCrop(raw: unknown): CropSpec | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const c = { cx: clampNum(r.cx, 0, 1, NaN), cy: clampNum(r.cy, 0, 1, NaN), w: clampNum(r.w, 0.01, 2, NaN), h: clampNum(r.h, 0.01, 2, NaN), rot: clampNum(r.rot, -180, 180, 0) };
  return Object.values(c).some((v) => Number.isNaN(v)) ? null : c;
}

/** Apply adjustments in place to RGBA (channels = 4) or RGB (channels = 3) pixel data. */
export function applyAdjust(data: Uint8ClampedArray | Uint8Array, a: Adjust, channels = 4) {
  const rad = (a.hue * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  // Hue rotation matrix (luma-preserving).
  const m = [
    0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
    0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.14, 0.072 - cosA * 0.072 - sinA * 0.283,
    0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072,
  ];
  const doHue = a.hue !== 0;
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let i = 0; i < data.length; i += channels) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (doHue) {
      const nr = r * m[0] + g * m[1] + b * m[2];
      const ng = r * m[3] + g * m[4] + b * m[5];
      const nb = r * m[6] + g * m[7] + b * m[8];
      r = nr;
      g = ng;
      b = nb;
    }
    r += a.brightness * 1.1;
    g += a.brightness * 1.1;
    b += a.brightness * 1.1;
    r += a.warmth * 0.35;
    b -= a.warmth * 0.35;
    g -= a.tint * 0.3;
    r += a.tint * 0.12;
    b += a.tint * 0.12;
    const lum = Math.min(255, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b)) / 255;
    if (a.highlights) {
      const w = lum * lum * a.highlights * 0.9;
      r += w;
      g += w;
      b += w;
    }
    if (a.shadows) {
      const w = (1 - lum) * (1 - lum) * a.shadows * 0.9;
      r += w;
      g += w;
      b += w;
    }
    if (a.saturation !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * a.saturation;
      g = l + (g - l) * a.saturation;
      b = l + (b - l) * a.saturation;
    }
    if (a.contrast !== 1) {
      r = (r - 128) * a.contrast + 128;
      g = (g - 128) * a.contrast + 128;
      b = (b - 128) * a.contrast + 128;
    }
    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }
}
