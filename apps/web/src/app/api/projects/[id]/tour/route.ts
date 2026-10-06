import { HttpError, tourSeeded, tourStep, type TourStep } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const STEPS: TourStep[] = ["start", "render", "recolor", "tryon"];

/** Onboarding tour: drop the next pre-baked result into the project (free, instant). */
export const POST = route<Ctx>(
  async (req, user, { params }) => {
    const { id } = await params;
    const b = await body<{ step?: string; parentId?: string }>(req);
    const step = STEPS.find((s) => s === b.step);
    if (!step) throw new HttpError(400, "Unknown tour step");
    if (step === "start" && (await tourSeeded(id))) return json({ runs: [], seeded: true });
    const origin = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes("localhost") ? process.env.NEXT_PUBLIC_APP_URL : new URL(req.url).origin;
    const runs = await tourStep(user.id, id, step, origin, b.parentId ?? null);
    return json({ runs }, 201);
  },
  { guests: true },
);
