import { db, deleteAsset, fileUrl, getAsset, getRun, HttpError, requireProject, schema, serializeAsset } from "@fashion/core";
import { eq } from "drizzle-orm";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, userId: string, need: "view" | "edit" | "own" = "view") {
  const a = await getAsset(id);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(a.projectId, userId, need);
  return a;
}

/** Details panel: type, resolution, size, name, model, generation time. */
export const GET = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const a = await load(id, user.id);
  const run = a.runId ? await getRun(a.runId) : null;
  return json({
    asset: serializeAsset(a),
    segments: (a.segments ?? []).map((s) => ({ ...s, maskUrl: fileUrl(s.maskKey) })),
    run: run
      ? {
          id: run.id,
          tool: run.tool,
          model: run.model,
          inputs: run.inputs,
          settings: run.settings,
          durationMs: run.finishedAt && run.startedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
          createdAt: run.createdAt.toISOString(),
        }
      : null,
  });
}, { guests: true });

export const PATCH = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  await load(id, user.id, "edit");
  const b = await body<{ name?: string; marked?: boolean; saved?: boolean }>(req);
  const patch: { name?: string; marked?: boolean; saved?: boolean } = {};
  if (typeof b.name === "string") {
    const name = b.name.trim().slice(0, 120);
    if (!name) throw new HttpError(400, "Name can't be empty");
    patch.name = name;
  }
  if (typeof b.marked === "boolean") patch.marked = b.marked;
  if (typeof b.saved === "boolean") patch.saved = b.saved;
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update");
  await db().update(schema.assets).set(patch).where(eq(schema.assets.id, id));
  return json({ asset: serializeAsset((await getAsset(id))!) });
});

/** Deleting results is reserved for the project owner. */
export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  await load(id, user.id, "own");
  await deleteAsset(id);
  return json({ ok: true });
});
