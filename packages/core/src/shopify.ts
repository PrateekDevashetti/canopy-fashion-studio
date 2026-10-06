import crypto from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/client";
import { assets, users } from "./db/schema";
import { getUser, HttpError, requireProject } from "./data";
import { presignGet } from "./storage";

/**
 * Connect to Shopify: export looks to a store as a draft product with its media.
 * The Admin API token is encrypted at rest (AES-256-GCM, key from FASHION_SECRET/GUEST_SECRET)
 * and never returned to the browser. Only *.myshopify.com hosts are ever contacted.
 */

const API_VERSION = "2025-10";
const SHOP_RE = /^[a-z0-9][a-z0-9-]{1,60}\.myshopify\.com$/;

function key() {
  const secret = process.env.FASHION_SECRET ?? process.env.GUEST_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!secret) throw new HttpError(500, "Encryption is not configured on this server");
  return crypto.createHash("sha256").update(`shopify:${secret}`).digest();
}

function seal(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

function open(sealed: string) {
  const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

type ShopifySettings = { shop: string; token: string; name?: string };

export function normalizeShop(input: string) {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const shop = s.endsWith(".myshopify.com") ? s : `${s}.myshopify.com`;
  if (!SHOP_RE.test(shop)) throw new HttpError(400, "Enter your store's myshopify.com domain, e.g. canopy-demo.myshopify.com");
  return shop;
}

async function gql<T>(shop: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!SHOP_RE.test(shop)) throw new HttpError(400, "Invalid store");
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {
    throw new HttpError(502, "Couldn't reach Shopify");
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(400, "Shopify rejected the access token — check it has write_products scope");
  if (!res.ok) throw new HttpError(502, `Shopify error (${res.status})`);
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length) throw new HttpError(400, `Shopify: ${j.errors[0].message}`);
  return j.data as T;
}

export async function shopifyStatus(userId: string) {
  const u = await getUser(userId);
  const s = (u?.settings as { shopify?: ShopifySettings } | undefined)?.shopify;
  return s ? { connected: true, shop: s.shop, name: s.name ?? s.shop } : { connected: false as const };
}

export async function connectShopify(userId: string, shopInput: string, token: string) {
  const shop = normalizeShop(shopInput);
  const t = token.trim();
  if (!/^shpat_[A-Za-z0-9]{20,}$/.test(t)) throw new HttpError(400, "Paste an Admin API access token (starts with shpat_)");
  const data = await gql<{ shop: { name: string } }>(shop, t, "{ shop { name } }");
  const u = await getUser(userId);
  const settings = { ...(u?.settings ?? {}), shopify: { shop, token: seal(t), name: data.shop.name } };
  await db().update(users).set({ settings }).where(eq(users.id, userId));
  return { connected: true, shop, name: data.shop.name };
}

export async function disconnectShopify(userId: string) {
  const u = await getUser(userId);
  const settings = { ...(u?.settings ?? {}) } as Record<string, unknown>;
  delete settings.shopify;
  await db().update(users).set({ settings }).where(eq(users.id, userId));
}

/** Create a draft product with the selected looks as its media. */
export async function exportToShopify(userId: string, projectId: string, assetIds: string[], title: string, description?: string) {
  await requireProject(projectId, userId, "view");
  const u = await getUser(userId);
  const s = (u?.settings as { shopify?: ShopifySettings } | undefined)?.shopify;
  if (!s) throw new HttpError(400, "Connect your Shopify store first");
  const ids = [...new Set(assetIds)].slice(0, 20);
  if (!ids.length) throw new HttpError(400, "Pick the looks to export");
  const rows = await db()
    .select()
    .from(assets)
    .where(and(inArray(assets.id, ids), eq(assets.projectId, projectId), isNull(assets.deletedAt)));
  if (!rows.length) throw new HttpError(404, "Looks not found");
  const media = rows
    .filter((a) => a.mime !== "image/svg+xml")
    .map((a) => {
      const url = presignGet(a.storageKey, 24 * 3600);
      if (!url) throw new HttpError(500, "Storage links aren't available on this server");
      return { originalSource: url, mediaContentType: a.media === "video" ? "VIDEO" : "IMAGE", alt: a.name || title };
    });
  const name = title.trim().slice(0, 255) || "Fashion Studio product";
  const data = await gql<{ productCreate: { product: { id: string; handle: string } | null; userErrors: { message: string }[] } }>(
    s.shop,
    open(s.token),
    `mutation create($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) { product { id handle } userErrors { message } }
    }`,
    { product: { title: name, status: "DRAFT", descriptionHtml: description ? `<p>${escapeHtml(description.slice(0, 2000))}</p>` : undefined }, media },
  );
  const err = data.productCreate.userErrors[0];
  if (err || !data.productCreate.product) throw new HttpError(400, `Shopify: ${err?.message ?? "product not created"}`);
  const numeric = data.productCreate.product.id.split("/").pop();
  return { productId: data.productCreate.product.id, adminUrl: `https://admin.shopify.com/store/${s.shop.replace(".myshopify.com", "")}/products/${numeric}`, media: media.length };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
