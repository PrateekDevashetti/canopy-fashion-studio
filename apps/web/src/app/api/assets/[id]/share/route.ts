import { db, getAsset, HttpError, requireProject, schema, shareToken } from "@fashion/core";
import { eq } from "drizzle-orm";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Create (or return) a public share link for one result. */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const a = await getAsset(id);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(a.projectId, user.id, "edit");
  const token = a.shareToken ?? shareToken();
  if (!a.shareToken) await db().update(schema.assets).set({ shareToken: token }).where(eq(schema.assets.id, id));
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return json({ url: `${origin}/s/${token}` });
});

export const DELETE = route<Ctx>(async (_req, user, { params }) => {
  const { id } = await params;
  const a = await getAsset(id);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(a.projectId, user.id, "edit");
  await db().update(schema.assets).set({ shareToken: null }).where(eq(schema.assets.id, id));
  return json({ ok: true });
});
