/**
 * Live check against the running app: upload a small and a large (chunked) image, download the
 * originals back (ranged, as the client does), and compare sha256. node --import tsx qa/exact-upload.mts
 */
import crypto from "node:crypto";
import sharp from "sharp";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const CHUNK = 4 * 1024 * 1024;
const sha = (b: Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");

async function noisy(w: number, h: number, fmt: "jpeg" | "png") {
  const raw = crypto.randomBytes(w * h * 3);
  const img = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
  return fmt === "jpeg" ? img.jpeg({ quality: 95 }).toBuffer() : img.png().toBuffer();
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(BASE + path, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

async function upload(pid: string, buf: Buffer, name: string, type: string) {
  if (buf.length <= CHUNK) {
    const f = new FormData();
    f.append("file", new Blob([buf], { type }), name);
    return (await api(`/api/projects/${pid}/uploads`, { method: "POST", body: f })).asset;
  }
  const uploadId = `upl_${crypto.randomBytes(8).toString("hex")}`;
  const chunks = Math.ceil(buf.length / CHUNK);
  for (let i = 0; i < chunks; i++) {
    const f = new FormData();
    f.append("uploadId", uploadId);
    f.append("index", String(i));
    f.append("chunk", new Blob([buf.subarray(i * CHUNK, (i + 1) * CHUNK)]), String(i));
    await api(`/api/projects/${pid}/uploads`, { method: "POST", body: f });
  }
  return (await api(`/api/projects/${pid}/uploads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploadId, chunks, name, type, sha256: sha(buf) }) })).asset;
}

async function download(url: string) {
  const first = await fetch(BASE + url, { headers: { range: `bytes=0-${CHUNK - 1}` } });
  const head = new Uint8Array(await first.arrayBuffer());
  const total = Number(first.headers.get("content-range")?.match(/\/(\d+)$/)?.[1] ?? head.length);
  const out = new Uint8Array(total);
  out.set(head);
  for (let s = head.length; s < total; s += CHUNK) {
    const r = await fetch(BASE + url, { headers: { range: `bytes=${s}-${Math.min(total, s + CHUNK) - 1}` } });
    out.set(new Uint8Array(await r.arrayBuffer()), s);
  }
  return out;
}

const { project } = await api("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "QA exact upload" }) });
const cases = [
  { name: "small.jpg", type: "image/jpeg", buf: await noisy(900, 1200, "jpeg") },
  { name: "large.png", type: "image/png", buf: await noisy(2400, 3000, "png") },
];
let ok = true;
for (const c of cases) {
  const a = await upload(project.id, c.buf, c.name, c.type);
  const back = await download(a.originalUrl);
  const same = sha(back) === sha(c.buf);
  const whole = await fetch(BASE + a.originalUrl, { redirect: "manual" });
  ok &&= same && a.sha256 === sha(c.buf);
  console.log(JSON.stringify({ file: c.name, bytes: c.buf.length, chunked: c.buf.length > CHUNK, identical: same, shaRecorded: a.sha256 === sha(c.buf), preview: a.url !== a.originalUrl, wholeFileStatus: whole.status }));
}
await api(`/api/projects/${project.id}`, { method: "DELETE" });
process.exit(ok ? 0 : 1);
