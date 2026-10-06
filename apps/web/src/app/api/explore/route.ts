import { listExplore } from "@fashion/core";

export const dynamic = "force-dynamic";

/** Public Explore gallery (results people chose to publish). */
export async function GET(req: Request) {
  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  const posts = await listExplore(before && !Number.isNaN(Date.parse(before)) ? before : undefined);
  return Response.json({ posts }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
