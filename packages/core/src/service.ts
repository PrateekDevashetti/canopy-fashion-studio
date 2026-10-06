import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/client";
import { assets, projects, runs } from "./db/schema";
import { debitCredits, getUser, HttpError, insertAsset, refundCredits, requireProject, runWithOutputs } from "./data";
import { newId } from "./ids";
import { binarizeMask, dims, maskCoverage } from "./engine/imaging";
import { deleteObject, getObjectBuffer, putObject } from "./storage";
import { sha256, storeImage } from "./media";
import { adjustImage, annotateImage, cropImage } from "./edit";
import type { Adjust, CropSpec } from "./adjust";
import { batchSize, EDITOR_OPS, MODELS, runCost, toolById, validateInputs, type ModelId, type Tool } from "./tools/registry";

const MAX_UPLOAD = 40 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

type ToolLike = Pick<Tool, "id" | "name" | "inputs" | "cost" | "outputs" | "models" | "resolutions" | "aspects" | "media">;

/** Editor operations that hit a model are run like tools. */
const OP_TOOLS: Record<string, ToolLike> = {
  "region-edit": {
    id: "region-edit",
    name: "Region Edit",
    media: "image",
    cost: EDITOR_OPS["region-edit"].cost,
    outputs: 1,
    models: EDITOR_OPS["region-edit"].models,
    resolutions: ["1K", "2K", "4K"],
    aspects: ["Auto"],
    inputs: [
      { kind: "image", key: "image", label: "Image" },
      { kind: "mask", key: "mask", label: "Selection", of: "image" },
      { kind: "text", key: "prompt", label: "Change", placeholder: "Make a change…" },
    ],
  },
  "remove-background": {
    id: "remove-background",
    name: "Remove Background",
    media: "image",
    cost: EDITOR_OPS["remove-background"].cost,
    outputs: 1,
    models: EDITOR_OPS["remove-background"].models,
    resolutions: ["1K"],
    aspects: ["Auto"],
    inputs: [{ kind: "image", key: "image", label: "Image" }],
  },
};

export const resolveTool = (id: string): ToolLike | undefined => toolById(id) ?? OP_TOOLS[id];

/** Keep only declared inputs, with types and project ownership checked. */
async function sanitize(tool: ToolLike, projectId: string, raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const ids: string[] = [];
  for (const spec of tool.inputs) {
    const v = raw[spec.key];
    if (v == null || v === "") continue;
    if (spec.kind === "image") {
      const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string" && /^ast_[a-z0-9]+$/.test(x));
      const uniq = [...new Set(list)].slice(0, spec.collection ? (spec.max ?? 12) : 1);
      if (!uniq.length) continue;
      ids.push(...uniq);
      out[spec.key] = spec.collection ? uniq : uniq[0];
    } else if (spec.kind === "mask") {
      if (typeof v !== "string" || !v.startsWith(`p/${projectId}/masks/`) || v.includes("..")) throw new HttpError(400, "Invalid mask");
      out[spec.key] = v;
      if (typeof raw.maskLabel === "string") out.maskLabel = raw.maskLabel.slice(0, 60);
    } else if (spec.kind === "text") {
      if (typeof v !== "string") continue;
      const t = v.trim().slice(0, 2000);
      if (t) out[spec.key] = t;
    } else if (spec.kind === "color") {
      const list = (Array.isArray(v) ? v : [v])
        .map((c) => (typeof c === "string" ? { hex: c } : (c as { hex?: unknown; name?: unknown })))
        .filter((c): c is { hex: string; name?: string } => typeof c?.hex === "string" && HEX.test(c.hex))
        .map((c) => ({ hex: c.hex.toLowerCase(), ...(typeof c.name === "string" && c.name.trim() ? { name: c.name.trim().slice(0, 40) } : {}) }));
      if (list.length) out[spec.key] = spec.collection ? list.slice(0, 12) : list.slice(0, 1);
    }
  }
  if (ids.length) {
    const found = await db()
      .select({ id: assets.id })
      .from(assets)
      .where(and(inArray(assets.id, [...new Set(ids)]), eq(assets.projectId, projectId), isNull(assets.deletedAt)));
    if (found.length !== new Set(ids).size) throw new HttpError(400, "One of the input images no longer exists");
  }
  return out;
}

export async function blockedModels(ownerId: string, models: ModelId[]): Promise<string[]> {
  const owner = await getUser(ownerId);
  const disabled = new Set(owner?.settings?.disabledModels ?? []);
  return models.filter((m) => disabled.has(m)).map((m) => MODELS[m]?.label ?? m);
}

export async function createRun(userId: string, projectId: string, toolId: string, rawInputs: Record<string, unknown>, rawSettings: { resolution?: unknown; aspect?: unknown } = {}) {
  const { project } = await requireProject(projectId, userId, "edit");
  const tool = resolveTool(toolId);
  if (!tool) throw new HttpError(400, `Unknown tool "${toolId}"`);
  const inputs = await sanitize(tool, projectId, rawInputs ?? {});
  const problem = toolById(toolId) ? validateInputs(toolById(toolId)!, inputs) : tool.inputs.find((s) => inputs[s.key] == null) ? `Missing ${tool.inputs.find((s) => inputs[s.key] == null)!.label.toLowerCase()}` : null;
  if (problem) throw new HttpError(400, problem);

  const blocked = await blockedModels(project.ownerId, tool.models);
  if (blocked.length) throw new HttpError(409, `Models used in this tool are blocked for this workspace: ${blocked.join(", ")}`);

  const resolution = typeof rawSettings.resolution === "string" && tool.resolutions.includes(rawSettings.resolution) ? rawSettings.resolution : tool.resolutions[0];
  const aspect = typeof rawSettings.aspect === "string" && tool.aspects.includes(rawSettings.aspect) ? rawSettings.aspect : tool.aspects[0];
  const expected = tool.outputs * batchSize(tool as Tool, inputs);
  const cost = runCost(tool as Tool, inputs, resolution);

  const id = newId("run");
  if (!(await debitCredits(userId, cost, `${tool.name}`, id))) throw new HttpError(402, `Not enough credits — this run needs ${cost}.`);
  try {
    await db()
      .insert(runs)
      .values({ id, projectId, userId, tool: tool.id, status: "queued", inputs, settings: { resolution, aspect }, cost, expected, model: tool.models.map((m) => MODELS[m]?.label ?? m).join(", ") });
  } catch (e) {
    await refundCredits(userId, cost, "refund (create failed)", id);
    throw e;
  }
  await db().update(projects).set({ updatedAt: new Date(), lastOpenedAt: new Date() }).where(eq(projects.id, projectId));
  return (await runWithOutputs(id))!;
}

/** A finished run with no model call (uploads and client-side edits). */
async function instantRun(userId: string, projectId: string, tool: string, existingRunId?: string | null) {
  if (existingRunId) {
    const r = await db().query.runs.findFirst({ where: and(eq(runs.id, existingRunId), eq(runs.projectId, projectId), eq(runs.tool, tool)) });
    if (r) return r.id;
  }
  const id = newId("run");
  await db().insert(runs).values({ id, projectId, userId, tool, status: "succeeded", cost: 0, expected: 1, startedAt: new Date(), finishedAt: new Date() });
  return id;
}

/**
 * Store an uploaded image exactly as received — no re-encode, no resize, no metadata stripping —
 * so the asset (and its download) is byte-identical to the user's file. A preview rendition is
 * made separately for display.
 */
export async function uploadImage(userId: string, projectId: string, file: { buf: Buffer; name: string; type: string }, groupRunId?: string | null) {
  await requireProject(projectId, userId, "edit");
  if (file.buf.length > MAX_UPLOAD) throw new HttpError(413, "Images must be under 40 MB");
  if (file.type && !/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|avif|heic|heif|tiff?)$/i.test(file.name)) throw new HttpError(415, "Upload an image (PNG, JPG, WebP)");
  const id = newId("ast");
  let stored;
  try {
    stored = await storeImage(projectId, id, file.buf, { originalName: file.name.slice(0, 200) });
  } catch (e) {
    if (/pixel limit/i.test((e as Error).message)) throw new HttpError(413, "That image is too large (max 60 megapixels)");
    throw new HttpError(415, "That file isn't a readable image");
  }
  const runId = await instantRun(userId, projectId, "upload", groupRunId);
  const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Upload";
  return insertAsset({ id, projectId, userId, runId, kind: "upload", media: "image", name, ...stored });
}

/* ---------- chunked uploads (files over the 4.5 MB function body limit) ---------- */

export const UPLOAD_CHUNK = 4 * 1024 * 1024;
const UPLOAD_ID = /^upl_[a-z0-9]{16}$/;
const chunkKey = (projectId: string, uploadId: string, i: number) => `p/${projectId}/incoming/${uploadId}/${i}`;

export async function uploadChunk(userId: string, projectId: string, uploadId: string, index: number, buf: Buffer) {
  await requireProject(projectId, userId, "edit");
  if (!UPLOAD_ID.test(uploadId) || !Number.isInteger(index) || index < 0 || index * UPLOAD_CHUNK >= MAX_UPLOAD) throw new HttpError(400, "Invalid upload chunk");
  if (buf.length === 0 || buf.length > UPLOAD_CHUNK) throw new HttpError(413, "Chunk too large");
  await putObject(chunkKey(projectId, uploadId, index), buf);
}

/** Reassemble the chunks in order and store the file exactly like a direct upload. */
export async function completeUpload(userId: string, projectId: string, uploadId: string, count: number, file: { name: string; type: string; sha256?: string }, groupRunId?: string | null) {
  await requireProject(projectId, userId, "edit");
  if (!UPLOAD_ID.test(uploadId) || !Number.isInteger(count) || count < 1 || count * UPLOAD_CHUNK > MAX_UPLOAD + UPLOAD_CHUNK) throw new HttpError(400, "Invalid upload");
  const keys = Array.from({ length: count }, (_, i) => chunkKey(projectId, uploadId, i));
  const parts = await Promise.all(keys.map((k) => getObjectBuffer(k)));
  if (parts.some((p) => !p)) throw new HttpError(409, "Upload incomplete — please try again");
  const buf = Buffer.concat(parts as Buffer[]);
  // Integrity: the reassembled bytes must hash to what the browser computed.
  if (file.sha256 && /^[a-f0-9]{64}$/.test(file.sha256) && sha256(buf) !== file.sha256) {
    await Promise.all(keys.map(deleteObject));
    throw new HttpError(422, "Upload was corrupted in transit — please try again");
  }
  try {
    return await uploadImage(userId, projectId, { buf, name: file.name, type: file.type }, groupRunId);
  } finally {
    await Promise.all(keys.map(deleteObject));
  }
}

/* ---------- editor saves (rendered server-side from the full-resolution master) ---------- */

export type EditPayload = { op: "crop"; crop: CropSpec } | { op: "adjust"; adjust: Adjust } | { op: "annotate"; overlay: Buffer };

export async function saveEdit(userId: string, projectId: string, parentId: string, payload: EditPayload) {
  await requireProject(projectId, userId, "edit");
  const parent = await db().query.assets.findFirst({ where: and(eq(assets.id, parentId), eq(assets.projectId, projectId), isNull(assets.deletedAt)) });
  if (!parent || parent.media !== "image") throw new HttpError(404, "That image no longer exists");
  const src = await getObjectBuffer(parent.storageKey);
  if (!src) throw new HttpError(404, "That image no longer exists");
  let out: Buffer;
  try {
    out =
      payload.op === "crop"
        ? await cropImage(src, parent.mime, payload.crop)
        : payload.op === "adjust"
          ? await adjustImage(src, parent.mime, payload.adjust)
          : await annotateImage(src, parent.mime, payload.overlay);
  } catch (e) {
    throw new HttpError(400, (e as Error).message === "No adjustments to apply" ? "No adjustments to apply" : "Couldn't apply that edit");
  }
  const runId = await instantRun(userId, projectId, payload.op);
  const id = newId("ast");
  const stored = await storeImage(projectId, id, out);
  return insertAsset({ id, projectId, userId, runId, parentId, kind: "result", media: "image", name: EDITOR_OPS[payload.op].label, ...stored });
}

/** Store a selection mask drawn in the editor (lasso / brush / square). Returns its storage key. */
export async function saveMask(userId: string, projectId: string, buf: Buffer) {
  await requireProject(projectId, userId, "edit");
  if (buf.length > 10 * 1024 * 1024) throw new HttpError(413, "Mask too large");
  const size = await dims(buf).catch(() => {
    throw new HttpError(415, "Invalid mask");
  });
  const mask = await binarizeMask(buf, size);
  if ((await maskCoverage(mask)) < 0.0005) throw new HttpError(400, "The selection is empty");
  const key = `p/${projectId}/masks/${newId("ast").replace("ast_", "msk_")}.png`;
  await putObject(key, mask);
  return key;
}
