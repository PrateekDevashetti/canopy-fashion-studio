import { pgTable, text, integer, timestamp, jsonb, boolean, index, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().default(""),
  name: text("name").notNull().default(""),
  imageUrl: text("image_url"),
  credits: integer("credits").notNull().default(200),
  onboarded: boolean("onboarded").notNull().default(false),
  /** Workspace settings: { disabledModels: ModelId[] } */
  settings: jsonb("settings").$type<{ disabledModels?: string[] }>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    studio: text("studio").notNull().default("fashion"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("projects_owner_idx").on(t.ownerId, t.lastOpenedAt)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    email: text("email").notNull(),
    userId: text("user_id"),
    role: text("role").$type<"editor" | "viewer">().notNull().default("editor"),
    invitedBy: text("invited_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.email] }), index("members_user_idx").on(t.userId)],
);

export type RunStatus = "queued" | "running" | "succeeded" | "failed";

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    tool: text("tool").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    settings: jsonb("settings").$type<{ resolution?: string; aspect?: string }>().notNull().default({}),
    cost: integer("cost").notNull().default(0),
    model: text("model").notNull().default(""),
    /** Expected number of outputs (drives the placeholder tiles while generating). */
    expected: integer("expected").notNull().default(1),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    /** Provider bookkeeping (fal queue request ids) so a restarted worker can resume. */
    providerRef: jsonb("provider_ref").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("runs_project_idx").on(t.projectId, t.createdAt), index("runs_status_idx").on(t.status, t.createdAt)],
);

export type AssetMeta = {
  sha256?: string;
  originalName?: string;
  format?: string;
  /** Share of pixels outside the edited region left untouched (0–1), for masked edits. */
  fidelity?: number;
  /** Recolor: CIE ΔE between the garment's mean color and the requested color (lower is closer; <2 is imperceptible). */
  colorDelta?: number;
  /** Model/provider that produced a result. */
  model?: string;
};

export type Segment ={ id: string; label: string; box: [number, number, number, number]; maskKey: string; area: number };

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    runId: text("run_id"),
    parentId: text("parent_id"),
    /** upload | result | mask */
    kind: text("kind").$type<"upload" | "result" | "mask">().notNull(),
    media: text("media").$type<"image" | "video">().notNull().default("image"),
    /** The master file: uploads are stored byte-for-byte as received; results exactly as generated. */
    storageKey: text("storage_key").notNull(),
    /** Lightweight WebP rendition for the feed/editor when the master is large or not web-viewable. */
    previewKey: text("preview_key"),
    posterKey: text("poster_key"),
    /** sha256 of the master, original filename/format, and generation QA (fidelity) for results. */
    meta: jsonb("meta").$type<AssetMeta | null>(),
    mime: text("mime").notNull(),
    width: integer("width").notNull().default(0),
    height: integer("height").notNull().default(0),
    bytes: integer("bytes").notNull().default(0),
    name: text("name").notNull().default(""),
    /** Detected garment regions, cached after the first auto-detect. */
    segments: jsonb("segments").$type<Segment[] | null>(),
    shareToken: text("share_token"),
    /** Feed "Mark" — flag looks for the team's shortlist. */
    marked: boolean("marked").notNull().default(false),
    /** "Save to Assets" — kept in the workspace library across projects. */
    saved: boolean("saved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("assets_project_idx").on(t.projectId, t.createdAt), index("assets_run_idx").on(t.runId), index("assets_share_idx").on(t.shareToken)],
);

/** "Share for review": comments + approvals collected on shared looks. */
export const reviewComments = pgTable(
  "review_comments",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id").notNull(),
    author: text("author").notNull(),
    body: text("body").notNull().default(""),
    verdict: text("verdict").$type<"approve" | "changes" | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_asset_idx").on(t.assetId, t.createdAt)],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    runId: text("run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_user_idx").on(t.userId, t.createdAt)],
);

/** Fixed-window rate limits shared by every web instance (one row per key). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

export type UserRow = typeof users.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type MemberRow = typeof projectMembers.$inferSelect;
