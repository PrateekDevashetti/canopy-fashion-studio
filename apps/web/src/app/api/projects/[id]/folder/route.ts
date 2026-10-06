import { moveProjectToFolder } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Move to folder (null = All projects). */
export const PUT = route<Ctx>(async (req, user, { params }) => {
  const b = await body<{ folderId?: unknown }>(req);
  await moveProjectToFolder(user.id, (await params).id, typeof b.folderId === "string" && b.folderId ? b.folderId : null);
  return json({ ok: true });
});
