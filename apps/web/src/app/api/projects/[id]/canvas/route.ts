import crypto from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, fileUrl, HttpError, requireProject, schema } from "@fashion/core";
import { body, json, route } from "@/lib/http";
import { clerkEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const CANVAS_APP = () => (process.env.CANOPY_APP_URL ?? "https://app.trycanopy.space").replace(/\/$/, "");
const CANVAS_API = () => (process.env.CANOPY_API_URL ?? "https://api.trycanopy.space").replace(/\/$/, "");

/** Your Canopy canvases, for the "Open in Canvas" picker. Empty when the canvas can't be reached. */
export const GET = route<Ctx>(async (_req, user, { params }) => {
  await requireProject((await params).id, user.id);
  if (!clerkEnabled || user.guest) return json({ canvases: [] });
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const token = await (await auth()).getToken();
    if (!token) return json({ canvases: [] });
    const res = await fetch(`${CANVAS_API()}/api/projects`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return json({ canvases: [] });
    const j = (await res.json()) as { projects?: { id: string; name: string; thumbnailUrl?: string | null; updatedAt?: string }[] };
    return json({ canvases: (j.projects ?? []).slice(0, 100).map((p) => ({ id: p.id, name: p.name, thumbnailUrl: p.thumbnailUrl ?? null, updatedAt: p.updatedAt ?? null })) });
  } catch {
    return json({ canvases: [] });
  }
});

/**
 * Open in Canvas: create a Canopy canvas project with each result as an image node (same Clerk
 * session as the canvas), then hand back its URL. Falls back to the canvas home + a download when
 * the canvas API can't be reached with this session.
 */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const { project } = await requireProject(id, user.id);
  const b = await body<{ assetIds?: string[]; canvasId?: string }>(req);
  const ids = (b.assetIds ?? []).filter((x) => typeof x === "string").slice(0, 50);
  if (!ids.length) throw new HttpError(400, "Pick at least one result");
  const rows = await db()
    .select()
    .from(schema.assets)
    .where(and(inArray(schema.assets.id, ids), eq(schema.assets.projectId, id), isNull(schema.assets.deletedAt)));
  if (!rows.length) throw new HttpError(404, "Results not found");

  const origin = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") ? process.env.NEXT_PUBLIC_APP_URL : new URL(req.url).origin;
  const cols = Math.ceil(Math.sqrt(rows.length));
  const nodes = rows.map((a, i) => {
    const url = `${origin}${fileUrl(a.storageKey)}`;
    const nodeId = crypto.randomUUID();
    return {
      id: nodeId,
      type: "gen",
      position: { x: (i % cols) * 380, y: Math.floor(i / cols) * 460 },
      data: {
        kind: "upload",
        label: a.name || "Fashion Studio",
        status: "done",
        uploading: false,
        output: { type: a.media, url, publicUrl: url, storage: "fashion-studio", width: a.width, height: a.height },
        thumbnailSourceType: "upload",
        thumbnailSourceId: url,
        thumbnailUrl: a.media === "video" && a.posterKey ? `${origin}${fileUrl(a.posterKey)}` : url,
        thumbnailTitle: a.name,
      },
    };
  });

  if (clerkEnabled && !user.guest) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const token = await (await auth()).getToken();
      // Append to an existing canvas: fetch its graph, place the new nodes to the right, save with
      // the revision we read (the canvas API rejects the write if someone edited in between).
      if (token && typeof b.canvasId === "string" && /^[0-9a-f-]{36}$/i.test(b.canvasId)) {
        const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
        const cur = await fetch(`${CANVAS_API()}/api/projects/${b.canvasId}`, { headers, signal: AbortSignal.timeout(12_000) });
        if (!cur.ok) throw new HttpError(cur.status === 404 ? 404 : 502, "Couldn't open that canvas");
        const p = (await cur.json()) as { graph?: { nodes?: { position?: { x: number; y: number } }[]; edges?: unknown[] }; revision?: number };
        const existing = p.graph?.nodes ?? [];
        const maxX = existing.reduce((m, n) => Math.max(m, n.position?.x ?? 0), 0);
        const offset = existing.length ? maxX + 520 : 0;
        const graph = { ...(p.graph ?? {}), nodes: [...existing, ...nodes.map((n) => ({ ...n, position: { x: n.position.x + offset, y: n.position.y } }))], edges: p.graph?.edges ?? [] };
        const res = await fetch(`${CANVAS_API()}/api/projects/${b.canvasId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ graph, ...(typeof p.revision === "number" ? { baseRevision: p.revision } : {}) }),
          signal: AbortSignal.timeout(12_000),
        });
        if (res.ok) return json({ url: `${CANVAS_APP()}/project/${b.canvasId}` });
        throw new HttpError(res.status === 409 ? 409 : 502, res.status === 409 ? "That canvas just changed — try again" : "Couldn't add to that canvas");
      }
      if (token) {
        const canvasId = crypto.randomUUID();
        const res = await fetch(`${CANVAS_API()}/api/projects/import`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", "X-Request-Id": crypto.randomUUID() },
          body: JSON.stringify({ projects: [{ id: canvasId, name: `${project.name} — Fashion Studio`, graph: { nodes, edges: [] } }] }),
          signal: AbortSignal.timeout(12_000),
        });
        const j = (await res.json().catch(() => ({}))) as { imported?: number };
        if (res.ok && j.imported) return json({ url: `${CANVAS_APP()}/project/${canvasId}` });
        console.warn(`[canvas] import ${res.status}`);
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.warn("[canvas] import failed:", (e as Error).message);
    }
  }
  return json({ url: CANVAS_APP(), fallback: "Opened the Canopy canvas — your results are downloading so you can drop them in.", download: rows.map((a) => fileUrl(a.storageKey)) });
});
