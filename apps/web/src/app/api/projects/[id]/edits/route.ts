import { HttpError, saveEdit, serializeAsset } from "@fashion/core";
import { parseAdjust, parseCrop } from "@fashion/core/adjust";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * Save an editor operation as a new version. Rendered server-side from the full-resolution master.
 * - JSON { op: "crop", parentId, crop } | { op: "adjust", parentId, adjust }
 * - multipart: op=annotate, parentId, overlay (transparent PNG of the drawn layer)
 */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const b = (await req.json().catch(() => null)) as { op?: unknown; parentId?: unknown; crop?: unknown; adjust?: unknown } | null;
    if (!b || typeof b.parentId !== "string") throw new HttpError(400, "Expected parentId");
    if (b.op === "crop") {
      const crop = parseCrop(b.crop);
      if (!crop) throw new HttpError(400, "Invalid crop");
      return json({ asset: serializeAsset(await saveEdit(user.id, id, b.parentId, { op: "crop", crop })) }, 201);
    }
    if (b.op === "adjust") return json({ asset: serializeAsset(await saveEdit(user.id, id, b.parentId, { op: "adjust", adjust: parseAdjust(b.adjust) })) }, 201);
    throw new HttpError(400, "Unknown edit");
  }
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected an edit");
  });
  const overlay = form.get("overlay");
  const parentId = form.get("parentId");
  if (form.get("op") !== "annotate" || !(overlay instanceof Blob) || typeof parentId !== "string") throw new HttpError(400, "Expected op=annotate, parentId and overlay");
  if (overlay.size > 4 * 1024 * 1024) throw new HttpError(413, "Annotation layer too large");
  const asset = await saveEdit(user.id, id, parentId, { op: "annotate", overlay: Buffer.from(await overlay.arrayBuffer()) });
  return json({ asset: serializeAsset(asset) }, 201);
}, { limit: "edits" });
