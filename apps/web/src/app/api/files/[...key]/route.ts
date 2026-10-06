import { getObject, getObjectWindow, mimeFor, presignGet, safeKey } from "@fashion/core";

export const dynamic = "force-dynamic";

const KEY_RE = /^p\/prj_[a-z0-9]+\/(masks\/|previews\/)?[a-z]{3}_[a-z0-9]+\.[a-z0-9]+$/;

/**
 * Serves stored objects. Keys embed unguessable random ids (p/<project>/<asset>.ext), so the URL
 * itself is the capability — the same model as signed CDN links, but stable for the feed.
 *
 * Vercel functions can't return more than 4.5 MB, so:
 * - Range requests (video seeking, chunked downloads) are answered in ≤4 MB windows.
 * - Whole-file requests for larger objects redirect to a short-lived presigned storage URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = safeKey(parts.map(decodeURIComponent).join("/"));
  if (!KEY_RE.test(key)) return new Response("Not found", { status: 404 });
  const range = req.headers.get("range");
  const dl = new URL(req.url).searchParams.get("download");
  let obj = await getObjectWindow(key, range);
  if (!obj) return new Response("Not found", { status: 404 });

  if (!range && obj.total > obj.body.length) {
    const signed = presignGet(key, 6 * 3600, dl);
    if (signed) return Response.redirect(signed, 302);
    // Local-disk mode (dev/self-hosted): no body limit, serve it whole.
    const full = await getObject(key);
    if (!full) return new Response("Not found", { status: 404 });
    obj = { body: full.body, start: 0, end: full.body.length - 1, total: full.body.length, partial: false };
  }

  const headers: Record<string, string> = {
    "content-type": mimeFor(key),
    "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    "accept-ranges": "bytes",
    "content-length": String(obj.body.length),
    "x-content-type-options": "nosniff",
  };
  if (range || obj.partial) headers["content-range"] = `bytes ${obj.start}-${obj.end}/${obj.total}`;
  if (dl) headers["content-disposition"] = `attachment; filename="${dl.replace(/[^\w.\- ]+/g, "_").slice(0, 100)}"`;
  return new Response(new Uint8Array(obj.body), { status: range || obj.partial ? 206 : 200, headers });
}
