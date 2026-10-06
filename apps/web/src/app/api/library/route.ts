import { libraryAssets } from "@fashion/core";
import { json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Workspace library across all your projects: ?source=assets|elements|history&before=ISO */
export const GET = route(async (req, user) => {
  const sp = new URL(req.url).searchParams;
  const source = (["assets", "elements", "history"] as const).find((s) => s === sp.get("source")) ?? "assets";
  const before = sp.get("before");
  return json({ assets: await libraryAssets(user.id, source, before && !Number.isNaN(Date.parse(before)) ? before : undefined) });
});
