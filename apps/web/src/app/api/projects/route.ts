import { createProject, listProjects, serializeProject } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req, user) => {
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return json({ projects: await listProjects(user.id, q) });
});

export const POST = route(async (req, user) => {
  const b = await body<{ name?: string }>(req).catch(() => ({}) as { name?: string });
  const p = await createProject(user.id, typeof b.name === "string" ? b.name : undefined);
  return json({ project: serializeProject(p) }, 201);
});
