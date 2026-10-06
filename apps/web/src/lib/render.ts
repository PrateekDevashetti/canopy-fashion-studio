"use client";

import type { Adjust, AnnItem, Crop, Selection } from "./store";

const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        cache.delete(url);
        reject(new Error("Couldn't load image"));
      };
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

const toBlob = (c: HTMLCanvasElement, type = "image/png", q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Render failed"))), type, q));

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* ---------------- selection masks ---------------- */

export function strokePath(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
  }
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

/** Rasterize a canvas selection into a white-on-black mask at the image's natural size. */
export async function selectionMask(sel: Selection, w: number, h: number): Promise<Blob> {
  const c = canvas(w, h);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  if (sel.kind === "lasso") {
    strokePath(ctx, sel.points);
    ctx.closePath();
    ctx.fill();
  } else if (sel.kind === "square") {
    const [x0, y0, x1, y1] = sel.rect;
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  } else if (sel.kind === "brush") {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of sel.strokes) {
      ctx.strokeStyle = s.erase ? "#000" : "#fff";
      ctx.lineWidth = s.size;
      strokePath(ctx, s.points);
      ctx.stroke();
    }
  } else if (sel.kind === "segment") {
    const m = await loadImage(sel.segment.maskUrl);
    ctx.drawImage(m, 0, 0, w, h);
  }
  return toBlob(c);
}

export function selectionEmpty(sel: Selection | null): boolean {
  if (!sel) return true;
  if (sel.kind === "lasso") return sel.points.length < 3;
  if (sel.kind === "square") return Math.abs(sel.rect[2] - sel.rect[0]) < 4 || Math.abs(sel.rect[3] - sel.rect[1]) < 4;
  if (sel.kind === "brush") return !sel.strokes.some((s) => !s.erase && s.points.length);
  return false;
}

/* ---------------- annotations ---------------- */

export function drawArrow(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], width: number) {
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const head = Math.max(12, width * 3.2);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0] - Math.cos(ang) * head * 0.6, to[1] - Math.sin(ang) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - head * Math.cos(ang - Math.PI / 7), to[1] - head * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(to[0] - head * Math.cos(ang + Math.PI / 7), to[1] - head * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

export const FONT = (size: number) => `500 ${size}px "DM Sans", ui-sans-serif, system-ui, sans-serif`;

export function drawItems(ctx: CanvasRenderingContext2D, items: AnnItem[]) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const it of items) {
    ctx.strokeStyle = it.color;
    ctx.fillStyle = it.color;
    if (it.kind === "path") {
      ctx.lineWidth = it.width;
      strokePath(ctx, it.points);
      ctx.stroke();
    } else if (it.kind === "rect") {
      ctx.lineWidth = it.width;
      ctx.strokeRect(Math.min(it.from[0], it.to[0]), Math.min(it.from[1], it.to[1]), Math.abs(it.to[0] - it.from[0]), Math.abs(it.to[1] - it.from[1]));
    } else if (it.kind === "ellipse") {
      ctx.lineWidth = it.width;
      ctx.beginPath();
      ctx.ellipse((it.from[0] + it.to[0]) / 2, (it.from[1] + it.to[1]) / 2, Math.abs(it.to[0] - it.from[0]) / 2, Math.abs(it.to[1] - it.from[1]) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (it.kind === "arrow") {
      ctx.lineWidth = it.width;
      drawArrow(ctx, it.from, it.to, it.width);
    } else if (it.kind === "text" && it.text.trim()) {
      ctx.font = FONT(it.size);
      ctx.textBaseline = "top";
      it.text.split("\n").forEach((line, i) => ctx.fillText(line, it.at[0], it.at[1] + i * it.size * 1.2));
    }
  }
}

export async function renderAnnotated(url: string, items: AnnItem[]): Promise<Blob> {
  const img = await loadImage(url);
  const c = canvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  await document.fonts?.ready;
  drawItems(ctx, items);
  return toBlob(c, "image/png");
}

/* ---------------- crop ---------------- */

export async function renderCrop(url: string, crop: Crop): Promise<Blob> {
  const img = await loadImage(url);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const ow = crop.w * W;
  const oh = crop.h * H;
  const c = canvas(ow, oh);
  const ctx = c.getContext("2d")!;
  ctx.translate(ow / 2, oh / 2);
  ctx.rotate((-crop.rot * Math.PI) / 180);
  ctx.drawImage(img, -crop.cx * W, -crop.cy * H);
  return toBlob(c, "image/png");
}

/* ---------------- adjustments ---------------- */

export const isNeutral = (a: Adjust) => a.warmth === 0 && a.contrast === 1 && a.saturation === 1 && a.brightness === 0 && a.highlights === 0 && a.shadows === 0 && a.tint === 0 && a.hue === 0;

export function applyAdjust(data: Uint8ClampedArray, a: Adjust) {
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
  for (let i = 0; i < data.length; i += 4) {
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
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

export async function renderAdjusted(url: string, a: Adjust): Promise<Blob> {
  const img = await loadImage(url);
  const c = canvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  applyAdjust(d.data, a);
  ctx.putImageData(d, 0, 0);
  return toBlob(c, "image/png");
}
