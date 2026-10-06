import { db, storageMode } from "@fashion/core";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = { storage: storageMode(), engine: process.env.FASHION_ENGINE_MODE ?? "inline", fal: Boolean(process.env.FAL_KEY), vision: Boolean(process.env.OPENROUTER_API_KEY) };
  try {
    await db().execute(sql`select 1`);
    checks.db = "ok";
  } catch (e) {
    checks.db = (e as Error).message.slice(0, 120);
  }
  const ok = checks.db === "ok" && checks.fal === true;
  return Response.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}
