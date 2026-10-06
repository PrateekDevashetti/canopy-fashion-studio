import { connectShopify, disconnectShopify, shopifyStatus } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, user) => json(await shopifyStatus(user.id)));

/** Connect a store: { shop: "name.myshopify.com", token: "shpat_…" } (verified against Shopify). */
export const PUT = route(
  async (req, user) => {
    const b = await body<{ shop?: unknown; token?: unknown }>(req);
    return json(await connectShopify(user.id, String(b.shop ?? ""), String(b.token ?? "")));
  },
  { limit: "edits" },
);

export const DELETE = route(async (_req, user) => {
  await disconnectShopify(user.id);
  return json({ connected: false });
});
