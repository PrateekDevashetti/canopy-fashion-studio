import { deleteProject, renameProject, requireProject, serializeProject, touchProject } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const { project, role } = await requireProject(id, user.id);
  await touchProject(id);
  return json({ project: serializeProject(project), role });
});

export const PATCH = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  await requireProject(id, user.id, "edit");
  const b = await body<{ name?: string }>(req);
  if (typeof b.name === "string") await renameProject(id, b.name);
  const { project, role } = await requireProject(id, user.id);
  return json({ project: serializeProject(project), role });
});

export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  await requireProject(id, user.id, "own");
  await deleteProject(id);
  return json({ ok: true });
});
