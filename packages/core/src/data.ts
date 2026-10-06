import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import { assets, creditLedger, projectMembers, projects, reviewComments, runs, users, type AssetRow, type ProjectRow, type RunRow, type UserRow } from "./db/schema";
import { newId } from "./ids";
import { deleteObject, fileUrl } from "./storage";
import { runLabel, toolById } from "./tools/registry";

export const SIGNUP_CREDITS = () => Number(process.env.FASHION_SIGNUP_CREDITS ?? 200);

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/* ---------------- users ---------------- */

export const isGuest = (userId: string) => userId.startsWith("guest_");

export async function ensureUser(id: string, profile: { email?: string; name?: string; imageUrl?: string | null }): Promise<UserRow> {
  const d = db();
  const [row] = await d
    .insert(users)
    .values({ id, email: profile.email ?? "", name: profile.name ?? "", imageUrl: profile.imageUrl ?? null, credits: isGuest(id) ? 0 : SIGNUP_CREDITS() })
    .onConflictDoNothing()
    .returning();
  if (row) {
    await d.insert(creditLedger).values({ id: newId("led"), userId: id, delta: row.credits, reason: "signup" });
  } else if (profile.email || profile.name) {
    await d
      .update(users)
      .set({ ...(profile.email ? { email: profile.email } : {}), ...(profile.name ? { name: profile.name } : {}), ...(profile.imageUrl ? { imageUrl: profile.imageUrl } : {}) })
      .where(eq(users.id, id));
  }
  // Claim pending project invites sent to this email.
  if (profile.email) {
    await d
      .update(projectMembers)
      .set({ userId: id })
      .where(and(eq(projectMembers.email, profile.email.toLowerCase()), isNull(projectMembers.userId)));
  }
  return (await d.query.users.findFirst({ where: eq(users.id, id) }))!;
}

/** Move a signed-out demo guest's work into the account they just created. Returns the latest project id. */
export async function claimGuest(guestId: string, userId: string): Promise<string | null> {
  if (!isGuest(guestId) || isGuest(userId)) return null;
  const d = db();
  const moved = await d.update(projects).set({ ownerId: userId, name: "Fashion Studio tour" }).where(eq(projects.ownerId, guestId)).returning({ id: projects.id });
  await d.update(runs).set({ userId }).where(eq(runs.userId, guestId));
  await d.update(assets).set({ userId }).where(eq(assets.userId, guestId));
  await d.update(users).set({ onboarded: true }).where(eq(users.id, userId));
  await d.delete(users).where(eq(users.id, guestId));
  return moved[0]?.id ?? null;
}

export async function getUser(id: string) {
  return db().query.users.findFirst({ where: eq(users.id, id) });
}

export async function updateUserSettings(id: string, patch: { onboarded?: boolean; disabledModels?: string[] }) {
  const u = await getUser(id);
  if (!u) throw new HttpError(404, "User not found");
  await db()
    .update(users)
    .set({
      ...(patch.onboarded !== undefined ? { onboarded: patch.onboarded } : {}),
      ...(patch.disabledModels ? { settings: { ...u.settings, disabledModels: patch.disabledModels } } : {}),
    })
    .where(eq(users.id, id));
  return getUser(id);
}

/** Atomically spend credits; false when the balance is too low. */
export async function debitCredits(userId: string, amount: number, reason: string, runId?: string): Promise<boolean> {
  if (amount <= 0) return true;
  const d = db();
  const rows = await d
    .update(users)
    .set({ credits: sql`${users.credits} - ${amount}` })
    .where(and(eq(users.id, userId), sql`${users.credits} >= ${amount}`))
    .returning({ credits: users.credits });
  if (!rows.length) return false;
  await d.insert(creditLedger).values({ id: newId("led"), userId, delta: -amount, reason, runId });
  return true;
}

export async function refundCredits(userId: string, amount: number, reason: string, runId?: string) {
  if (amount <= 0) return;
  const d = db();
  await d.update(users).set({ credits: sql`${users.credits} + ${amount}` }).where(eq(users.id, userId));
  await d.insert(creditLedger).values({ id: newId("led"), userId, delta: amount, reason, runId });
}

export async function ledger(userId: string, limit = 30) {
  const rows = await db().select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, delta: r.delta, reason: r.reason, runId: r.runId, createdAt: r.createdAt.toISOString() }));
}

/* ---------------- projects & access ---------------- */

export type Role = "owner" | "editor" | "viewer";

export async function projectRole(projectId: string, userId: string): Promise<{ project: ProjectRow; role: Role } | null> {
  const d = db();
  const project = await d.query.projects.findFirst({ where: and(eq(projects.id, projectId), isNull(projects.deletedAt)) });
  if (!project) return null;
  if (project.ownerId === userId) return { project, role: "owner" };
  const m = await d.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)) });
  return m ? { project, role: m.role } : null;
}

export async function requireProject(projectId: string, userId: string, need: "view" | "edit" | "own" = "view") {
  const r = await projectRole(projectId, userId);
  if (!r) throw new HttpError(404, "Project not found");
  if (need === "edit" && r.role === "viewer") throw new HttpError(403, "You have view-only access to this project");
  if (need === "own" && r.role !== "owner") throw new HttpError(403, "Only the project owner can do that");
  return r;
}

export async function listProjects(userId: string, q?: string) {
  const d = db();
  const shared = await d.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId));
  const ids = shared.map((s) => s.id);
  const rows = await d
    .select()
    .from(projects)
    .where(and(isNull(projects.deletedAt), ids.length ? or(eq(projects.ownerId, userId), inArray(projects.id, ids)) : eq(projects.ownerId, userId)))
    .orderBy(desc(projects.lastOpenedAt))
    .limit(200);
  const filtered = q ? rows.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : rows;
  // Cover image: newest image asset per project.
  const covers = filtered.length
    ? await d
        .selectDistinctOn([assets.projectId], { projectId: assets.projectId, key: assets.storageKey, preview: assets.previewKey, poster: assets.posterKey, media: assets.media })
        .from(assets)
        .where(and(inArray(assets.projectId, filtered.map((p) => p.id)), isNull(assets.deletedAt), inArray(assets.kind, ["upload", "result"])))
        .orderBy(assets.projectId, desc(assets.createdAt))
    : [];
  const coverBy = new Map(covers.map((c) => [c.projectId, fileUrl(c.media === "video" ? c.poster ?? c.key : c.preview ?? c.key)]));
  return filtered.map((p) => ({ ...serializeProject(p), cover: coverBy.get(p.id) ?? null, shared: p.ownerId !== userId }));
}

export async function nextProjectName(userId: string) {
  const rows = await db().select({ name: projects.name }).from(projects).where(eq(projects.ownerId, userId));
  let n = rows.length + 1;
  const names = new Set(rows.map((r) => r.name));
  while (names.has(`Project ${n}`)) n++;
  return `Project ${n}`;
}

export async function createProject(userId: string, name?: string) {
  const [p] = await db()
    .insert(projects)
    .values({ id: newId("prj"), ownerId: userId, name: name?.trim() || (await nextProjectName(userId)) })
    .returning();
  return p;
}

/** The studio card's default action: most recent project, or a fresh one on first visit. */
export async function openLatestProject(userId: string) {
  const [latest] = await listProjects(userId);
  if (latest) return latest.id;
  return (await createProject(userId)).id;
}

export async function touchProject(projectId: string) {
  await db().update(projects).set({ lastOpenedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function renameProject(projectId: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new HttpError(400, "Name can't be empty");
  await db().update(projects).set({ name: clean, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function deleteProject(projectId: string) {
  await db().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
}

export function serializeProject(p: ProjectRow) {
  return { id: p.id, name: p.name, ownerId: p.ownerId, studio: p.studio, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), lastOpenedAt: p.lastOpenedAt.toISOString() };
}

/* ---------------- members ---------------- */

export async function listMembers(projectId: string) {
  const d = db();
  const rows = await d.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)).orderBy(asc(projectMembers.createdAt));
  return rows.map((m) => ({ email: m.email, role: m.role, joined: Boolean(m.userId) }));
}

export async function inviteMember(projectId: string, invitedBy: string, email: string, role: "editor" | "viewer") {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, "Enter a valid email");
  const d = db();
  const existing = await d.query.users.findFirst({ where: eq(sql`lower(${users.email})`, e) });
  await d
    .insert(projectMembers)
    .values({ projectId, email: e, role, invitedBy, userId: existing?.id ?? null })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.email], set: { role } });
}

export async function removeMember(projectId: string, email: string) {
  await db().delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.email, email.toLowerCase())));
}

/* ---------------- assets ---------------- */

export function serializeAsset(a: AssetRow) {
  return {
    id: a.id,
    projectId: a.projectId,
    runId: a.runId,
    parentId: a.parentId,
    kind: a.kind,
    media: a.media,
    /** Display URL: the light preview when there is one, else the master. */
    url: fileUrl(a.previewKey ?? a.storageKey)!,
    /** The master file — exactly what was uploaded or generated. Use for downloads and hand-offs. */
    originalUrl: fileUrl(a.storageKey)!,
    poster: fileUrl(a.posterKey),
    sha256: a.meta?.sha256 ?? null,
    fidelity: a.meta?.fidelity ?? null,
    colorDelta: a.meta?.colorDelta ?? null,
    mime: a.mime,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    name: a.name,
    hasSegments: Boolean(a.segments?.length),
    shared: Boolean(a.shareToken),
    marked: a.marked,
    saved: a.saved,
    createdAt: a.createdAt.toISOString(),
  };
}
export type AssetDTO = ReturnType<typeof serializeAsset>;

export async function getAsset(id: string) {
  return db().query.assets.findFirst({ where: and(eq(assets.id, id), isNull(assets.deletedAt)) });
}

export async function insertAsset(v: typeof assets.$inferInsert) {
  const [row] = await db().insert(assets).values(v).returning();
  return row;
}

export async function assetByShareToken(token: string) {
  if (!/^[A-Za-z0-9]{22}$/.test(token)) return null;
  return db().query.assets.findFirst({ where: and(eq(assets.shareToken, token), isNull(assets.deletedAt)) });
}

export async function reviewThread(assetId: string) {
  const rows = await db().select().from(reviewComments).where(eq(reviewComments.assetId, assetId)).orderBy(asc(reviewComments.createdAt)).limit(200);
  return rows.map((r) => ({ id: r.id, author: r.author, body: r.body, verdict: r.verdict, createdAt: r.createdAt.toISOString() }));
}

export async function addReview(assetId: string, author: string, body: string, verdict: "approve" | "changes" | null) {
  const a = author.trim().slice(0, 60) || "Reviewer";
  const b = body.trim().slice(0, 2000);
  if (!b && !verdict) throw new HttpError(400, "Write a comment or choose a verdict");
  const count = await db().select({ id: reviewComments.id }).from(reviewComments).where(eq(reviewComments.assetId, assetId));
  if (count.length >= 200) throw new HttpError(429, "This review thread is full");
  await db().insert(reviewComments).values({ id: newId("shr").replace("shr_", "rev_"), assetId, author: a, body: b, verdict });
}

export async function deleteAsset(id: string) {
  await db().update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, id));
}

/* ---------------- runs ---------------- */

export function serializeRun(r: RunRow, outputs: AssetRow[]) {
  const tool = toolById(r.tool);
  return {
    id: r.id,
    projectId: r.projectId,
    userId: r.userId,
    tool: r.tool,
    toolName: runLabel(r.tool),
    status: r.status,
    inputs: r.inputs,
    settings: r.settings,
    cost: r.cost,
    model: r.model,
    expected: r.expected,
    media: tool?.media ?? "image",
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    outputs: outputs.map(serializeAsset),
  };
}
export type RunDTO = ReturnType<typeof serializeRun>;

/** A project's feed: runs newest first with their outputs. */
export async function projectFeed(projectId: string, opts: { limit?: number; before?: string } = {}) {
  const d = db();
  const limit = Math.min(opts.limit ?? 60, 200);
  const rows = await d
    .select()
    .from(runs)
    .where(and(eq(runs.projectId, projectId), isNull(runs.deletedAt), opts.before ? lt(runs.createdAt, new Date(opts.before)) : undefined))
    .orderBy(desc(runs.createdAt))
    .limit(limit);
  const outs = rows.length
    ? await d
        .select()
        .from(assets)
        .where(and(inArray(assets.runId, rows.map((r) => r.id)), isNull(assets.deletedAt), inArray(assets.kind, ["upload", "result"])))
        .orderBy(asc(assets.createdAt))
    : [];
  const by = new Map<string, AssetRow[]>();
  for (const a of outs) by.set(a.runId!, [...(by.get(a.runId!) ?? []), a]);
  return rows.map((r) => serializeRun(r, by.get(r.id) ?? [])).filter((r) => r.outputs.length > 0 || r.status !== "succeeded");
}

export async function getRun(id: string) {
  return db().query.runs.findFirst({ where: and(eq(runs.id, id), isNull(runs.deletedAt)) });
}

export async function runWithOutputs(id: string) {
  const r = await getRun(id);
  if (!r) return null;
  const outs = await db()
    .select()
    .from(assets)
    .where(and(eq(assets.runId, id), isNull(assets.deletedAt), inArray(assets.kind, ["upload", "result"])))
    .orderBy(asc(assets.createdAt));
  return serializeRun(r, outs);
}

export async function deleteRun(id: string) {
  const d = db();
  await d.update(runs).set({ deletedAt: new Date() }).where(eq(runs.id, id));
  await d.update(assets).set({ deletedAt: new Date() }).where(eq(assets.runId, id));
}

/** Hard-delete storage for soft-deleted assets older than a day (worker housekeeping). */
export async function purgeDeleted(limit = 100) {
  const d = db();
  const old = await d
    .select()
    .from(assets)
    .where(lt(assets.deletedAt, new Date(Date.now() - 24 * 3600_000)))
    .limit(limit);
  for (const a of old) {
    await deleteObject(a.storageKey);
    if (a.previewKey) await deleteObject(a.previewKey);
    if (a.posterKey?.includes("/previews/")) await deleteObject(a.posterKey);
    await d.delete(assets).where(eq(assets.id, a.id));
  }
  return old.length;
}
