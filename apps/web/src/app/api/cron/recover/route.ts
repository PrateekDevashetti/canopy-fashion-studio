import { recoverStale } from "@fashion/core";

export const dynamic = "force-dynamic";

/** Vercel cron: recover runs orphaned by killed functions (belt and braces next to the worker). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const recovered = await recoverStale();
  return Response.json({ recovered });
}
