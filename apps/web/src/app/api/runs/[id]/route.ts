import { deleteRun, getRun, HttpError, requireProject, runWithOutputs } from "@fashion/core";
import { after } from "next/server";
import { json, route } from "@/lib/http";
import { kickStale } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const r = await getRun(id);
  if (!r) throw new HttpError(404, "Run not found");
  await requireProject(r.projectId, user.id);
  if (r.status === "queued" && Date.now() - r.createdAt.getTime() > 45_000) after(() => kickStale([r.id]));
  return json({ run: await runWithOutputs(id) });
});

/** Deleting runs is reserved for the project owner. */
export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const r = await getRun(id);
  if (!r) throw new HttpError(404, "Run not found");
  await requireProject(r.projectId, user.id, "own");
  await deleteRun(id);
  return json({ ok: true });
});
