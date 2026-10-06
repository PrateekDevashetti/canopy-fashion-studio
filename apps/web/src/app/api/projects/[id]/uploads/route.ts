import { completeUpload, HttpError, serializeAsset, uploadChunk, uploadImage } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * Uploads are stored byte-for-byte. Three shapes (Vercel caps a request body at 4.5 MB):
 * - multipart: file (+ runId)                                  → small file, one request
 * - multipart: chunk, uploadId, index                          → one ≤4 MB piece of a large file
 * - JSON: { uploadId, chunks, name, type, sha256, runId }      → reassemble + register
 */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const b = (await req.json().catch(() => null)) as { uploadId?: unknown; chunks?: unknown; name?: unknown; type?: unknown; sha256?: unknown; runId?: unknown } | null;
    if (!b || typeof b.uploadId !== "string" || typeof b.chunks !== "number") throw new HttpError(400, "Expected uploadId and chunks");
    const asset = await completeUpload(
      user.id,
      id,
      b.uploadId,
      b.chunks,
      { name: typeof b.name === "string" ? b.name : "Upload", type: typeof b.type === "string" ? b.type : "", sha256: typeof b.sha256 === "string" ? b.sha256 : undefined },
      typeof b.runId === "string" ? b.runId : null,
    );
    return json({ asset: serializeAsset(asset) }, 201);
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected a file upload");
  });
  const chunk = form.get("chunk");
  if (chunk instanceof Blob) {
    await uploadChunk(user.id, id, String(form.get("uploadId") ?? ""), Number(form.get("index")), Buffer.from(await chunk.arrayBuffer()));
    return json({ ok: true });
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Expected a file upload");
  const runId = typeof form.get("runId") === "string" ? (form.get("runId") as string) : null;
  const asset = await uploadImage(user.id, id, { buf: Buffer.from(await file.arrayBuffer()), name: file.name || "Upload", type: file.type }, runId);
  return json({ asset: serializeAsset(asset) }, 201);
});
