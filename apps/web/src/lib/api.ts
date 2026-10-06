"use client";

export type AssetDTO = {
  id: string;
  projectId: string;
  runId: string | null;
  parentId: string | null;
  kind: "upload" | "result" | "mask";
  media: "image" | "video";
  url: string;
  poster: string | null;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  name: string;
  hasSegments: boolean;
  shared: boolean;
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

export type ProjectDTO = { id: string; name: string; ownerId: string; studio: string; createdAt: string; updatedAt: string; lastOpenedAt: string; cover?: string | null; shared?: boolean };
export type Role = "owner" | "editor" | "viewer";
export type Me = { id: string; email: string; name: string; imageUrl: string | null; credits: number; onboarded: boolean; disabledModels: string[] };
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
  upload: (id: string, file: File | Blob, name?: string, runId?: string | null) => {
    const f = new FormData();
    f.append("file", file, name ?? (file as File).name ?? "upload.png");
    if (runId) f.append("runId", runId);
    return post<{ asset: AssetDTO }>(`/api/projects/${id}/uploads`, f);
  },
  saveEdit: (id: string, op: "crop" | "adjust" | "annotate", parentId: string | null, blob: Blob) => {
    const f = new FormData();
    f.append("file", blob, `${op}.png`);
    f.append("op", op);
    if (parentId) f.append("parentId", parentId);
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
  members: (id: string) => call<{ role: Role; owner: { name: string; email: string }; members: { email: string; role: "editor" | "viewer"; joined: boolean }[] }>(`/api/projects/${id}/members`),
  invite: (id: string, email: string, role: "editor" | "viewer") => post<{ members: { email: string; role: string; joined: boolean }[] }>(`/api/projects/${id}/members`, { email, role }),
  removeMember: (id: string, email: string) => call<{ members: { email: string; role: string; joined: boolean }[] }>(`/api/projects/${id}/members?email=${encodeURIComponent(email)}`, { method: "DELETE" }),
};

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
      const res = await fetch(f.url);
      const buf = new Uint8Array(await res.arrayBuffer());
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
