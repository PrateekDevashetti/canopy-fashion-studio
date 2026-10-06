import { HttpError, saveEdit, serializeAsset } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const OPS = new Set(["crop", "adjust", "annotate"]);

/** Save a client-rendered edit. multipart: file, op (crop|adjust|annotate), parentId. */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  const op = String(form.get("op") ?? "");
  if (!(file instanceof File) || !OPS.has(op)) throw new HttpError(400, "Expected file and op");
  const parentId = typeof form.get("parentId") === "string" ? (form.get("parentId") as string) : null;
  const asset = await saveEdit(user.id, id, op as "crop" | "adjust" | "annotate", parentId, Buffer.from(await file.arrayBuffer()));
  return json({ asset: serializeAsset(asset) }, 201);
});
