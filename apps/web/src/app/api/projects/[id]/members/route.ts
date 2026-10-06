import { HttpError, inviteMember, listMembers, removeMember, requireProject, getUser } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const { project, role } = await requireProject(id, user.id);
  const owner = await getUser(project.ownerId);
  return json({ role, owner: { name: owner?.name ?? "", email: owner?.email ?? "" }, members: await listMembers(id) });
});

export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  await requireProject(id, user.id, "own");
  const b = await body<{ email?: string; role?: string }>(req);
  if (!b.email) throw new HttpError(400, "Enter an email");
  await inviteMember(id, user.id, b.email, b.role === "viewer" ? "viewer" : "editor");
  return json({ members: await listMembers(id) }, 201);
});

export const DELETE = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  await requireProject(id, user.id, "own");
  const email = new URL(req.url).searchParams.get("email");
  if (!email) throw new HttpError(400, "Missing email");
  await removeMember(id, email);
  return json({ members: await listMembers(id) });
});
