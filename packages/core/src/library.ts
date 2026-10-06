import dns from "node:dns/promises";
import net from "node:net";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "./db/client";
import { assets, projectMembers, projects } from "./db/schema";
import { getAsset, HttpError, requireProject, serializeAsset } from "./data";
import { getObjectBuffer } from "./storage";
import { uploadImage } from "./service";
import { isPublished } from "./collab";

/* ---------------- workspace library (Assets / Elements / History) ---------------- */

async function workspaceProjectIds(userId: string) {
  const owned = await db().select({ id: projects.id }).from(projects).where(and(eq(projects.ownerId, userId), isNull(projects.deletedAt)));
  const shared = await db().select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId));
  return [...new Set([...owned, ...shared].map((r) => r.id))];
}

/** Elements = cut-outs, extracted garments and vectors: reusable pieces with no background. */
const ELEMENT_NAMES = ["Background removed", "Garment extracted", "Vector", "Vector flat"];

export async function libraryAssets(userId: string, source: "assets" | "elements" | "history", before?: string) {
  const ids = await workspaceProjectIds(userId);
  if (!ids.length) return [];
  const base = and(inArray(assets.projectId, ids), isNull(assets.deletedAt), before ? lt(assets.createdAt, new Date(before)) : undefined);
  const where =
    source === "assets"
      ? and(base, eq(assets.saved, true))
      : source === "elements"
        ? and(base, or(inArray(assets.name, ELEMENT_NAMES), eq(assets.mime, "image/svg+xml")), eq(assets.media, "image"))
        : and(base, eq(assets.kind, "result"));
  const rows = await db().select().from(assets).where(where).orderBy(desc(assets.createdAt)).limit(60);
  return rows.map(serializeAsset);
}

/** Copy an asset from any of the user's projects into this one (byte-for-byte). */
export async function importAsset(userId: string, projectId: string, assetId: string) {
  const a = await getAsset(assetId);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(projectId, userId, "edit");
  // Your own workspace, or anything published to Explore.
  const ok = await requireProject(a.projectId, userId, "view").then(
    () => true,
    () => isPublished(a.id),
  );
  if (!ok) throw new HttpError(404, "Image not found");
  if (a.media !== "image") throw new HttpError(400, "Only images can be added");
  const buf = await getObjectBuffer(a.storageKey);
  if (!buf) throw new HttpError(404, "Image not found in storage");
  return uploadImage(userId, projectId, { buf, name: a.name || "Library image", type: a.mime });
}

/* ---------------- import from a link (Dropbox, Google Drive, stock, any https image) ---------------- */

const MAX_BYTES = 40 * 1024 * 1024;

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Turn share links into direct-download links. */
export function directLink(raw: string): string {
  const u = new URL(raw);
  if (/(^|\.)dropbox\.com$/.test(u.hostname)) {
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return u.toString();
  }
  const drive = raw.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]{10,})/);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  return u.toString();
}

/** Fetch an image from the public internet without letting the URL reach internal services. */
export async function safeFetchImage(raw: string): Promise<{ buf: Buffer; type: string; name: string }> {
  let url: URL;
  try {
    url = new URL(directLink(raw.trim()));
  } catch {
    throw new HttpError(400, "That doesn't look like a link");
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:") throw new HttpError(400, "Only https links are supported");
    if (url.port && url.port !== "443") throw new HttpError(400, "That link isn't allowed");
    const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new HttpError(400, "That link isn't allowed");
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "CanopyFashionStudio/1.0" } }).catch(() => {
      throw new HttpError(502, "Couldn't download that link");
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new HttpError(400, `The link returned ${res.status}`);
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!type.startsWith("image/")) throw new HttpError(415, "That link isn't an image (make sure the file is shared publicly)");
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new HttpError(413, "Images must be under 40 MB");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new HttpError(413, "Images must be under 40 MB");
      chunks.push(value);
    }
    const name = decodeURIComponent(url.pathname.split("/").pop() || "Imported image").slice(0, 120);
    return { buf: Buffer.concat(chunks), type, name };
  }
  throw new HttpError(400, "Too many redirects");
}

export async function importFromUrl(userId: string, projectId: string, url: string, name?: string) {
  await requireProject(projectId, userId, "edit");
  const img = await safeFetchImage(url);
  return uploadImage(userId, projectId, { buf: img.buf, name: name?.slice(0, 120) || img.name, type: img.type });
}

/* ---------------- stock (Unsplash with a key, otherwise Openverse) ---------------- */

export type StockPhoto = { id: string; title: string; author: string; thumb: string; full: string; link: string; license: string };

export const stockProvider = () => (process.env.UNSPLASH_ACCESS_KEY ? "unsplash" : "openverse");

export async function searchStock(query: string, page = 1): Promise<{ provider: string; photos: StockPhoto[] }> {
  const q = query.trim().slice(0, 100) || "fashion editorial";
  if (process.env.UNSPLASH_ACCESS_KEY) {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=30&page=${page}&content_filter=high`, {
      headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new HttpError(502, "Unsplash is unavailable right now");
    const j = (await res.json()) as { results: { id: string; alt_description?: string; description?: string; user: { name: string; username: string }; urls: { small: string; full: string }; links: { html: string } }[] };
    return {
      provider: "unsplash",
      photos: j.results.map((p) => ({ id: p.id, title: p.description || p.alt_description || "Untitled", author: `@${p.user.username}`, thumb: p.urls.small, full: p.urls.full, link: p.links.html, license: "Unsplash License" })),
    };
  }
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=30&page=${page}&mature=false`, {
    headers: { "user-agent": "CanopyFashionStudio/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new HttpError(502, "Stock search is unavailable right now");
  const j = (await res.json()) as { results: { id: string; title?: string; creator?: string; thumbnail?: string; url: string; foreign_landing_url?: string; license?: string; license_version?: string }[] };
  return {
    provider: "openverse",
    photos: j.results
      .filter((p) => p.url?.startsWith("https://"))
      .map((p) => ({ id: p.id, title: p.title || "Untitled", author: p.creator ? `@${p.creator}` : "", thumb: p.thumbnail ?? p.url, full: p.url, link: p.foreign_landing_url ?? p.url, license: `CC ${(p.license ?? "").toUpperCase()} ${p.license_version ?? ""}`.trim() })),
  };
}
