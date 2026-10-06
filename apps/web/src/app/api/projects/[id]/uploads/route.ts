import { HttpError, serializeAsset, uploadImage } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** multipart/form-data: file (required), runId (optional — groups a multi-file drop into one feed run). */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected a file upload");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Expected a file upload");
  const runId = typeof form.get("runId") === "string" ? (form.get("runId") as string) : null;
  const asset = await uploadImage(user.id, id, { buf: Buffer.from(await file.arrayBuffer()), name: file.name || "Upload", type: file.type }, runId);
  return json({ asset: serializeAsset(asset) }, 201);
});
