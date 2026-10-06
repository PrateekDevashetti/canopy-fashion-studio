import { getObject, mimeFor, safeKey } from "@fashion/core";

export const dynamic = "force-dynamic";

/**
 * Serves stored objects. Keys embed unguessable random ids (p/<project>/<asset>.ext), so the URL
 * itself is the capability — the same model as signed CDN links, but stable for the feed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = safeKey(parts.map(decodeURIComponent).join("/"));
  if (!/^p\/prj_[a-z0-9]+\/(masks\/)?[a-z]{3}_[a-z0-9]+\.[a-z0-9]+$/.test(key)) return new Response("Not found", { status: 404 });
  const range = req.headers.get("range");
  const obj = await getObject(key, range);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": mimeFor(key),
    "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    "accept-ranges": "bytes",
    "content-length": String(obj.body.length),
  };
  if (obj.contentRange) headers["content-range"] = obj.contentRange;
  const dl = new URL(req.url).searchParams.get("download");
  if (dl) headers["content-disposition"] = `attachment; filename="${dl.replace(/[^\w.\- ]+/g, "_").slice(0, 100)}"`;
  return new Response(new Uint8Array(obj.body), { status: obj.status === 206 ? 206 : 200, headers });
}
