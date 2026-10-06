import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { assets, type AssetRow, type Segment } from "../db/schema";
import { newId } from "../ids";
import { getObjectBuffer, putObject } from "../storage";
import { binarizeMask, boxMask, dims, maskCoverage, toDataUri } from "./imaging";
import { download, falRun, openrouterImage, providerDown, tripIfFatal, visionJson } from "./providers";

const VISION_MODEL = () => process.env.FASHION_VISION_MODEL ?? "google/gemini-3.6-flash";

type Detection = { label: string; box_2d: [number, number, number, number] };

const DETECT_PROMPT = `You are a fashion garment segmentation assistant.
List every garment and accessory a fashion designer might want to edit, then its distinct parts.
Order: each whole garment first (e.g. "Orange jacket", "Blue jeans"), then its parts (e.g. "Left sleeve", "Right sleeve", "Collar", "Left cuff", "Hood", "Front pocket", "Hem", "Zipper").
Left/right are from the garment wearer's perspective. If the same part name repeats, number it ("Left sleeve 1", "Left sleeve 2").
Skip skin, hair, faces and background. Max 12 items.
Return JSON: {"items":[{"label":"Orange jacket","box_2d":[ymin,xmin,ymax,xmax]}]} with integer coordinates normalized to 0-1000.`;

/** Turn a detection box into a precise mask with SAM 3; falls back to a rounded rectangle. */
async function maskFor(imageUri: string, size: { width: number; height: number }, d: Detection, allowGemini: boolean): Promise<Buffer> {
  const [y0, x0, y1, x1] = d.box_2d.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
  const box = { x_min: Math.round(x0 * size.width), y_min: Math.round(y0 * size.height), x_max: Math.round(x1 * size.width), y_max: Math.round(y1 * size.height), object_id: 1 };
  if (providerDown("fal")) {
    if (allowGemini) {
      try {
        const [m] = await openrouterImage(
          `Create a segmentation mask for "${d.label}" in this image: output the same framing and size, pure white (#FFFFFF) exactly where the ${d.label.toLowerCase()} is and pure black (#000000) everywhere else. No gray, no other content.`,
          [imageUri],
          {},
        );
        const mask = await binarizeMask(m, size);
        const cov = await maskCoverage(mask);
        if (cov > 0.001 && cov < 0.95) return mask;
      } catch (e) {
        console.warn(`[detect] Gemini mask failed for ${d.label}:`, (e as Error).message.slice(0, 120));
      }
    }
    return boxMask(size, [x0, y0, x1, y1]);
  }
  try {
    const out = await falRun<{ masks?: { url: string }[] }>(
      "fal-ai/sam-3/image",
      { image_url: imageUri, prompt: d.label.replace(/\s*\d+$/, "").toLowerCase(), box_prompts: [box], apply_mask: false, max_masks: 1, output_format: "png" },
      90_000,
    );
    const url = out.masks?.[0]?.url;
    if (url) {
      const mask = await binarizeMask((await download(url)).buf, size);
      const cov = await maskCoverage(mask);
      if (cov > 0.001 && cov < 0.98) return mask;
    }
  } catch (e) {
    tripIfFatal("fal", e);
    console.warn(`[detect] SAM failed for ${d.label}:`, (e as Error).message);
    if (providerDown("fal")) return maskFor(imageUri, size, d, allowGemini);
  }
  return boxMask(size, [x0, y0, x1, y1]);
}

/**
 * Detect editable garment regions on an image asset. Cached on the asset, so
 * re-opening auto-detect is instant and free.
 */
export async function detectGarments(asset: AssetRow, opts: { refresh?: boolean } = {}): Promise<Segment[]> {
  if (asset.segments?.length && !opts.refresh) return asset.segments;
  const key = asset.media === "video" ? asset.posterKey : asset.storageKey;
  if (!key) return [];
  const buf = await getObjectBuffer(key);
  if (!buf) throw new Error("Image not found in storage");
  const size = await dims(buf);
  const uri = await toDataUri(buf, 1536);
  const res = await visionJson<{ items?: Detection[] }>(VISION_MODEL(), DETECT_PROMPT, [uri]);
  const items = (res.items ?? [])
    .filter((d) => typeof d?.label === "string" && Array.isArray(d.box_2d) && d.box_2d.length === 4 && d.box_2d.every((n) => Number.isFinite(n)))
    .slice(0, 12);
  const segments = await Promise.all(
    items.map(async (d, i) => {
      // Gemini masks (fallback path) are pricier: only for the main garments + first parts.
      const mask = await maskFor(uri, size, d, i < 6);
      const id = newId("ast").replace("ast_", "seg_");
      const maskKey = `p/${asset.projectId}/masks/${id}.png`;
      await putObject(maskKey, mask);
      const [y0, x0, y1, x1] = d.box_2d.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
      return { id, label: d.label.trim().slice(0, 40), box: [x0, y0, x1, y1] as [number, number, number, number], maskKey, area: await maskCoverage(mask) };
    }),
  );
  await db().update(assets).set({ segments }).where(eq(assets.id, asset.id));
  return segments;
}
