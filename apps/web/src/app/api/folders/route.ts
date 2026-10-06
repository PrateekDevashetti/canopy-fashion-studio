import { createFolder, listFolders } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, user) => json({ folders: await listFolders(user.id) }));

export const POST = route(async (req, user) => {
  const b = await body<{ name?: unknown }>(req);
  return json({ folder: await createFolder(user.id, typeof b.name === "string" ? b.name : "") }, 201);
});
