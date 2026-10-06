import { db, storageMode } from "@fashion/core";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Liveness + golden signals for uptime checks and alerting (see docs/SLO.md):
 * saturation = queued runs / oldest queued age, errors = failed share of the last hour's runs.
 * Returns 503 when the database is unreachable or the queue is stuck.
 */
export async function GET() {
  const checks: Record<string, unknown> = {
    storage: storageMode(),
    engine: process.env.FASHION_ENGINE_MODE ?? "inline",
    fal: Boolean(process.env.FAL_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
  };
  let stuck = false;
  try {
    const [q] = (await db().execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'queued' AND deleted_at IS NULL)::int AS queued,
        coalesce(extract(epoch FROM now() - min(created_at) FILTER (WHERE status = 'queued' AND deleted_at IS NULL)), 0)::int AS oldest_queued_sec,
        count(*) FILTER (WHERE status = 'succeeded' AND finished_at > now() - interval '1 hour')::int AS ok_1h,
        count(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '1 hour')::int AS failed_1h
      FROM runs`)) as unknown as { queued: number; oldest_queued_sec: number; ok_1h: number; failed_1h: number }[];
    checks.db = "ok";
    checks.queue = { queued: q.queued, oldestQueuedSec: q.oldest_queued_sec };
    checks.runs1h = { succeeded: q.ok_1h, failed: q.failed_1h, errorRate: q.ok_1h + q.failed_1h ? +(q.failed_1h / (q.ok_1h + q.failed_1h)).toFixed(3) : 0 };
    // A run waiting > 10 minutes means no engine is draining the queue.
    stuck = q.oldest_queued_sec > 600;
  } catch (e) {
    console.error("[health] database check failed:", (e as Error).message);
    checks.db = "error";
  }
  const ok = checks.db === "ok" && !stuck && (checks.fal === true || checks.openrouter === true);
  return Response.json({ ok, ...(stuck ? { problem: "queue_stuck" } : {}), ...checks }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
