import { deleteFolder } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ folderId: string }> };

/** Delete a folder (its projects move back to "All projects"). */
export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  await deleteFolder(user.id, (await params).folderId);
  return json({ ok: true });
});
