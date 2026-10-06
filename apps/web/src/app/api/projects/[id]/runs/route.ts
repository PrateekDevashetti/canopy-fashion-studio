import { createRun } from "@fashion/core";
import { body, json, route } from "@/lib/http";
import { dispatch } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** Start a generation: { tool, inputs, settings: { resolution, aspect } }. */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const b = await body<{ tool?: string; inputs?: Record<string, unknown>; settings?: { resolution?: string; aspect?: string } }>(req);
  const run = await createRun(user.id, id, String(b.tool ?? ""), b.inputs ?? {}, b.settings ?? {});
  dispatch(run.id);
  return json({ run }, 201);
});
