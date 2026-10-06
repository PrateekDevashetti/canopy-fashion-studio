"use client";

export type AssetDTO = {
  id: string;
  projectId: string;
  runId: string | null;
  parentId: string | null;
  kind: "upload" | "result" | "mask";
  media: "image" | "video";
  /** Display URL (light preview when the master is large). */
  url: string;
  /** The master — exactly the uploaded/generated file. */
  originalUrl: string;
  poster: string | null;
  sha256: string | null;
  fidelity: number | null;
  colorDelta: number | null;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  name: string;
  hasSegments: boolean;
  shared: boolean;
  marked: boolean;
  saved: boolean;
  createdAt: string;
};

export type RunDTO = {
  id: string;
  projectId: string;
  userId: string;
  tool: string;
  toolName: string;
  status: "queued" | "running" | "succeeded" | "failed";
  inputs: Record<string, unknown>;
  settings: { resolution?: string; aspect?: string };
  cost: number;
  model: string;
  expected: number;
  media: "image" | "video";
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  outputs: AssetDTO[];
  /** Client-only: optimistic placeholder before the server answers. */
  optimistic?: boolean;
};

export type ProjectPrefs = { description?: string; imageResolution?: string; videoResolution?: string; aspect?: string };
export type ProjectDTO = { id: string; name: string; ownerId: string; studio: string; folderId?: string | null; preferences?: ProjectPrefs; createdAt: string; updatedAt: string; lastOpenedAt: string; cover?: string | null; shared?: boolean };
export type Role = "owner" | "editor" | "viewer";
export type Me = { id: string; email: string; name: string; imageUrl: string | null; credits: number; onboarded: boolean; disabledModels: string[]; guest?: boolean };
export type SegmentDTO = { id: string; label: string; box: [number, number, number, number]; maskKey: string; maskUrl: string; area: number };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError(0, "You're offline — check your connection.");
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`;
    if (res.status === 403 && data?.code === "SIGNUP_REQUIRED" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fs:signup"));
      throw new ApiError(403, "");
    }
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export const api = {
  me: () => call<Me>("/api/me"),
  updateMe: (b: Partial<Pick<Me, "onboarded" | "disabledModels">>) => call<Me>("/api/me", { method: "PATCH", body: JSON.stringify(b) }),
  projects: (q?: string) => call<{ projects: ProjectDTO[] }>(`/api/projects${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  createProject: (name?: string) => post<{ project: ProjectDTO }>("/api/projects", { name }),
  project: (id: string) => call<{ project: ProjectDTO; role: Role }>(`/api/projects/${id}`),
  renameProject: (id: string, name: string) => call<{ project: ProjectDTO; role: Role }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => call<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),
  feed: (id: string) => call<{ runs: RunDTO[] }>(`/api/projects/${id}/feed`),
  upload: (id: string, file: File | Blob, name?: string, runId?: string | null) => uploadFile(id, file, name ?? (file as File).name ?? "upload.png", runId ?? null),
  saveEdit: (id: string, parentId: string, edit: { op: "crop"; crop: { cx: number; cy: number; w: number; h: number; rot: number } } | { op: "adjust"; adjust: Record<string, number> }) =>
    post<{ asset: AssetDTO }>(`/api/projects/${id}/edits`, { parentId, ...edit }),
  saveAnnotation: (id: string, parentId: string, overlay: Blob) => {
    const f = new FormData();
    f.append("op", "annotate");
    f.append("parentId", parentId);
    f.append("overlay", overlay, "overlay.png");
    return post<{ asset: AssetDTO }>(`/api/projects/${id}/edits`, f);
  },
  saveMask: (id: string, blob: Blob) => {
    const f = new FormData();
    f.append("file", blob, "mask.png");
    return post<{ key: string }>(`/api/projects/${id}/masks`, f);
  },
  createRun: (id: string, tool: string, inputs: Record<string, unknown>, settings: { resolution?: string; aspect?: string }) =>
    post<{ run: RunDTO }>(`/api/projects/${id}/runs`, { tool, inputs, settings }),
  run: (id: string) => call<{ run: RunDTO }>(`/api/runs/${id}`),
  deleteRun: (id: string) => call<{ ok: true }>(`/api/runs/${id}`, { method: "DELETE" }),
  asset: (id: string) =>
    call<{ asset: AssetDTO; segments: SegmentDTO[]; run: { id: string; tool: string; model: string; inputs: Record<string, unknown>; settings: Record<string, string>; durationMs: number | null; createdAt: string } | null }>(`/api/assets/${id}`),
  renameAsset: (id: string, name: string) => call<{ asset: AssetDTO }>(`/api/assets/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteAsset: (id: string) => call<{ ok: true }>(`/api/assets/${id}`, { method: "DELETE" }),
  detect: (id: string, refresh = false) => post<{ segments: SegmentDTO[] }>(`/api/assets/${id}/detect${refresh ? "?refresh=1" : ""}`),
  share: (id: string) => post<{ url: string }>(`/api/assets/${id}/share`),
  unshare: (id: string) => call<{ ok: true }>(`/api/assets/${id}/share`, { method: "DELETE" }),
  tourStepCall: (id: string, step: string, parentId?: string) => post<{ runs: RunDTO[] }>(`/api/projects/${id}/tour`, { step, parentId }),
  members: (id: string) => call<{ role: Role; owner: { name: string; email: string }; members: { email: string; role: "editor" | "viewer"; joined: boolean }[] }>(`/api/projects/${id}/members`),
  invite: (id: string, email: string, role: "editor" | "viewer") => post<{ members: { email: string; role: string; joined: boolean }[] }>(`/api/projects/${id}/members`, { email, role }),
  removeMember: (id: string, email: string) => call<{ members: { email: string; role: string; joined: boolean }[] }>(`/api/projects/${id}/members?email=${encodeURIComponent(email)}`, { method: "DELETE" }),

  // Review boards ("Share for review")
  reviews: (id: string) => call<{ boards: ReviewBoardDTO[] }>(`/api/projects/${id}/reviews`),
  createReview: (id: string, assetIds: string[], title?: string) => post<{ url: string; token: string }>(`/api/projects/${id}/reviews`, { assetIds, title }),
  closeReview: (boardId: string) => call<{ ok: true }>(`/api/reviews/${boardId}`, { method: "DELETE" }),

  // Explore
  explore: (before?: string) => call<{ posts: ExplorePostDTO[] }>(`/api/explore${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  explorePublished: (assetId: string) => call<{ published: boolean }>(`/api/assets/${assetId}/explore`),
  publish: (assetId: string, title?: string) => post<{ published: boolean }>(`/api/assets/${assetId}/explore`, { title }),
  unpublish: (assetId: string) => call<{ published: boolean }>(`/api/assets/${assetId}/explore`, { method: "DELETE" }),

  // Folders & preferences
  folders: () => call<{ folders: { id: string; name: string }[] }>(`/api/folders`),
  createFolder: (name: string) => post<{ folder: { id: string; name: string } }>(`/api/folders`, { name }),
  deleteFolder: (folderId: string) => call<{ ok: true }>(`/api/folders/${folderId}`, { method: "DELETE" }),
  moveProject: (id: string, folderId: string | null) => call<{ ok: true }>(`/api/projects/${id}/folder`, { method: "PUT", body: JSON.stringify({ folderId }) }),
  updatePrefs: (id: string, prefs: Record<string, unknown>) => call<{ preferences: Record<string, unknown> }>(`/api/projects/${id}/preferences`, { method: "PATCH", body: JSON.stringify(prefs) }),

  // Canvas picker
  canvases: (id: string) => call<{ canvases: { id: string; name: string; thumbnailUrl: string | null; updatedAt: string | null }[] }>(`/api/projects/${id}/canvas`),

  // Library sources
  library: (source: "assets" | "elements" | "history", before?: string) => call<{ assets: AssetDTO[] }>(`/api/library?source=${source}${before ? `&before=${encodeURIComponent(before)}` : ""}`),
  stock: (q: string, page = 1) => call<{ provider: string; photos: StockPhotoDTO[] }>(`/api/stock?q=${encodeURIComponent(q)}&page=${page}`),
  importAsset: (id: string, assetId: string) => post<{ asset: AssetDTO }>(`/api/projects/${id}/import`, { assetId }),
  importUrl: (id: string, url: string, name?: string) => post<{ asset: AssetDTO }>(`/api/projects/${id}/import`, { url, name }),

  // Shopify
  shopify: () => call<{ connected: boolean; shop?: string; name?: string }>(`/api/shopify`),
  connectShopify: (shop: string, token: string) => call<{ connected: boolean; shop: string; name: string }>(`/api/shopify`, { method: "PUT", body: JSON.stringify({ shop, token }) }),
  disconnectShopify: () => call<{ connected: boolean }>(`/api/shopify`, { method: "DELETE" }),
  exportShopify: (projectId: string, assetIds: string[], title: string, description?: string) =>
    post<{ productId: string; adminUrl: string; media: number }>(`/api/shopify/export`, { projectId, assetIds, title, description }),
};

export type ReviewBoardDTO = { id: string; token: string; title: string; assetIds: string[]; createdAt: string; closed: boolean; comments: number; approvals: number; changes: number };
export type ExplorePostDTO = { id: string; title: string; author: string; createdAt: string; asset: AssetDTO };
export type StockPhotoDTO = { id: string; title: string; author: string; thumb: string; full: string; link: string; license: string };

/** "Just now", "3m ago", "18h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(filename)}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const fileName = (a: Pick<AssetDTO, "name" | "mime" | "id">) =>
  `${(a.name || a.id).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || a.id}.${a.mime.split("/")[1]?.replace("jpeg", "jpg").replace("quicktime", "mov") ?? "png"}`;

/** Zip several files client-side and download (feed batch download, run download). */
export async function downloadZip(files: { url: string; name: string }[], zipName: string) {
  const { zip } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  const seen = new Map<string, number>();
  await Promise.all(
    files.map(async (f) => {
      const buf = await fetchFileBytes(f.url);
      const n = seen.get(f.name) ?? 0;
      seen.set(f.name, n + 1);
      entries[n ? f.name.replace(/(\.[a-z0-9]+)$/i, `-${n + 1}$1`) : f.name] = buf;
    }),
  );
  const data = await new Promise<Uint8Array>((resolve, reject) => zip(entries, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))));
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------------- uploads ---------------- */

/** Matches the server: Vercel caps request bodies at 4.5 MB, so larger files go up in 4 MB chunks. */
const CHUNK = 4 * 1024 * 1024;

async function sha256Hex(blob: Blob): Promise<string | undefined> {
  try {
    const d = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined; // insecure context — the server still validates the image
  }
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw last;
}

/** Upload a file byte-for-byte (the server stores it unmodified). */
async function uploadFile(projectId: string, file: Blob, name: string, runId: string | null): Promise<{ asset: AssetDTO }> {
  if (file.size <= CHUNK) {
    const f = new FormData();
    f.append("file", file, name);
    if (runId) f.append("runId", runId);
    return withRetry(() => post<{ asset: AssetDTO }>(`/api/projects/${projectId}/uploads`, f));
  }
  const uploadId = `upl_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("")}`;
  const chunks = Math.ceil(file.size / CHUNK);
  const hash = sha256Hex(file);
  // Up to 3 chunks in flight.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks) }, async () => {
      while (next < chunks) {
        const index = next++;
        const f = new FormData();
        f.append("uploadId", uploadId);
        f.append("index", String(index));
        f.append("chunk", file.slice(index * CHUNK, Math.min(file.size, (index + 1) * CHUNK)), `${index}`);
        await withRetry(() => post<{ ok: true }>(`/api/projects/${projectId}/uploads`, f));
      }
    }),
  );
  return withRetry(async () => post<{ asset: AssetDTO }>(`/api/projects/${projectId}/uploads`, { uploadId, chunks, name, type: file.type, sha256: await hash, runId }));
}

/** Fetch a stored file in ≤4 MB ranges (same-origin; works for files of any size). */
export async function fetchFileBytes(url: string): Promise<Uint8Array> {
  const first = await fetch(url, { headers: { range: `bytes=0-${CHUNK - 1}` } });
  if (!first.ok) throw new Error(`Download failed (${first.status})`);
  const head = new Uint8Array(await first.arrayBuffer());
  const total = Number(first.headers.get("content-range")?.match(/\/(\d+)$/)?.[1] ?? head.length);
  if (first.status !== 206 || total <= head.length) return head;
  const out = new Uint8Array(total);
  out.set(head, 0);
  const starts: number[] = [];
  for (let s = head.length; s < total; s += CHUNK) starts.push(s);
  await Promise.all(
    starts.map(async (s) => {
      const r = await fetch(url, { headers: { range: `bytes=${s}-${Math.min(total, s + CHUNK) - 1}` } });
      if (r.status !== 206) throw new Error(`Download failed (${r.status})`);
      out.set(new Uint8Array(await r.arrayBuffer()), s);
    }),
  );
  return out;
}
