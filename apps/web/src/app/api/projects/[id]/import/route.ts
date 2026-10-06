import { HttpError, importAsset, importFromUrl, serializeAsset } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Add to this project: { assetId } from your library, or { url, name? } from a public link. */
export const POST = route<Ctx>(
  async (req, user, { params }) => {
    const { id } = await params;
    const b = await body<{ assetId?: unknown; url?: unknown; name?: unknown }>(req);
    const asset =
      typeof b.assetId === "string"
        ? await importAsset(user.id, id, b.assetId)
        : typeof b.url === "string"
          ? await importFromUrl(user.id, id, b.url, typeof b.name === "string" ? b.name : undefined)
          : null;
    if (!asset) throw new HttpError(400, "Pass assetId or url");
    return json({ asset: serializeAsset(asset) }, 201);
  },
  { limit: "uploads" },
);
