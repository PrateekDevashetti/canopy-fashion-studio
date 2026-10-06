import { detectGarments, fileUrl, getAsset, HttpError, requireProject } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Ctx = { params: Promise<{ id: string }> };

/** Auto detect: segment the image into editable garment regions (cached on the asset). */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const a = await getAsset(id);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(a.projectId, user.id, "edit");
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const segments = await detectGarments(a, { refresh });
    return json({ segments: segments.map((s) => ({ ...s, maskUrl: fileUrl(s.maskKey) })) });
  } catch (e) {
    console.error("[detect]", e);
    throw new HttpError(502, "Couldn't detect garments on this image. Try again, or select by hand.");
  }
});
