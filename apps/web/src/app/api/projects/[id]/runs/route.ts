import { createRun } from "@fashion/core";
import { body, json, route } from "@/lib/http";
import { dispatch } from "@/lib/engine";
import { canopyToken, forgetSpendableCredits } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** Start a generation: { tool, inputs, settings: { resolution, aspect } }. */
export const POST = route<Ctx>(async (req, user, { params }) => {
  const { id } = await params;
  const b = await body<{ tool?: string; inputs?: Record<string, unknown>; settings?: { resolution?: string; aspect?: string } }>(req);
  // With their Canopy token the run is paid from their Canopy credits (platform-credits.ts in core).
  const run = await createRun(user.id, id, String(b.tool ?? ""), b.inputs ?? {}, b.settings ?? {}, { platformToken: await canopyToken() });
  forgetSpendableCredits(user.id);
  dispatch(run.id);
  return json({ run }, 201);
}, { limit: "runs" });
