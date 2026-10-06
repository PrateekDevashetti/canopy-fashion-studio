import { searchStock } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Stock photo search (Unsplash when configured, otherwise Openverse). */
export const GET = route(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const page = Math.max(1, Math.min(20, Number(sp.get("page") ?? 1) || 1));
    return json(await searchStock(sp.get("q") ?? "", page), { headers: { "cache-control": "private, max-age=300" } });
  },
  { guests: true },
);
