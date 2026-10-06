import { HttpError, saveMask } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Store a selection mask drawn in the editor; returns its key for tool inputs. */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Expected a mask image");
  const key = await saveMask(user.id, id, Buffer.from(await file.arrayBuffer()));
  return json({ key }, 201);
}, { limit: "edits" });
