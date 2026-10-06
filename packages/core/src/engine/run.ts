import { and, eq, lt, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { assets, runs, type RunRow } from "../db/schema";
import { getAsset, insertAsset, refundCredits } from "../data";
import { newId } from "../ids";
import { extFor, getObjectBuffer, putObject } from "../storage";
import { EDITOR_OPS, toolById } from "../tools/registry";
import { compositeMasked, cropToMask, dims, highlightRegion, toDataUri } from "./imaging";
import { download, falRun, falSubmit, falWait, ProviderError, type QueueRef } from "./providers";
import { ANGLES, P, SHOOT_SHOTS } from "./prompts";
import sharp from "sharp";

type Settings = { resolution?: string; aspect?: string };
type Output = { buf: Buffer; mime: string; name: string; posterKey?: string | null; parentId?: string | null };
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
  const key = a.media === "video" ? a.posterKey : a.storageKey;
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

/** Nano Banana 2 image generation/edit with a v1 fallback. */
export async function generateImages(prompt: string, images: Buffer[], settings: Settings, n = 1): Promise<Buffer[]> {
  const uris = await Promise.all(images.map((b) => toDataUri(b)));
  const resolution = ["1K", "2K", "4K"].includes(settings.resolution ?? "") ? settings.resolution : "1K";
  const base = { prompt, num_images: n, output_format: "png", aspect_ratio: aspectFor(settings, uris.length > 0) };
  let out: FalImages;
  try {
    out = uris.length ? await falRun<FalImages>(NB2_EDIT, { ...base, image_urls: uris, resolution }) : await falRun<FalImages>(NB2, { ...base, resolution });
  } catch (e) {
    if (e instanceof ProviderError && e.status === 422) throw e; // content/validation — don't mask it
    out = uris.length ? await falRun<FalImages>(NB_FALLBACK_EDIT, { ...base, image_urls: uris }) : await falRun<FalImages>(NB_FALLBACK, base);
  }
  const urls = out.images?.map((i) => i.url) ?? (out.image ? [out.image.url] : []);
  if (!urls.length) throw new ProviderError("The model returned no image. Try rephrasing or a different input.", 502);
  return Promise.all(urls.map(async (u) => (await download(u)).buf));
}

const one = async (prompt: string, images: Buffer[], settings: Settings) => (await generateImages(prompt, images, settings, 1))[0];

async function removeBackground(buf: Buffer): Promise<Buffer> {
  const out = await falRun<{ image: { url: string } }>("fal-ai/birefnet/v2", { image_url: await toDataUri(buf, 2048, true), output_format: "png", refine_foreground: true });
  return (await download(out.image.url)).buf;
}

async function video(run: RunRow, endpoint: string, input: Record<string, unknown>): Promise<Buffer> {
  // Resume a job a previous worker already submitted rather than paying twice.
  let ref = run.providerRef?.queue as QueueRef | undefined;
  if (!ref || ref.endpoint !== endpoint) {
    ref = await falSubmit(endpoint, input);
    await db().update(runs).set({ providerRef: { ...run.providerRef, queue: ref } }).where(eq(runs.id, run.id));
  }
  const out = await falWait<{ video?: { url: string } }>(ref);
  if (!out.video?.url) throw new ProviderError("The video model returned no video.", 502);
  return (await download(out.video.url)).buf;
}

/* ---------------- tools ---------------- */

const png = (buf: Buffer, name: string, parentId?: string): Output => ({ buf, mime: "image/png", name, parentId });

async function execute(ctx: Ctx) {
  const { run, settings, emit } = ctx;
  const i = run.inputs;
  const pid = run.projectId;
  const imgs = (key: string) => Promise.all(asList(i[key]).map((id) => loadImage(pid, id)));
  const text = (key: string) => (typeof i[key] === "string" ? (i[key] as string) : "");

  switch (run.tool) {
    case "prompt": {
      const refs = await imgs("references");
      const out = await one(P.prompt(text("prompt"), refs.length > 0), refs.map((r) => r.buf), settings);
      return emit(png(out, "Prompt"));
    }
    case "sketch-to-render": {
      const sketches = await imgs("sketch");
      await Promise.all(sketches.map(async (s) => emit(png(await one(P.sketchToRender(text("direction")), [s.buf], settings), "Sketch to render", s.id))));
      return;
    }
    case "garment-extractor": {
      const [outfit] = await imgs("outfit");
      const mask = await loadMask(pid, i.mask);
      const label = text("maskLabel");
      const refs = mask ? [outfit.buf, await highlightRegion(outfit.buf, mask), await cropToMask(outfit.buf, mask)] : [outfit.buf];
      return emit(png(await one(P.extract(label), refs, settings), label ? `${label} extracted` : "Garment extracted", outfit.id));
    }
    case "concept": {
      const refs = await imgs("references");
      await Promise.all([0, 1, 2, 3].map(async (v) => emit(png(await one(P.concept(text("direction"), v), refs.map((r) => r.buf), settings), "Concept"))));
      return;
    }
    case "ghostform":
    case "flatlay": {
      const garments = await imgs("garment");
      const prompt = run.tool === "ghostform" ? P.ghostform() : P.flatlay();
      await Promise.all(garments.map(async (g) => emit(png(await one(prompt, [g.buf], settings), run.tool === "ghostform" ? "Ghostform" : "Flatlay", g.id))));
      return;
    }
    case "garment-recolor": {
      const [g] = await imgs("garment");
      const mask = await loadMask(pid, i.mask);
      const label = text("maskLabel");
      const colors = (Array.isArray(i.colors) ? i.colors : []) as { hex: string; name?: string }[];
      await Promise.all(
        colors.map(async (c) => {
          const refs = mask ? [g.buf, await highlightRegion(g.buf, mask)] : [g.buf];
          let out = await one(P.recolor(c, !!mask, label), refs, settings);
          if (mask) out = await compositeMasked(g.buf, out, mask, { dilate: 2 });
          await emit(png(out, `Recolor ${c.name ?? c.hex}`, g.id));
        }),
      );
      return;
    }
    case "fabric-swap": {
      const [g] = await imgs("garment");
      const fabrics = await imgs("fabric");
      const mask = await loadMask(pid, i.mask);
      const label = text("maskLabel");
      await Promise.all(
        fabrics.map(async (f) => {
          const refs = mask ? [g.buf, f.buf, await highlightRegion(g.buf, mask)] : [g.buf, f.buf];
          let out = await one(P.fabric(!!mask, label), refs, settings);
          if (mask) out = await compositeMasked(g.buf, out, mask, { dilate: 3 });
          await emit(png(out, "Fabric swap", g.id));
        }),
      );
      return;
    }
    case "model-maker": {
      const [ref] = await imgs("reference");
      const head = await one(P.modelHeadshot(text("description"), !!ref), ref ? [ref.buf] : [], { ...settings, aspect: "4:5" });
      await emit(png(head, "Headshot"));
      await Promise.all([
        (async () => emit(png(await one(P.modelHeadshotSheet(), [head], { ...settings, aspect: "16:9" }), "Headshot sheet")))(),
        (async () => emit(png(await one(P.modelBodySheet(), [head], { ...settings, aspect: "16:9" }), "Body sheet")))(),
      ]);
      return;
    }
    case "model-try-on": {
      const garments = await imgs("garment");
      const [model] = await imgs("model");
      await Promise.all(garments.map(async (g) => emit(png(await one(P.tryOn(), [model.buf, g.buf], settings), "Try-on", model.id))));
      return;
    }
    case "garment-swap": {
      const [base] = await imgs("base");
      const [garment] = await imgs("garment");
      const mask = await loadMask(pid, i.mask);
      const label = text("maskLabel");
      const marked = mask ? await highlightRegion(base.buf, mask) : base.buf;
      const refs = garment ? [base.buf, marked, garment.buf] : [base.buf, marked];
      let out = await one(P.garmentSwap(label, garment ? undefined : text("description")), refs, settings);
      if (mask) out = await compositeMasked(base.buf, out, mask, { dilate: 10 });
      return emit(png(out, "Garment swap", base.id));
    }
    case "photo-shoot": {
      const [look] = await imgs("look");
      await Promise.all(SHOOT_SHOTS.map(async (shot) => emit(png(await one(P.photoShoot(text("location"), shot), [look.buf], settings), "Photo shoot", look.id))));
      return;
    }
    case "multi-angle": {
      const [shot] = await imgs("shot");
      await Promise.all(ANGLES.map(async (a) => emit(png(await one(P.angle(a.prompt), [shot.buf], settings), a.name, shot.id))));
      return;
    }
    case "garment-360":
    case "model-360": {
      const key = run.tool === "garment-360" ? "garment" : "look";
      const [front] = await imgs(key);
      const [back] = run.tool === "garment-360" ? await imgs("back") : [];
      const res = settings.resolution === "720p" ? "720p" : "1080p";
      const aspect = ["16:9", "9:16"].includes(settings.aspect ?? "") ? settings.aspect : "auto";
      const buf = back
        ? await video(run, "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", { prompt: P.garment360(true), image_url: await toDataUri(front.buf), tail_image_url: await toDataUri(back.buf), duration: "10" })
        : await video(run, "fal-ai/veo3.1/fast/image-to-video", {
            prompt: run.tool === "garment-360" ? P.garment360(false) : P.model360(),
            image_url: await toDataUri(front.buf),
            aspect_ratio: aspect,
            resolution: res,
            duration: "8s",
            generate_audio: false,
          });
      return emit({ buf, mime: "video/mp4", name: run.tool === "garment-360" ? "360 garment video" : "360 model video", posterKey: front.key, parentId: front.id });
    }
    case "region-edit": {
      const [img] = await imgs("image");
      const mask = await loadMask(pid, i.mask);
      if (!mask) throw new ProviderError("Select a region first.", 400);
      const out = await one(P.regionEdit(text("prompt")), [img.buf, await highlightRegion(img.buf, mask)], { ...settings, aspect: "Auto" });
      return emit(png(await compositeMasked(img.buf, out, mask, { dilate: 2 }), "Region edited", img.id));
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
  let buf = o.buf;
  let mime = o.mime;
  let width = 0;
  let height = 0;
  if (mime.startsWith("image/")) {
    const meta = await sharp(buf).metadata();
    // Opaque results ship as JPEG (5–10× smaller); cutouts keep their alpha.
    if (!meta.hasAlpha) {
      buf = await sharp(buf).jpeg({ quality: 93, mozjpeg: true }).toBuffer();
      mime = "image/jpeg";
    }
    ({ width, height } = await dims(buf));
  } else if (o.posterKey) {
    const poster = await getObjectBuffer(o.posterKey);
    if (poster) ({ width, height } = await dims(poster));
  }
  const key = `p/${run.projectId}/${id}.${extFor(mime)}`;
  await putObject(key, buf);
  await insertAsset({ id, projectId: run.projectId, userId: run.userId, runId: run.id, parentId: o.parentId ?? null, kind: "result", media: mime.startsWith("video/") ? "video" : "image", storageKey: key, posterKey: o.posterKey ?? null, mime, width, height, bytes: buf.length, name: o.name });
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
