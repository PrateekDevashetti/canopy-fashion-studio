import { sql } from "drizzle-orm";
import { db } from "./db/client";

/**
 * Fixed-window rate limiting in Postgres, so every Vercel instance and the worker share counts.
 * One upserted row per key; fails open (allows) if the database can't answer, because a limiter
 * outage must never take the product down — credits still bound real spend.
 */
export const LIMITS = {
  /** Model runs per user (each also debits credits). */
  runs: { max: 30, windowSec: 60 },
  /** Upload requests per user (a large file is several chunk requests). */
  uploads: { max: 240, windowSec: 60 },
  /** Editor saves per user. */
  edits: { max: 60, windowSec: 60 },
  /** Garment auto-detect per user (vision + segmentation calls). */
  detect: { max: 40, windowSec: 60 },
  /** New guest workspaces per IP. */
  guest: { max: 10, windowSec: 3600 },
  /** Public review comments per IP. */
  review: { max: 20, windowSec: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

let warned = false;

export async function rateLimit(name: LimitName, subject: string): Promise<{ ok: boolean; retryAfter: number }> {
  const { max, windowSec } = LIMITS[name];
  const now = Date.now();
  const start = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
  const retryAfter = Math.ceil((start + windowSec * 1000 - now) / 1000);
  try {
    const rows = await db().execute<{ count: number }>(sql`
      INSERT INTO rate_limits (key, window_start, count) VALUES (${`${name}:${subject}`}, ${new Date(start)}, 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start = EXCLUDED.window_start THEN rate_limits.count + 1 ELSE 1 END,
        window_start = EXCLUDED.window_start
      RETURNING count`);
    const count = Number((rows as unknown as { count: number }[])[0]?.count ?? 0);
    return { ok: count <= max, retryAfter };
  } catch (e) {
    if (!warned) console.warn("[ratelimit] unavailable, allowing requests:", (e as Error).message.slice(0, 160));
    warned = true;
    return { ok: true, retryAfter: 0 };
  }
}

/** Client IP as seen by Vercel's edge (first x-forwarded-for hop). */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
