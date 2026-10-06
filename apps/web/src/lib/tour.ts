"use client";

import { api, type RunDTO } from "./api";
import { useStudio } from "./store";

export type TourStepDef = {
  id: "sketch" | "select" | "recolor" | "tryon" | "review" | "export";
  title: string;
  body: string;
  target: string;
  media: string[];
  place: "left" | "right" | "below" | "above-left";
};

export const TOUR: TourStepDef[] = [
  { id: "sketch", title: "Start with a sketch", body: "Upload a sketch, then use Sketch to Render to turn it into a photorealistic render.", target: '[data-tour="generate"]', media: ["/studio/tour/sketch.jpg", "/studio/tour/render.jpg"], place: "left" },
  { id: "select", title: "Select your garment", body: "Click the garment you'd like to recolor.", target: "[data-stage-image]", media: ["/studio/tour/render.jpg"], place: "above-left" },
  { id: "recolor", title: "Recolor your garment", body: "Click Generate to recolor the selected garment.", target: '[data-tour="generate"]', media: ["/studio/tour/render.jpg", "/studio/tour/recolor.jpg"], place: "left" },
  { id: "tryon", title: "Try it on", body: "Recolored. Now try the garment on a model. Click Generate to try your garment on a model.", target: '[data-tour="generate"]', media: ["/studio/tour/recolor.jpg", "/studio/tour/tryon.jpg"], place: "left" },
  { id: "review", title: "Review your work", body: "Switch to Feed View to see everything you've made so far.", target: '[data-tour="feed-toggle"]', media: ["/studio/tour/tryon.jpg"], place: "below" },
  { id: "export", title: "Export & share for review", body: "Manage your assets in the feed, export them, or share them with your team.", target: '[data-tour="selection-panel"]', media: [], place: "left" },
];

const st = () => useStudio.getState();
const ids: { sketch?: string; model?: string; render?: string; recolor?: string; tryon?: string } = {};

function addRuns(runs: (RunDTO | null)[]) {
  for (const r of runs) if (r) st().upsertRun(r);
}

async function step(name: "start" | "render" | "recolor" | "tryon", parentId?: string) {
  const p = st().project!;
  const { runs } = await api.tourStepCall(p.id, name, parentId);
  addRuns(runs);
  return runs;
}

/** Set the stage up for a tour step (open the right tool, bind inputs). */
export async function enterStep(i: number) {
  const s = st();
  const def = TOUR[i];
  s.set({ tourStep: i, welcome: "tour" });
  if (def.id === "sketch") {
    if (!ids.sketch) {
      const runs = await step("start");
      const all = (runs.length ? runs : st().runs).flatMap((r) => (r ? r.outputs : []));
      ids.sketch = all.find((a) => a.name === "Jacket Sketch")?.id ?? st().assets().find((a) => a.name === "Jacket Sketch")?.id;
      ids.model = all.find((a) => a.name === "Tour model")?.id ?? st().assets().find((a) => a.name === "Tour model")?.id;
    }
    s.set({ view: "editor" });
    if (ids.sketch) st().setActive(ids.sketch);
    st().openTool("sketch-to-render");
    if (ids.sketch) st().setInput("sketch-to-render", "sketch", [ids.sketch]);
  }
  if (def.id === "select") {
    s.set({ view: "editor" });
    if (ids.render) st().setActive(ids.render);
    st().openTool("garment-recolor");
    if (ids.render) st().setInput("garment-recolor", "garment", ids.render);
    st().setInput("garment-recolor", "colors", [{ hex: "#6b5a48", name: "Washed brown" }]);
    st().setMode("auto");
  }
  if (def.id === "tryon") {
    s.set({ view: "editor", mode: "select", selection: null });
    if (ids.recolor) st().setActive(ids.recolor);
    st().openTool("model-try-on");
    if (ids.recolor) st().setInput("model-try-on", "garment", [ids.recolor]);
    if (ids.model) st().setInput("model-try-on", "model", ids.model);
  }
  if (def.id === "export") {
    s.set({ view: "feed", selectedIds: ids.tryon ? [ids.tryon] : [] });
  }
}

/** Generate during the tour: drops the pre-baked result instantly and advances. */
export async function tourGenerate(toolId: string) {
  const s = st();
  const def = TOUR[s.tourStep];
  try {
    if (def?.id === "sketch" && toolId === "sketch-to-render") {
      const runs = await step("render", ids.sketch);
      ids.render = runs[0]?.outputs[0]?.id;
      if (ids.render) st().setActive(ids.render);
      return enterStep(1);
    }
    if (def?.id === "recolor" && toolId === "garment-recolor") {
      const runs = await step("recolor", ids.render);
      ids.recolor = runs[0]?.outputs[0]?.id;
      if (ids.recolor) st().setActive(ids.recolor);
      st().setMode("select");
      return enterStep(3);
    }
    if (def?.id === "tryon" && toolId === "model-try-on") {
      const runs = await step("tryon", ids.recolor);
      ids.tryon = runs[0]?.outputs[0]?.id;
      if (ids.tryon) st().setActive(ids.tryon);
      return enterStep(4);
    }
    st().toast("Follow the highlighted step to continue the tour");
  } catch (e) {
    st().toast((e as Error).message || "Tour step failed", "error");
  }
}

export async function startTour() {
  st().set({ welcome: "tour", tourStep: 0 });
  await enterStep(0);
}

export async function endTour(markDone = true) {
  st().set({ welcome: "hidden", selectedIds: [] });
  if (markDone) {
    try {
      const me = await api.updateMe({ onboarded: true });
      st().set({ me });
    } catch {}
  }
}
