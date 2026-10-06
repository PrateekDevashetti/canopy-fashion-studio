import { projectFeed, requireProject } from "@fashion/core";
import { after } from "next/server";
import { json, route } from "@/lib/http";
import { kickStale } from "@/lib/engine";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  await requireProject(id, user.id);
  const url = new URL(req.url);
  const runs = await projectFeed(id, { before: url.searchParams.get("before") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 60) });
  // Safety net: if a queued run sat too long (worker down), process it here.
  const stuck = runs.filter((r) => r.status === "queued" && Date.now() - Date.parse(r.createdAt) > 45_000).map((r) => r.id);
  if (stuck.length) after(() => kickStale(stuck));
  return json({ runs });
}, { guests: true });
