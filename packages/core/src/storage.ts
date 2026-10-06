import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Object storage for uploads and generations.
 * - S3-compatible (Cloudflare R2 — the floraxfauna `canopy-assets` bucket under S3_PREFIX) when
 *   S3_BUCKET/S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are set. Required in production,
 *   where the web app (Vercel) and the worker (Railway) run on different machines.
 * - Local disk (FASHION_STORAGE_DIR, default ./storage) otherwise.
 * Files are always served through the web app at /api/files/<key> (auth-free, unguessable keys).
 */
const s3 = () =>
  process.env.S3_BUCKET && process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        bucket: process.env.S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT.replace(/\/$/, ""),
        key: process.env.S3_ACCESS_KEY_ID,
        secret: process.env.S3_SECRET_ACCESS_KEY,
        region: process.env.S3_REGION ?? "auto",
      }
    : null;

export const storageMode = () => (s3() ? "s3" : "local");

const storageDir = () => process.env.FASHION_STORAGE_DIR || path.resolve(process.cwd(), "storage");

export const safeKey = (key: string) => key.replace(/\\/g, "/").replace(/\.\.+/g, "").replace(/^\/+/, "");

export const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  json: "application/json",
};

export const extFor = (mime: string) =>
  Object.entries(MIME).find(([, m]) => m === mime)?.[0] ?? (mime.startsWith("video/") ? "mp4" : "png");

export const mimeFor = (key: string) => MIME[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

function hmac(k: Buffer | string, d: string) {
  return crypto.createHmac("sha256", k).update(d).digest();
}
const sha = (d: Buffer | string) => crypto.createHash("sha256").update(d).digest("hex");

/** AWS Signature V4 for a single-object request (path-style). */
function signed(method: "GET" | "PUT" | "DELETE" | "HEAD", key: string, body: Buffer | null, extra: Record<string, string> = {}) {
  const c = s3()!;
  const objectKey = `${(process.env.S3_PREFIX ?? "").replace(/^\/+/, "")}${key}`;
  const url = new URL(`${c.endpoint}/${c.bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = body ? sha(body) : sha("");
  const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...extra };
  if (body) headers["content-type"] = mimeFor(key);
  const names = Object.keys(headers).sort();
  const canonical = [method, url.pathname, "", ...names.map((n) => `${n}:${headers[n]}`), "", names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const kSig = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, day), c.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSig).update(toSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  delete headers.host;
  return { url: url.toString(), headers };
}

export async function putObject(key: string, body: Buffer): Promise<string> {
  const k = safeKey(key);
  if (s3()) {
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const { url, headers } = signed("PUT", k, body);
      const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as Response);
      if (res.ok) return k;
      last = `Storage upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    throw new Error(last);
  }
  const full = path.join(storageDir(), k);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  return k;
}

/** Fetch an object. `range` is an HTTP Range header value (video seeking). */
export async function getObject(key: string, range?: string | null): Promise<{ body: Buffer; status: number; contentRange?: string; total?: number } | null> {
  const k = safeKey(key);
  if (s3()) {
    const { url, headers } = signed("GET", k, null);
    const res = await fetch(url, { headers: range ? { ...headers, range } : headers });
    if (!res.ok && res.status !== 206) return null;
    return { body: Buffer.from(await res.arrayBuffer()), status: res.status, contentRange: res.headers.get("content-range") ?? undefined };
  }
  try {
    const buf = await fs.readFile(path.join(storageDir(), k));
    const m = range?.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      return { body: buf.subarray(start, end + 1), status: 206, contentRange: `bytes ${start}-${end}/${buf.length}`, total: buf.length };
    }
    return { body: buf, status: 200 };
  } catch {
    return null;
  }
}

/**
 * Presigned GET (SigV4 query auth) so browsers can fetch large objects straight from R2 —
 * Vercel functions can't return bodies over 4.5 MB. Returns null in local-disk mode.
 */
export function presignGet(key: string, expiresSec = 3600, downloadName?: string | null): string | null {
  const c = s3();
  if (!c) return null;
  const objectKey = `${(process.env.S3_PREFIX ?? "").replace(/^\/+/, "")}${safeKey(key)}`;
  const url = new URL(`${c.endpoint}/${c.bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.key}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(604800, Math.max(60, Math.round(expiresSec)))),
    "X-Amz-SignedHeaders": "host",
  };
  if (downloadName) q["response-content-disposition"] = `attachment; filename="${downloadName.replace(/[^\w.\- ]+/g, "_").slice(0, 100)}"`;
  const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join("&");
  const canonical = ["GET", url.pathname, query, `host:${url.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const kSig = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, day), c.region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSig).update(toSign).digest("hex");
  return `${url.origin}${url.pathname}?${query}&X-Amz-Signature=${signature}`;
}

/** Largest body a Vercel function may return (4.5 MB) minus headroom. */
export const MAX_INLINE_BYTES = 4 * 1024 * 1024;

/**
 * Read at most MAX_INLINE_BYTES of an object. `range` (an HTTP Range header) is clamped to that
 * window, so video seeking and chunked client downloads always fit in one function response.
 * `total` is the full object size.
 */
export async function getObjectWindow(key: string, range?: string | null): Promise<{ body: Buffer; start: number; end: number; total: number; partial: boolean } | null> {
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  let start = 0;
  let end = MAX_INLINE_BYTES - 1;
  if (m) {
    if (!m[1] && m[2]) {
      // Suffix range ("last N bytes") — resolve against the size first.
      const head = await getObject(key, "bytes=0-0");
      const size = head ? totalOf(head) : 0;
      if (!size) return null;
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = m[1] ? Number(m[1]) : 0;
      end = m[2] ? Number(m[2]) : start + MAX_INLINE_BYTES - 1;
    }
    end = Math.min(end, start + MAX_INLINE_BYTES - 1);
  }
  const obj = await getObject(key, `bytes=${start}-${end}`);
  if (!obj) return null;
  const total = totalOf(obj) || obj.body.length;
  return { body: obj.body, start, end: start + obj.body.length - 1, total, partial: Boolean(m) || obj.body.length < total };
}

function totalOf(obj: { contentRange?: string; total?: number; body: Buffer }) {
  const t = obj.contentRange?.match(/\/(\d+)$/)?.[1];
  return t ? Number(t) : (obj.total ?? 0);
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  return (await getObject(key))?.body ?? null;
}

export async function deleteObject(key: string): Promise<void> {
  const k = safeKey(key);
  if (s3()) {
    const { url, headers } = signed("DELETE", k, null);
    await fetch(url, { method: "DELETE", headers }).catch(() => {});
    return;
  }
  await fs.rm(path.join(storageDir(), k), { force: true }).catch(() => {});
}

export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `/api/files/${key}`;
}
