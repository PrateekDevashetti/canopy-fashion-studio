import { and, eq, lt, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { assets, runs, type AssetMeta, type RunRow } from "../db/schema";
import { sha256, storeImage } from "../media";
import { getAsset, insertAsset, refundCredits } from "../data";
import { newId } from "../ids";
import { extFor, getObjectBuffer, presignGet, putObject } from "../storage";
import { EDITOR_OPS, toolById } from "../tools/registry";
import { applyMatte, binarizeMask, chromaKey, compositeMasked, cropBox, cropToMask, dims, highlightRegion, maskCoverage, matchGarmentColor, nearestAspect, outsideDrift, padMask, padToAspect, toDataUri, unpad } from "./imaging";
import { detectGarments, locateSubject } from "./detect";
import { traceColor, traceLineArt } from "./vector";
import { download, falRun, falSubmit, falWait, openrouterImage, openrouterVideoSubmit, openrouterVideoWait, ProviderError, providerDown, tripIfFatal, type OrVideoInput, type QueueRef } from "./providers";
import { ANGLES, P, SHOOT_SHOTS } from "./prompts";
import sharp from "sharp";

type Settings = { resolution?: string; aspect?: string };
type Output = { buf: Buffer; mime: string; name: string; posterKey?: string | null; parentId?: string | null; meta?: AssetMeta };
type Ctx = { run: RunRow; settings: Settings; emit: (o: Output) => Promise<void> };

const NB2 = "fal-ai/nano-banana-2";
const NB2_EDIT = "fal-ai/nano-banana-2/edit";
const NB_FALLBACK_EDIT = "fal-ai/nano-banana/edit";
const NB_FALLBACK = "fal-ai/nano-banana";

/* ---------------- input resolution ---------------- */

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : typeof v === "string" && v ? [v] : []);

async function loadImage(projectId: string, assetId: string): Promise<{ buf: Buffer; id: string; name: string; key: string }> {
  const a = await getAsset(assetId);
  if (!a || a.projectId !== projectId) throw new ProviderError("An input image is missing — it may have been deleted.", 400);
  // Videos contribute their poster frame.
  // Videos contribute their poster; vector masters their raster preview.
  const key = a.media === "video" ? a.posterKey : a.mime === "image/svg+xml" ? (a.previewKey ?? a.storageKey) : a.storageKey;
  if (!key) throw new ProviderError("Video inputs need a poster frame.", 400);
  const buf = await getObjectBuffer(key);
  if (!buf) throw new ProviderError("Couldn't read an input image from storage.", 500, true);
  return { buf, id: a.id, name: a.name, key };
}

async function loadMask(projectId: string, key: unknown): Promise<Buffer | null> {
  if (typeof key !== "string" || !key) return null;
  if (!key.startsWith(`p/${projectId}/masks/`)) throw new ProviderError("Invalid mask.", 400);
  return getObjectBuffer(key);
}

/* ---------------- model calls ---------------- */

type FalImages = { images?: { url: string }[]; image?: { url: string } };

function aspectFor(settings: Settings, allowAuto: boolean) {
  const a = (settings.aspect ?? "Auto").toLowerCase();
  if (a === "auto") return allowAuto ? "auto" : "4:5";
  return a;
}


const isPolicy = (e: unknown) => e instanceof ProviderError && (e.status === 422 || /content.?polic|flagged|safety/i.test(e.message));

async function falImages(endpoint: string, input: Record<string, unknown>): Promise<Buffer[]> {
  const out = await falRun<FalImages>(endpoint, input);
  const urls = out.images?.map((i) => i.url) ?? (out.image ? [out.image.url] : []);
  if (!urls.length) throw new ProviderError("The model returned no image. Try rephrasing or a different input.", 502);
  return Promise.all(urls.map(async (u) => (await download(u)).buf));
}

/**
 * Model tiers (chosen per tool — see docs/PRD.md §5):
 * - pro:      Nano Banana Pro (Gemini 3 Pro Image) — identity, structure and material fidelity.
 * - fast:     Nano Banana 2 (Gemini 3.1 Flash Image) — quick, faithful local edits.
 * - seedream: Seedream 4.5 — strongest multi-reference blending for new design concepts.
 * Every tier falls through fal → OpenRouter → the next tier down, skipping out-of-balance providers.
 */
export type Tier = "pro" | "fast" | "seedream";

type Step = { provider: "fal" | "openrouter"; run: (ctx: { prompt: string; uris: string[]; n: number; aspect: string; resolution: string }) => Promise<Buffer[]> };

const falNB = (t2i: string, edit: string, withRes = true): Step => ({
  provider: "fal",
  run: ({ prompt, uris, n, aspect, resolution }) => falImages(uris.length ? edit : t2i, { prompt, num_images: n, output_format: "png", aspect_ratio: aspect, ...(uris.length ? { image_urls: uris } : {}), ...(withRes ? { resolution } : {}) }),
});
const orNB = (model: string): Step => ({
  provider: "openrouter",
  run: async ({ prompt, uris, n, aspect, resolution }) =>
    (await Promise.all(Array.from({ length: n }, () => openrouterImage(prompt, uris, { model, aspect: aspect === "auto" ? undefined : aspect, size: resolution })))).map((x) => x[0]),
});
const SEEDREAM_SIZE: Record<string, string> = { "1:1": "square_hd", "4:5": "portrait_4_3", "3:4": "portrait_4_3", "2:3": "portrait_16_9", "9:16": "portrait_16_9", "16:9": "landscape_16_9", "4:3": "landscape_4_3", "3:2": "landscape_4_3", "5:4": "landscape_4_3" };
const seedream: Step = {
  provider: "fal",
  run: ({ prompt, uris, n, aspect }) => falImages("fal-ai/bytedance/seedream/v4.5/edit", { prompt, image_urls: uris, num_images: n, image_size: SEEDREAM_SIZE[aspect] ?? "auto_2K", enable_safety_checker: true }),
};

const PRO: Step[] = [falNB("fal-ai/nano-banana-pro", "fal-ai/nano-banana-pro/edit"), orNB("google/gemini-3-pro-image")];
const FAST: Step[] = [falNB(NB2, NB2_EDIT), orNB("google/gemini-3.1-flash-image"), falNB(NB_FALLBACK, NB_FALLBACK_EDIT, false)];
const CHAINS: Record<Tier, Step[]> = { pro: [...PRO, ...FAST], fast: FAST, seedream: [seedream, orNB("bytedance-seed/seedream-5-0-pro"), ...PRO, ...FAST] };

export async function generateImages(prompt: string, images: Buffer[], settings: Settings, n = 1, tier: Tier = "fast"): Promise<Buffer[]> {
  const uris = await Promise.all(images.map((b) => toDataUri(b)));
  const resolution = ["1K", "2K", "4K"].includes(settings.resolution ?? "") ? settings.resolution! : "1K";
  const aspect = aspectFor(settings, uris.length > 0);
  // Seedream needs at least one reference; without one, start from the Pro chain.
  const chain = tier === "seedream" && !uris.length ? CHAINS.pro : CHAINS[tier];
  let last: unknown = null;
  for (const step of chain) {
    if (providerDown(step.provider)) continue;
    try {
      return await step.run({ prompt, uris, n, aspect, resolution });
    } catch (e) {
      last = e;
      if (isPolicy(e)) throw e; // content/validation — another provider won't help
      tripIfFatal(step.provider, e);
      console.warn(`[engine] ${step.provider} step failed, trying next:`, (e as Error).message.slice(0, 160));
    }
  }
  throw last ?? new ProviderError("No image provider is available right now.", 503);
}

const one = async (prompt: string, images: Buffer[], settings: Settings, tier: Tier = "fast") => (await generateImages(prompt, images, settings, 1, tier))[0];

/** FASHN v1.6 — a dedicated virtual try-on model: keeps prints, logos and fit; falls back to Nano Banana Pro. */
async function tryOn(model: Buffer, garment: Buffer, settings: Settings, fallbackPrompt: string): Promise<Buffer> {
  if (!providerDown("fal")) {
    try {
      const out = await falImages("fal-ai/fashn/tryon/v1.6", {
        model_image: await toDataUri(model),
        garment_image: await toDataUri(garment),
        category: "auto",
        mode: "quality",
        garment_photo_type: "auto",
        moderation_level: "permissive",
        num_samples: 1,
        output_format: "png",
      });
      return out[0];
    } catch (e) {
      if (isPolicy(e)) throw e;
      tripIfFatal("fal", e);
      console.warn("[engine] FASHN failed, using Nano Banana Pro:", (e as Error).message.slice(0, 120));
    }
  }
  return one(fallbackPrompt, [model, garment], settings, "pro");
}

export async function removeBackground(buf: Buffer): Promise<Buffer> {
  if (!providerDown("fal")) {
    try {
      const out = await falRun<{ image: { url: string } }>("fal-ai/birefnet/v2", { image_url: await toDataUri(buf, 2048, true), output_format: "png", refine_foreground: true });
      return (await download(out.image.url)).buf;
    } catch (e) {
      tripIfFatal("fal", e);
      console.warn("[engine] birefnet failed, using Gemini chroma-key fallback:", (e as Error).message.slice(0, 120));
    }
  }
  const { width, height } = await dims(buf);
  // Fallback 1: a black/white matte from Gemini applied to the ORIGINAL pixels (subject untouched).
  try {
    const { buf: padded, pad } = await padToAspect(buf);
    const [m] = await openrouterImage(
      "Create a precise alpha matte of the main subject (the person and everything they wear and hold, or the product): output the exact same framing and size, pure white (#FFFFFF) where the subject is and pure black (#000000) for the background. Follow hair and fabric edges closely. No gray backgrounds, no shadows, no other content.",
      [await toDataUri(padded)],
      { aspect: pad.aspect },
    );
    const matte = await unpad(m, pad);
    const cov = await maskCoverage(await binarizeMask(matte, { width, height }));
    if (cov > 0.02 && cov < 0.97) return applyMatte(buf, matte);
    console.warn(`[engine] matte coverage ${cov.toFixed(3)} looks wrong, trying chroma key`);
  } catch (e) {
    console.warn("[engine] matte fallback failed:", (e as Error).message.slice(0, 120));
  }
  // Fallback 2: have Gemini isolate the subject on pure chroma green (same framing), then key it out.
  const [green] = await openrouterImage(
    "Keep the main subject exactly as it is (same position, scale, framing, shape, colors and details) and replace the entire background with a perfectly flat pure chroma-key green (#00FF00). Do not crop, zoom or move the subject. No shadows on the background, no green spill on the subject.",
    [await toDataUri(buf)],
    { aspect: nearestAspect(width / height)[0] },
  );
  return chromaKey(green, buf);
}

/** Resume a job a previous worker already submitted rather than paying twice. */
async function resumable(run: RunRow, endpoint: string, submit: () => Promise<QueueRef>): Promise<QueueRef> {
  const prev = run.providerRef?.queue as QueueRef | undefined;
  if (prev && prev.endpoint === endpoint) return prev;
  const ref = await submit();
  await db().update(runs).set({ providerRef: { ...run.providerRef, queue: ref } }).where(eq(runs.id, run.id));
  run.providerRef = { ...run.providerRef, queue: ref };
  return ref;
}

async function falVideo(run: RunRow, endpoint: string, input: Record<string, unknown>): Promise<Buffer> {
  if (providerDown("fal")) throw new ProviderError("fal is unavailable", 503);
  try {
    const ref = await resumable(run, endpoint, () => falSubmit(endpoint, input));
    const out = await falWait<{ video?: { url: string } }>(ref);
    if (!out.video?.url) throw new ProviderError("The video model returned no video.", 502);
    return (await download(out.video.url)).buf;
  } catch (e) {
    tripIfFatal("fal", e);
    throw e;
  }
}

async function orVideo(run: RunRow, model: string, v: OrVideoInput): Promise<Buffer> {
  if (providerDown("openrouter")) throw new ProviderError("OpenRouter is unavailable", 503);
  try {
    const ref = await resumable(run, `openrouter:${model}`, () => openrouterVideoSubmit(model, v));
    return await openrouterVideoWait(ref);
  } catch (e) {
    tripIfFatal("openrouter", e);
    throw e;
  }
}

/* ---------------- consistency ---------------- */

/** Mean luminance drift outside the edit region above which we assume the model reframed or relit. */
const DRIFT_OK = 0.08;

/**
 * In-place edits (recolor, fabric swap, region edit, described garment swap):
 * pad to a supported aspect (no stretching) → generate → un-pad → check the model kept the frame
 * (retry once if it drifted) → composite, so every pixel outside the mask is the original.
 */
async function inPlaceEdit(o: { prompt: string; base: Buffer; mask: Buffer | null; extra?: Buffer[]; settings: Settings; tier: Tier; dilate?: number }): Promise<{ buf: Buffer; meta: AssetMeta }> {
  const { buf: padded, pad } = await padToAspect(o.base);
  const pmask = o.mask ? await padMask(o.mask, pad) : null;
  const refs = [padded, ...(pmask ? [await highlightRegion(padded, pmask)] : []), ...(o.extra ?? [])];
  let best: { out: Buffer; drift: number } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await unpad(await one(o.prompt, refs, { ...o.settings, aspect: pad.aspect }, o.tier), pad);
    const drift = await outsideDrift(o.base, out, o.mask);
    if (!best || drift < best.drift) best = { out, drift };
    // Without a mask the "outside" includes the intended change, so drift isn't meaningful.
    if (!o.mask || drift <= DRIFT_OK) break;
    console.warn(`[engine] edit drifted outside its region (${drift.toFixed(3)}) — retrying once`);
  }
  const buf = o.mask ? await compositeMasked(o.base, best!.out, o.mask, { dilate: o.dilate ?? 2 }) : best!.out;
  return { buf, meta: o.mask ? { fidelity: Math.round((1 - best!.drift) * 1000) / 1000 } : {} };
}

/** The main garment's mask (largest detected garment), so whole-garment edits can be composited too. */
async function autoGarmentMask(assetId: string): Promise<{ mask: Buffer; label: string } | null> {
  try {
    const a = await getAsset(assetId);
    if (!a || a.media !== "image") return null;
    const segs = await detectGarments(a);
    const main = [...segs].sort((x, y) => y.area - x.area).find((g) => g.area > 0.02 && g.area < 0.9);
    const mask = main ? await getObjectBuffer(main.maskKey) : null;
    return mask && main ? { mask, label: main.label } : null;
  } catch (e) {
    console.warn("[engine] auto garment mask unavailable:", (e as Error).message.slice(0, 120));
    return null;
  }
}

/** Close-up face and outfit crops: extra references that keep identity and garment detail consistent in new shots. */
async function identityRefs(buf: Buffer): Promise<{ bufs: Buffer[]; flags: { face: boolean; outfit: boolean } }> {
  const loc = await locateSubject(buf);
  const face = loc.face ? await cropBox(buf, loc.face, 0.35, 768).catch(() => null) : null;
  const o = loc.outfit;
  // An outfit box covering most of the frame adds nothing over the main image.
  const outfit = o && (o[2] - o[0]) * (o[3] - o[1]) < 0.6 ? await cropBox(buf, o, 0.05, 1024).catch(() => null) : null;
  return { bufs: [face, outfit].filter((b): b is Buffer => !!b), flags: { face: !!face, outfit: !!outfit } };
}

/**
 * Make a print tile repeat seamlessly: shift it by half (so the tile's own edges meet in the
 * middle), repaint only that cross-shaped seam band, and keep the shifted tile — its outer edges
 * are former interior pixels, so it tiles perfectly by construction.
 */
async function makeSeamless(tile: Buffer, settings: Settings): Promise<{ buf: Buffer; tileScore: number }> {
  const { width: W, height: H } = await dims(tile);
  const hw = Math.floor(W / 2);
  const hh = Math.floor(H / 2);
  const q = (left: number, top: number, w: number, h: number) => sharp(tile).extract({ left, top, width: w, height: h }).toBuffer();
  const [tl, tr, bl, br] = await Promise.all([q(0, 0, hw, hh), q(hw, 0, W - hw, hh), q(0, hh, hw, H - hh), q(hw, hh, W - hw, H - hh)]);
  const shifted = await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } })
    .composite([
      { input: br, left: 0, top: 0 },
      { input: bl, left: W - hw, top: 0 },
      { input: tr, left: 0, top: H - hh },
      { input: tl, left: W - hw, top: H - hh },
    ])
    .png()
    .toBuffer();
  const band = Math.round(Math.min(W, H) * 0.06);
  const cx = W - hw;
  const cy = H - hh;
  const mask = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="black"/><rect x="${cx - band}" y="0" width="${band * 2}" height="${H}" fill="white"/><rect x="0" y="${cy - band}" width="${W}" height="${band * 2}" fill="white"/></svg>`),
  )
    .png()
    .toBuffer();
  const fixed = (await inPlaceEdit({ prompt: P.printSeam(), base: shifted, mask, settings: { ...settings, aspect: "1:1" }, tier: "pro", dilate: 2 })).buf;
  // Tile score: how well opposite edges match (1 = perfect).
  const px = await sharp(fixed).removeAlpha().toColourspace("srgb").raw().toBuffer();
  let diff = 0;
  for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) diff += Math.abs(px[(y * W) * 3 + c] - px[(y * W + W - 1) * 3 + c]);
  for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) diff += Math.abs(px[x * 3 + c] - px[((H - 1) * W + x) * 3 + c]);
  const tileScore = Math.round((1 - diff / ((W + H) * 3 * 255)) * 1000) / 1000;
  return { buf: fixed, tileScore };
}

/* ---------------- tools ---------------- */

const png = (buf: Buffer, name: string, parentId?: string, meta?: AssetMeta): Output => ({ buf, mime: "image/png", name, parentId, meta });

async function execute(ctx: Ctx) {
  const { run, settings, emit } = ctx;
  const i = run.inputs;
  const pid = run.projectId;
  const imgs = (key: string) => Promise.all(asList(i[key]).map((id) => loadImage(pid, id)));
  const text = (key: string) => (typeof i[key] === "string" ? (i[key] as string) : "");

  switch (run.tool) {
    case "prompt": {
      const refs = await imgs("references");
      const out = await one(P.prompt(text("prompt"), refs.length > 0), refs.map((r) => r.buf), settings, "pro");
      return emit(png(out, "Prompt"));
    }
    case "sketch-to-render": {
      const sketches = await imgs("sketch");
      await Promise.all(sketches.map(async (s) => emit(png(await one(P.sketchToRender(text("direction")), [s.buf], settings, "pro"), "Sketch to render", s.id))));
      return;
    }
    case "garment-extractor": {
      const [outfit] = await imgs("outfit");
      const mask = await loadMask(pid, i.mask);
      const label = text("maskLabel");
      const refs = mask ? [outfit.buf, await highlightRegion(outfit.buf, mask), await cropToMask(outfit.buf, mask)] : [outfit.buf];
      return emit(png(await one(P.extract(label), refs, settings, "pro"), label ? `${label} extracted` : "Garment extracted", outfit.id));
    }
    case "concept": {
      const refs = await imgs("references");
      await Promise.all([0, 1, 2, 3].map(async (v) => emit(png(await one(P.concept(text("direction"), v), refs.map((r) => r.buf), settings, "seedream"), "Concept"))));
      return;
    }
    case "ghostform":
    case "flatlay": {
      const garments = await imgs("garment");
      const prompt = run.tool === "ghostform" ? P.ghostform() : P.flatlay();
      await Promise.all(garments.map(async (g) => emit(png(await one(prompt, [g.buf], settings, "pro"), run.tool === "ghostform" ? "Ghostform" : "Flatlay", g.id))));
      return;
    }
    case "garment-recolor": {
      const [g] = await imgs("garment");
      const colors = (Array.isArray(i.colors) ? i.colors : []) as { hex: string; name?: string }[];
      // No selection → find the main garment, so the rest of the image is guaranteed untouched.
      const drawn = await loadMask(pid, i.mask);
      const auto = drawn ? null : await autoGarmentMask(g.id);
      const mask = drawn ?? auto?.mask ?? null;
      const label = text("maskLabel") || auto?.label || "";
      await Promise.all(
        colors.map(async (c) => {
          const r = await inPlaceEdit({ prompt: P.recolor(c, !!mask, label), base: g.buf, mask, settings, tier: "fast", dilate: 2 });
          // Models under-shoot dye changes; pull the fabric onto the exact requested color.
          const fixed = mask ? await matchGarmentColor(r.buf, mask, c.hex) : null;
          await emit(png(fixed?.buf ?? r.buf, `Recolor ${c.name ?? c.hex}`, g.id, { ...r.meta, ...(fixed ? { colorDelta: Math.round(fixed.deltaAfter * 10) / 10 } : {}) }));
        }),
      );
      return;
    }
    case "fabric-swap": {
      const [g] = await imgs("garment");
      const fabrics = await imgs("fabric");
      const drawn = await loadMask(pid, i.mask);
      const auto = drawn ? null : await autoGarmentMask(g.id);
      const mask = drawn ?? auto?.mask ?? null;
      const label = text("maskLabel") || auto?.label || "";
      await Promise.all(
        fabrics.map(async (f) => {
          // Image order for the prompt: 1 = garment, 2 = highlight (when masked), then the swatch.
          const r = await inPlaceEdit({ prompt: P.fabric(!!mask, label), base: g.buf, mask, extra: [f.buf], settings, tier: "pro", dilate: 3 });
          await emit(png(r.buf, "Fabric swap", g.id, r.meta));
        }),
      );
      return;
    }
    case "model-maker": {
      const [ref] = await imgs("reference");
      const head = await one(P.modelHeadshot(text("description"), !!ref), ref ? [ref.buf] : [], { ...settings, aspect: "4:5" }, "pro");
      await emit(png(head, "Headshot"));
      await Promise.all([
        (async () => emit(png(await one(P.modelHeadshotSheet(), [head], { ...settings, aspect: "16:9" }, "pro"), "Headshot sheet")))(),
        (async () => emit(png(await one(P.modelBodySheet(), [head], { ...settings, aspect: "16:9" }, "pro"), "Body sheet")))(),
      ]);
      return;
    }
    case "model-try-on": {
      const garments = await imgs("garment");
      const [model] = await imgs("model");
      await Promise.all(garments.map(async (g) => emit(png(await tryOn(model.buf, g.buf, settings, P.tryOn()), "Try-on", model.id))));
      return;
    }
    case "garment-swap": {
      const [base] = await imgs("base");
      const [garment] = await imgs("garment");
      const mask = await loadMask(pid, i.mask);
      const label = text("maskLabel");
      // With a garment image, FASHN swaps it in directly; a written description goes through Nano Banana Pro.
      if (garment) return emit(png(await tryOn(base.buf, garment.buf, settings, P.garmentSwap(label)), "Garment swap", base.id));
      const r = await inPlaceEdit({ prompt: P.garmentSwap(label, text("description")), base: base.buf, mask, settings, tier: "pro", dilate: 10 });
      return emit(png(r.buf, "Garment swap", base.id, r.meta));
    }
    case "photo-shoot": {
      const [look] = await imgs("look");
      const id = await identityRefs(look.buf);
      await Promise.all(SHOOT_SHOTS.map(async (shot) => emit(png(await one(P.photoShoot(text("location"), shot, id.flags), [look.buf, ...id.bufs], settings, "pro"), "Photo shoot", look.id))));
      return;
    }
    case "multi-angle": {
      const [shot] = await imgs("shot");
      const id = await identityRefs(shot.buf);
      await Promise.all(ANGLES.map(async (a) => emit(png(await one(P.angle(a.prompt, id.flags), [shot.buf, ...id.bufs], settings, "pro"), a.name, shot.id))));
      return;
    }
    case "garment-360":
    case "model-360": {
      const garment = run.tool === "garment-360";
      const [frontImg] = await imgs(garment ? "garment" : "look");
      const [backImg] = garment ? await imgs("back") : [];
      const { width: fw, height: fh } = await dims(frontImg.buf);
      const portrait = fh >= fw;
      const res = settings.resolution === "720p" ? "720p" : "1080p";
      const aspect = ["16:9", "9:16"].includes(settings.aspect ?? "") ? settings.aspect! : portrait ? "9:16" : "16:9";
      const prompt = garment ? P.garment360(Boolean(backImg)) : P.model360();
      // fal takes data URIs; OpenRouter needs fetchable URLs, so hand it short-lived presigned storage links.
      const frontUri = await toDataUri(frontImg.buf);
      const backUri = backImg ? await toDataUri(backImg.buf) : null;
      const frontUrl = presignGet(frontImg.key, 3 * 3600) ?? frontUri;
      const backUrl = backImg ? (presignGet(backImg.key, 3 * 3600) ?? backUri) : null;
      const falVeo = (endpoint: string) => () => falVideo(run, endpoint, { prompt, image_url: frontUri, aspect_ratio: aspect, resolution: res, duration: "8s", generate_audio: false });
      const falKling = () => falVideo(run, "fal-ai/kling-video/v3/pro/image-to-video", { prompt, start_image_url: frontUri, ...(backUri ? { end_image_url: backUri } : {}), duration: "10", generate_audio: false });
      const or = (model: string, o: { duration: number; resolution: string; aspect?: string; last?: boolean }) => () =>
        orVideo(run, model, { prompt, firstFrameUrl: frontUrl, lastFrameUrl: o.last ? backUrl : null, duration: o.duration, resolution: o.resolution, aspect: o.aspect ?? aspect });
      const tries: (() => Promise<Buffer>)[] = backImg
        ? [falKling, or("kwaivgi/kling-v3.0-pro", { duration: 10, resolution: "720p", last: true }), or("google/veo-3.1", { duration: 8, resolution: res, last: true }), or("bytedance/seedance-2.5", { duration: 10, resolution: "720p", last: true })]
        : garment
          ? [falVeo("fal-ai/veo3.1/image-to-video"), or("google/veo-3.1-fast", { duration: 8, resolution: res }), or("kwaivgi/kling-v3.0-pro", { duration: 10, resolution: "720p" }), or("bytedance/seedance-2.5", { duration: 10, resolution: "720p" })]
          : [falVeo("fal-ai/veo3.1/fast/image-to-video"), or("google/veo-3.1-fast", { duration: 8, resolution: res }), or("kwaivgi/kling-v3.0-pro", { duration: 10, resolution: "720p" }), or("bytedance/seedance-2.5", { duration: 10, resolution: "720p" })];
      let buf: Buffer | null = null;
      let lastErr: unknown = null;
      for (const t of tries) {
        try {
          buf = await t();
          break;
        } catch (e) {
          lastErr = e;
          if (isPolicy(e)) break;
          console.warn(`[engine] video step failed, trying next:`, (e as Error).message.slice(0, 160));
          // Forget the failed job so the next step submits fresh.
          await db().update(runs).set({ providerRef: {} }).where(eq(runs.id, run.id));
          run.providerRef = {};
        }
      }
      if (!buf) throw lastErr ?? new ProviderError("Video generation failed", 502);
      return emit({ buf, mime: "video/mp4", name: garment ? "360 garment video" : "360 model video", posterKey: frontImg.key, parentId: frontImg.id });
    }
    case "sketch-to-vector":
    case "garment-to-vector": {
      const sketchTool = run.tool === "sketch-to-vector";
      const items = await imgs(sketchTool ? "sketch" : "garment");
      const style = (text("style") || (sketchTool ? "line" : "flat")) as "line" | "flat";
      const prompt = sketchTool ? (style === "flat" ? P.vectorFlat() : P.vectorLine()) : P.garmentFlat(style);
      await Promise.all(
        items.map(async (it) => {
          // The model draws a clean, faithful drawing; tracing turns exactly those pixels into SVG paths.
          const clean = await one(prompt, [it.buf], { ...settings, resolution: "2K", aspect: "Auto" }, "pro");
          const svg = style === "flat" ? await traceColor(clean) : await traceLineArt(clean);
          await emit({ buf: Buffer.from(svg, "utf8"), mime: "image/svg+xml", name: sketchTool ? "Vector" : "Vector flat", parentId: it.id });
        }),
      );
      return;
    }
    case "moodboard-maker": {
      const refs = await imgs("references");
      await Promise.all([0, 1].map(async (v) => emit(png(await one(P.moodboard(text("direction"), v), refs.map((r) => r.buf), settings, "seedream"), "Moodboard"))));
      return;
    }
    case "print-pattern": {
      const [ref] = await imgs("reference");
      await Promise.all(
        [0, 1].map(async (v) => {
          const tile = await one(P.printTile(text("object"), text("theme"), v, !!ref), ref ? [ref.buf] : [], { ...settings, aspect: "1:1" }, "pro");
          const seamless = await makeSeamless(tile, settings);
          await emit(png(seamless.buf, "Print pattern"));
        }),
      );
      return;
    }
    case "trim-patches": {
      const [g] = await imgs("garment");
      const [ref] = await imgs("reference");
      const mask = await loadMask(pid, i.mask);
      const r = await inPlaceEdit({ prompt: P.trim(text("trim"), !!mask, !!ref), base: g.buf, mask, extra: ref ? [ref.buf] : [], settings, tier: "pro", dilate: 6 });
      return emit(png(r.buf, "Trim added", g.id, r.meta));
    }
    case "pdp-shots": {
      const garments = await imgs("garment");
      const [model] = await imgs("model");
      const bg = (["white", "grey", "warm"].includes(text("background")) ? text("background") : "white") as "white" | "grey" | "warm";
      const id = model ? await identityRefs(model.buf) : null;
      await Promise.all(
        garments.flatMap((g) =>
          [0, 1, 2, 3].map(async (shot) => {
            const onModel = shot === 3;
            const refs = onModel && model ? [g.buf, model.buf, ...(id?.bufs ?? [])] : [g.buf];
            const out = await one(P.pdp(shot, bg, onModel && !!model), refs, settings, "pro");
            await emit(png(out, ["Front packshot", "Three-quarter", "Detail", "On-model"][shot], g.id));
          }),
        ),
      );
      return;
    }
    case "region-edit": {
      const [img] = await imgs("image");
      const mask = await loadMask(pid, i.mask);
      if (!mask) throw new ProviderError("Select a region first.", 400);
      const r = await inPlaceEdit({ prompt: P.regionEdit(text("prompt")), base: img.buf, mask, settings, tier: "pro", dilate: 2 });
      return emit(png(r.buf, "Region edited", img.id, r.meta));
    }
    case "remove-background": {
      const [img] = await imgs("image");
      return emit(png(await removeBackground(img.buf), "Background removed", img.id));
    }
    default:
      throw new ProviderError(`Unknown tool: ${run.tool}`, 400);
  }
}

/* ---------------- lifecycle ---------------- */

async function store(run: RunRow, o: Output) {
  const id = newId("ast");
  const base = { id, projectId: run.projectId, userId: run.userId, runId: run.id, parentId: o.parentId ?? null, kind: "result" as const, name: o.name };
  if (o.mime.startsWith("image/")) {
    // The master is kept exactly as the model/compositor produced it; the feed shows a preview.
    const stored = await storeImage(run.projectId, id, o.buf);
    await insertAsset({ ...base, media: "image", ...stored, meta: { ...stored.meta, ...o.meta } });
    return;
  }
  // Video: own poster frame (so deleting the source image never breaks it).
  let width = 0;
  let height = 0;
  let posterKey: string | null = null;
  const source = o.posterKey ? await getObjectBuffer(o.posterKey) : null;
  if (source) {
    ({ width, height } = await dims(source));
    posterKey = `p/${run.projectId}/previews/${id}.webp`;
    await putObject(posterKey, await sharp(source).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer());
  }
  const storageKey = `p/${run.projectId}/${id}.${extFor(o.mime)}`;
  await putObject(storageKey, o.buf);
  await insertAsset({ ...base, media: "video", storageKey, posterKey, mime: o.mime, width, height, bytes: o.buf.length, meta: { sha256: sha256(o.buf), ...o.meta } });
}

/** Atomically move a queued run to running. Returns null if someone else took it. */
export async function claimRun(id: string): Promise<RunRow | null> {
  const [row] = await db()
    .update(runs)
    .set({ status: "running", startedAt: new Date(), attempts: sql`${runs.attempts} + 1` })
    .where(and(eq(runs.id, id), eq(runs.status, "queued")))
    .returning();
  return row ?? null;
}

/** Claim the oldest queued run (worker loop). */
export async function claimNext(): Promise<RunRow | null> {
  const rows = await db().execute<{ id: string }>(
    sql`UPDATE runs SET status = 'running', started_at = now(), attempts = attempts + 1
        WHERE id = (SELECT id FROM runs WHERE status = 'queued' AND deleted_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id`,
  );
  const id = (rows as unknown as { id: string }[])[0]?.id;
  return id ? ((await db().query.runs.findFirst({ where: eq(runs.id, id) })) ?? null) : null;
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/safety|content.?policy|nsfw|blocked/i.test(msg)) return "The model declined this request. Try a different image or wording.";
  if (/timed out/i.test(msg)) return "The model took too long. Your credits were refunded — try again.";
  if (/FAL_KEY|OPENROUTER_API_KEY/.test(msg)) return "Generation is not configured on this server.";
  if (/locked|exhausted balance|top.?up/i.test(msg)) return "This model provider is temporarily unavailable. Your credits were refunded — please try again later.";
  return msg.replace(/^fal-ai\/[\w./-]+:\s*/, "").slice(0, 300) || "Generation failed";
}

/** Execute a claimed run end to end. Never throws. */
export async function executeRun(run: RunRow): Promise<void> {
  const tool = toolById(run.tool);
  const perOutput = run.expected > 0 ? run.cost / run.expected : run.cost;
  let produced = 0;
  const ctx: Ctx = {
    run,
    settings: run.settings ?? {},
    emit: async (o) => {
      await store(run, o);
      produced++;
    },
  };
  try {
    if (!tool && !(run.tool in EDITOR_OPS)) throw new ProviderError(`Unknown tool: ${run.tool}`, 400);
    await execute(ctx);
    await db().update(runs).set({ status: "succeeded", finishedAt: new Date(), error: null }).where(eq(runs.id, run.id));
  } catch (e) {
    const message = friendly(e);
    console.error(`[run ${run.id}] ${run.tool} failed:`, e instanceof Error ? e.message : e);
    await db()
      .update(runs)
      .set({ status: produced > 0 ? "succeeded" : "failed", finishedAt: new Date(), error: message })
      .where(eq(runs.id, run.id));
  }
  // Refund whatever didn't get made (all of it on failure, the remainder on partial success).
  const missing = Math.max(0, run.expected - produced);
  if (missing > 0) await refundCredits(run.userId, Math.round(perOutput * missing), produced ? "partial refund" : "refund", run.id);
}

export async function processRun(id: string) {
  const run = await claimRun(id);
  if (run) await executeRun(run);
}

/**
 * Recover runs stuck in "running" (a crashed worker or a killed serverless function).
 * Retries once; after that fails them with a refund.
 */
export async function recoverStale(maxAgeMs = 20 * 60_000) {
  const d = db();
  const stale = await d.select().from(runs).where(and(eq(runs.status, "running"), lt(runs.startedAt, new Date(Date.now() - maxAgeMs))));
  for (const r of stale) {
    if (r.attempts < 2) {
      await d.update(runs).set({ status: "queued" }).where(and(eq(runs.id, r.id), eq(runs.status, "running")));
      continue;
    }
    const done = await d.select({ id: assets.id }).from(assets).where(and(eq(assets.runId, r.id), inArray(assets.kind, ["result"])));
    const updated = await d
      .update(runs)
      .set({ status: done.length ? "succeeded" : "failed", finishedAt: new Date(), error: "Generation was interrupted. Unused credits were refunded." })
      .where(and(eq(runs.id, r.id), eq(runs.status, "running")))
      .returning();
    if (updated.length) {
      const missing = Math.max(0, r.expected - done.length);
      if (missing) await refundCredits(r.userId, Math.round((r.cost / Math.max(1, r.expected)) * missing), "refund (interrupted)", r.id);
    }
  }
  return stale.length;
}
