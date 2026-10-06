import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "./db/client";
import { assets, explorePosts, folders, projects, reviewBoards, reviewComments, type ProjectPrefs } from "./db/schema";
import { getAsset, getUser, HttpError, requireProject, reviewThread, serializeAsset } from "./data";
import { newId, shareToken } from "./ids";

/* ---------------- review boards ("Share for review") ---------------- */

export async function createReviewBoard(userId: string, projectId: string, assetIds: string[], title?: string) {
  await requireProject(projectId, userId, "edit");
  const ids = [...new Set(assetIds.filter((x) => /^ast_[a-z0-9]+$/.test(x)))].slice(0, 60);
  if (!ids.length) throw new HttpError(400, "Select at least one look to review");
  const rows = await db()
    .select({ id: assets.id })
    .from(assets)
    .where(and(inArray(assets.id, ids), eq(assets.projectId, projectId), isNull(assets.deletedAt)));
  if (rows.length !== ids.length) throw new HttpError(400, "Some selected looks no longer exist");
  const token = shareToken();
  const id = newId("shr").replace("shr_", "rvb_");
  await db().insert(reviewBoards).values({ id, token, projectId, createdBy: userId, title: (title ?? "").trim().slice(0, 120), assetIds: ids });
  return { id, token };
}

/** Boards for a project with per-board comment/approval counts (Review Mode panel). */
export async function listReviewBoards(userId: string, projectId: string) {
  await requireProject(projectId, userId, "view");
  const boards = await db().select().from(reviewBoards).where(eq(reviewBoards.projectId, projectId)).orderBy(desc(reviewBoards.createdAt)).limit(50);
  const allIds = [...new Set(boards.flatMap((b) => b.assetIds))];
  const counts = allIds.length
    ? await db()
        .select({
          assetId: reviewComments.assetId,
          comments: sql<number>`count(*) filter (where ${reviewComments.body} <> '')::int`,
          approvals: sql<number>`count(*) filter (where ${reviewComments.verdict} = 'approve')::int`,
          changes: sql<number>`count(*) filter (where ${reviewComments.verdict} = 'changes')::int`,
        })
        .from(reviewComments)
        .where(inArray(reviewComments.assetId, allIds))
        .groupBy(reviewComments.assetId)
    : [];
  const by = new Map(counts.map((c) => [c.assetId, c]));
  return boards.map((b) => ({
    id: b.id,
    token: b.token,
    title: b.title,
    assetIds: b.assetIds,
    createdAt: b.createdAt.toISOString(),
    closed: Boolean(b.closedAt),
    comments: b.assetIds.reduce((n, a) => n + (by.get(a)?.comments ?? 0), 0),
    approvals: b.assetIds.reduce((n, a) => n + (by.get(a)?.approvals ?? 0), 0),
    changes: b.assetIds.reduce((n, a) => n + (by.get(a)?.changes ?? 0), 0),
  }));
}

export async function closeReviewBoard(userId: string, boardId: string) {
  const [b] = await db().select().from(reviewBoards).where(eq(reviewBoards.id, boardId));
  if (!b) throw new HttpError(404, "Review not found");
  await requireProject(b.projectId, userId, "edit");
  await db().update(reviewBoards).set({ closedAt: new Date() }).where(eq(reviewBoards.id, boardId));
}

/** Public board view: looks + their threads. */
export async function reviewBoardByToken(token: string) {
  if (!/^[A-Za-z0-9]{22}$/.test(token)) return null;
  const [b] = await db().select().from(reviewBoards).where(eq(reviewBoards.token, token));
  if (!b || b.closedAt) return null;
  const rows = await db()
    .select()
    .from(assets)
    .where(and(inArray(assets.id, b.assetIds), isNull(assets.deletedAt)));
  const order = new Map(b.assetIds.map((id, i) => [id, i]));
  rows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
  const [project] = await db().select({ name: projects.name, ownerId: projects.ownerId }).from(projects).where(eq(projects.id, b.projectId));
  const owner = project ? await getUser(project.ownerId) : null;
  const looks = await Promise.all(rows.map(async (a) => ({ asset: serializeAsset(a), comments: await reviewThread(a.id) })));
  return { board: { title: b.title || project?.name || "Review", by: owner?.name ?? "", createdAt: b.createdAt.toISOString() }, looks };
}

export async function boardContainsAsset(token: string, assetId: string) {
  if (!/^[A-Za-z0-9]{22}$/.test(token)) return false;
  const [b] = await db().select({ ids: reviewBoards.assetIds, closedAt: reviewBoards.closedAt }).from(reviewBoards).where(eq(reviewBoards.token, token));
  return Boolean(b && !b.closedAt && b.ids.includes(assetId));
}

/* ---------------- Explore (community gallery) ---------------- */

export async function publishToExplore(userId: string, assetId: string, title?: string) {
  const a = await getAsset(assetId);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(a.projectId, userId, "edit");
  if (a.kind === "upload") throw new HttpError(400, "Only generated results can be published to Explore");
  const u = await getUser(userId);
  const existing = await db().select({ id: explorePosts.id }).from(explorePosts).where(eq(explorePosts.assetId, assetId));
  if (existing.length) {
    await db().update(explorePosts).set({ hiddenAt: null, title: (title ?? a.name).slice(0, 120) }).where(eq(explorePosts.assetId, assetId));
    return existing[0].id;
  }
  const id = newId("shr").replace("shr_", "exp_");
  await db().insert(explorePosts).values({ id, assetId, userId, title: (title ?? a.name).slice(0, 120), author: u?.name ?? "" });
  return id;
}

export async function unpublishFromExplore(userId: string, assetId: string) {
  const a = await getAsset(assetId);
  if (!a) throw new HttpError(404, "Image not found");
  await requireProject(a.projectId, userId, "edit");
  await db().update(explorePosts).set({ hiddenAt: new Date() }).where(eq(explorePosts.assetId, assetId));
}

export async function isPublished(assetId: string) {
  const r = await db().select({ id: explorePosts.id }).from(explorePosts).where(and(eq(explorePosts.assetId, assetId), isNull(explorePosts.hiddenAt)));
  return r.length > 0;
}

export async function listExplore(before?: string, limit = 30) {
  const rows = await db()
    .select({ post: explorePosts, asset: assets })
    .from(explorePosts)
    .innerJoin(assets, eq(assets.id, explorePosts.assetId))
    .where(and(isNull(explorePosts.hiddenAt), isNull(assets.deletedAt), before ? lt(explorePosts.createdAt, new Date(before)) : undefined))
    .orderBy(desc(explorePosts.createdAt))
    .limit(Math.min(60, limit));
  return rows.map((r) => ({ id: r.post.id, title: r.post.title, author: r.post.author, createdAt: r.post.createdAt.toISOString(), asset: serializeAsset(r.asset) }));
}

/* ---------------- folders ---------------- */

export async function listFolders(userId: string) {
  const rows = await db().select().from(folders).where(eq(folders.ownerId, userId)).orderBy(folders.name);
  return rows.map((f) => ({ id: f.id, name: f.name }));
}

export async function createFolder(userId: string, name: string) {
  const n = name.trim().slice(0, 60);
  if (!n) throw new HttpError(400, "Name the folder");
  const id = newId("shr").replace("shr_", "fld_");
  await db().insert(folders).values({ id, ownerId: userId, name: n });
  return { id, name: n };
}

export async function deleteFolder(userId: string, folderId: string) {
  await db().update(projects).set({ folderId: null }).where(and(eq(projects.folderId, folderId), eq(projects.ownerId, userId)));
  await db().delete(folders).where(and(eq(folders.id, folderId), eq(folders.ownerId, userId)));
}

export async function moveProjectToFolder(userId: string, projectId: string, folderId: string | null) {
  await requireProject(projectId, userId, "own");
  if (folderId) {
    const [f] = await db().select().from(folders).where(and(eq(folders.id, folderId), eq(folders.ownerId, userId)));
    if (!f) throw new HttpError(404, "Folder not found");
  }
  await db().update(projects).set({ folderId }).where(eq(projects.id, projectId));
}

/* ---------------- project preferences ---------------- */

const RES = ["1K", "2K", "4K"];
const VRES = ["720p", "1080p"];
const ASPECT = ["Auto", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2", "4:3", "5:4"];

export async function updateProjectPrefs(userId: string, projectId: string, raw: Record<string, unknown>) {
  const { project } = await requireProject(projectId, userId, "edit");
  const cur = project.preferences ?? {};
  const next: ProjectPrefs = { ...cur };
  if (typeof raw.description === "string") next.description = raw.description.trim().slice(0, 500);
  if (typeof raw.imageResolution === "string" && RES.includes(raw.imageResolution)) next.imageResolution = raw.imageResolution;
  if (typeof raw.videoResolution === "string" && VRES.includes(raw.videoResolution)) next.videoResolution = raw.videoResolution;
  if (typeof raw.aspect === "string" && ASPECT.includes(raw.aspect)) next.aspect = raw.aspect;
  if (typeof raw.autoDetect === "boolean") next.autoDetect = raw.autoDetect;
  await db().update(projects).set({ preferences: next }).where(eq(projects.id, projectId));
  return next;
}
