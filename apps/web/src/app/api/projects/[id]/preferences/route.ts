import { updateProjectPrefs } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, user, { params }) => {
  const prefs = await updateProjectPrefs(user.id, (await params).id, await body(req));
  return json({ preferences: prefs });
});
