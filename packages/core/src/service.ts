import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/client";
import { assets, projects, runs } from "./db/schema";
import { debitCredits, getUser, HttpError, insertAsset, refundCredits, requireProject, runWithOutputs } from "./data";
import { newId } from "./ids";
import { normalizeUpload, binarizeMask, dims, maskCoverage } from "./engine/imaging";
import { extFor, putObject } from "./storage";
import { batchSize, EDITOR_OPS, MODELS, runCost, toolById, validateInputs, type ModelId, type Tool } from "./tools/registry";

const MAX_UPLOAD = 25 * 1024 * 1024;
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

export async function uploadImage(userId: string, projectId: string, file: { buf: Buffer; name: string; type: string }, groupRunId?: string | null) {
  await requireProject(projectId, userId, "edit");
  if (file.buf.length > MAX_UPLOAD) throw new HttpError(413, "Images must be under 25 MB");
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|avif|heic)$/i.test(file.name)) throw new HttpError(415, "Upload an image (PNG, JPG, WebP)");
  let norm;
  try {
    norm = await normalizeUpload(file.buf);
  } catch {
    throw new HttpError(415, "That file isn't a readable image");
  }
  const runId = await instantRun(userId, projectId, "upload", groupRunId);
  const id = newId("ast");
  const key = `p/${projectId}/${id}.${extFor(norm.mime)}`;
  await putObject(key, norm.buf);
  const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Upload";
  return insertAsset({ id, projectId, userId, runId, kind: "upload", media: "image", storageKey: key, mime: norm.mime, width: norm.width, height: norm.height, bytes: norm.buf.length, name });
}

/** Save a client-side edit (crop / adjustments / annotation) as a new version in the feed. */
export async function saveEdit(userId: string, projectId: string, op: "crop" | "adjust" | "annotate", parentId: string | null, buf: Buffer) {
  await requireProject(projectId, userId, "edit");
  if (buf.length > MAX_UPLOAD) throw new HttpError(413, "Image too large");
  const norm = await normalizeUpload(buf).catch(() => {
    throw new HttpError(415, "Invalid image");
  });
  if (parentId) {
    const p = await db().query.assets.findFirst({ where: and(eq(assets.id, parentId), eq(assets.projectId, projectId)) });
    if (!p) parentId = null;
  }
  const runId = await instantRun(userId, projectId, op);
  const id = newId("ast");
  const key = `p/${projectId}/${id}.${extFor(norm.mime)}`;
  await putObject(key, norm.buf);
  const name = EDITOR_OPS[op].label;
  return insertAsset({ id, projectId, userId, runId, parentId, kind: "result", media: "image", storageKey: key, mime: norm.mime, width: norm.width, height: norm.height, bytes: norm.buf.length, name });
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
