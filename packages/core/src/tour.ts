import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { assets, runs, type Segment } from "./db/schema";
import { HttpError, insertAsset, requireProject, runWithOutputs } from "./data";
import { newId } from "./ids";
import { dims } from "./engine/imaging";
import { putObject } from "./storage";

/**
 * Onboarding tour: drops pre-baked, free results into the project so the guided walkthrough is
 * instant (sketch → render → recolor → try-on). Works for guests and signed-in users alike.
 */
export type TourStep = "start" | "render" | "recolor" | "tryon";

const FILES: Record<TourStep, { file: string; tool: string; name: string }[]> = {
  start: [
    { file: "/studio/tour/sketch.jpg", tool: "upload", name: "Jacket Sketch" },
    { file: "/studio/tour/model.jpg", tool: "upload", name: "Tour model" },
  ],
  render: [{ file: "/studio/tour/render.jpg", tool: "sketch-to-render", name: "Sketch to render" }],
  recolor: [{ file: "/studio/tour/recolor.jpg", tool: "garment-recolor", name: "Recolor Washed brown" }],
  tryon: [{ file: "/studio/tour/tryon.jpg", tool: "model-try-on", name: "Try-on" }],
};

const MODEL_LABEL: Record<string, string> = { "sketch-to-render": "Gemini Flash 3.6, Nano Banana 2 Lite", "garment-recolor": "Nano Banana 2", "model-try-on": "Nano Banana 2" };

async function fetchPublic(origin: string, file: string) {
  const res = await fetch(new URL(file, origin));
  if (!res.ok) throw new HttpError(500, `Tour asset missing: ${file}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function tourStep(userId: string, projectId: string, step: TourStep, origin: string, parentId?: string | null) {
  await requireProject(projectId, userId, "edit");
  if (!FILES[step]) throw new HttpError(400, "Unknown tour step");
  const out = [];
  for (const f of FILES[step]) {
    const buf = await fetchPublic(origin, f.file);
    const { width, height } = await dims(buf);
    const runId = newId("run");
    const now = new Date();
    await db().insert(runs).values({ id: runId, projectId, userId, tool: f.tool, status: "succeeded", cost: 0, expected: 1, model: MODEL_LABEL[f.tool] ?? "", startedAt: new Date(now.getTime() - 9000), finishedAt: now, settings: { resolution: "1K", aspect: "Auto" } });
    const id = newId("ast");
    const key = `p/${projectId}/${id}.jpg`;
    await putObject(key, buf);
    let segments: Segment[] | null = null;
    if (step === "render" || step === "recolor") {
      const mask = await fetchPublic(origin, "/studio/tour/render-mask.png");
      const maskKey = `p/${projectId}/masks/seg_${id.slice(4)}.png`;
      await putObject(maskKey, mask);
      segments = [{ id: `seg_${id.slice(4)}`, label: "Denim jacket", box: [0.112, 0.052, 0.902, 0.946], maskKey, area: 0.52 }];
    }
    await insertAsset({ id, projectId, userId, runId, parentId: parentId ?? null, kind: f.tool === "upload" ? "upload" : "result", media: "image", storageKey: key, mime: "image/jpeg", width, height, bytes: buf.length, name: f.name, segments });
    out.push(await runWithOutputs(runId));
  }
  return out;
}

/** Has this project already been seeded with the tour? */
export async function tourSeeded(projectId: string) {
  const r = await db().query.assets.findFirst({ where: and(eq(assets.projectId, projectId), eq(assets.name, "Jacket Sketch")) });
  return Boolean(r);
}
