import { exportToShopify } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Export looks as a draft Shopify product: { projectId, assetIds, title, description? }. */
export const POST = route(
  async (req, user) => {
    const b = await body<{ projectId?: unknown; assetIds?: unknown; title?: unknown; description?: unknown }>(req);
    const ids = Array.isArray(b.assetIds) ? b.assetIds.filter((x): x is string => typeof x === "string") : [];
    const out = await exportToShopify(user.id, String(b.projectId ?? ""), ids, String(b.title ?? ""), typeof b.description === "string" ? b.description : undefined);
    return json(out, 201);
  },
  { limit: "edits" },
);
