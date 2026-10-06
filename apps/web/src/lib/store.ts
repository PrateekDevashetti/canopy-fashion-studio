"use client";

import { create } from "zustand";
import { useMemo } from "react";
import { bindsActive, toolById, type Tool } from "@fashion/core/tools";
import { track } from "./analytics";
import { api, ApiError, type AssetDTO, type Me, type ProjectDTO, type Role, type RunDTO, type SegmentDTO } from "./api";

export type Mode = "select" | "lasso" | "brush" | "auto" | "square" | "draw" | "text" | "shapes" | "crop" | "adjust";
export type SelectMode = "lasso" | "brush" | "auto" | "square";
export type AnnotateMode = "draw" | "text" | "shapes";
export type View = "editor" | "feed";

/** A canvas selection in natural image pixels, before it becomes a stored mask. */
export type Selection =
  | { kind: "lasso"; points: [number, number][] }
  | { kind: "square"; rect: [number, number, number, number] }
  | { kind: "brush"; strokes: { points: [number, number][]; size: number; erase: boolean }[] }
  | { kind: "segment"; segment: SegmentDTO };

export type Toast = { id: number; text: string; tone?: "error" | "ok" };

/** Annotation items in natural image pixels. */
export type AnnItem =
  | { id: string; kind: "path"; points: [number, number][]; color: string; width: number }
  | { id: string; kind: "rect" | "ellipse" | "arrow"; from: [number, number]; to: [number, number]; color: string; width: number }
  | { id: string; kind: "text"; at: [number, number]; text: string; color: string; size: number };

export type ShapeKind = "rect" | "ellipse" | "arrow";
export const ANN_COLORS = ["#ffffff", "#111111", "#5bc466", "#e5484d", "#f2b84b"];

export type Crop = { cx: number; cy: number; w: number; h: number; rot: number; lock: boolean };
export type Adjust = { warmth: number; contrast: number; saturation: number; brightness: number; highlights: number; shadows: number; tint: number; hue: number };
export const ADJUST_DEFAULT: Adjust = { warmth: 0, contrast: 1, saturation: 1, brightness: 0, highlights: 0, shadows: 0, tint: 0, hue: 0 };

type ToolState = { inputs: Record<string, unknown>; resolution?: string; aspect?: string; touched: Record<string, boolean> };

type State = {
  me: Me | null;
  project: ProjectDTO | null;
  role: Role;
  runs: RunDTO[];
  loaded: boolean;
  view: View;
  activeId: string | null;
  toolId: string | null;
  mode: Mode;
  lastSelectMode: SelectMode;
  lastAnnotateMode: AnnotateMode;
  selection: Selection | null;
  segments: Record<string, SegmentDTO[] | "loading" | "error">;
  hoverSegment: string | null;
  tools: Record<string, ToolState>;
  zoom: number;
  stripPinned: boolean;
  libraryOpen: boolean;
  infoOpen: boolean;
  selectedIds: string[];
  toasts: Toast[];
  welcome: "hidden" | "intro" | "tour";
  tourStep: number;
  board: "single" | "grid";
  ann: { color: string; stroke: number; textSize: number; shape: ShapeKind; items: AnnItem[]; editing: string | null };
  brush: { size: number; erase: boolean };
  crop: Crop;
  adjust: Adjust;
  busy: string | null;

  // derived helpers
  assets: () => AssetDTO[];
  asset: (id: string | null | undefined) => AssetDTO | undefined;
  active: () => AssetDTO | undefined;

  set: (p: Partial<State>) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  init: (projectId: string) => Promise<void>;
  refresh: () => Promise<void>;
  setActive: (id: string | null) => void;
  openTool: (id: string | null) => void;
  setInput: (tool: string, key: string, value: unknown) => void;
  setToolSetting: (tool: string, p: { resolution?: string; aspect?: string }) => void;
  setMode: (m: Mode) => void;
  addRun: (r: RunDTO) => void;
  upsertRun: (r: RunDTO) => void;
  removeRun: (id: string) => void;
  removeAsset: (id: string) => void;
  loadSegments: (assetId: string, refresh?: boolean) => Promise<SegmentDTO[] | null>;
};

let toastSeq = 0;

export const useStudio = create<State>((set, get) => ({
  me: null,
  project: null,
  role: "owner",
  runs: [],
  loaded: false,
  view: "editor",
  activeId: null,
  toolId: null,
  mode: "select",
  lastSelectMode: "lasso",
  lastAnnotateMode: "draw",
  selection: null,
  segments: {},
  hoverSegment: null,
  tools: {},
  zoom: 1,
  stripPinned: true,
  libraryOpen: false,
  infoOpen: false,
  selectedIds: [],
  toasts: [],
  welcome: "hidden",
  tourStep: 0,
  board: "single",
  ann: { color: "#e5484d", stroke: 6, textSize: 32, shape: "rect", items: [], editing: null },
  brush: { size: 50, erase: false },
  crop: { cx: 0.5, cy: 0.5, w: 1, h: 1, rot: 0, lock: false },
  adjust: { ...ADJUST_DEFAULT },
  busy: null,

  assets: () => {
    const out: AssetDTO[] = [];
    for (const r of get().runs) out.push(...r.outputs);
    return out;
  },
  asset: (id) => (id ? get().assets().find((a) => a.id === id) : undefined),
  active: () => get().asset(get().activeId),

  set: (p) => set(p),

  toast: (text, tone) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === "error" ? 6000 : 3200);
  },

  init: async (projectId) => {
    // Read URL intent before any await: a concurrent init (React dev double-effects) may clean the URL.
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    set({ loaded: false, runs: [], activeId: null, selection: null, toolId: null, mode: "select", selectedIds: [], segments: {} });
    const [me, proj, feed] = await Promise.all([api.me(), api.project(projectId), api.feed(projectId)]);
    const first = feed.runs.find((r) => r.outputs.length)?.outputs[0]?.id ?? null;
    const tool = params?.get("tool");
    set({
      me,
      project: proj.project,
      role: proj.role,
      runs: feed.runs,
      loaded: true,
      activeId: first,
      view: params?.get("view") === "feed" ? "feed" : "editor",
      // ?tour=1 replays onboarding on demand (Help → Take the tour links, tests).
      welcome: params?.get("tour") === "1" || !me.onboarded ? "intro" : "hidden",
    });
    if (tool && toolById(tool)) get().openTool(tool);
  },

  refresh: async () => {
    const p = get().project;
    if (!p) return;
    try {
      const [{ runs }, me] = await Promise.all([api.feed(p.id), api.me()]);
      const prev = new Map(get().runs.map((r) => [r.id, r]));
      // Surface finished runs: auto-open the first output of a run that just completed.
      for (const r of runs) {
        const before = prev.get(r.id);
        if (before && (before.status === "queued" || before.status === "running")) {
          if (r.status === "failed") get().toast(r.error ?? `${r.toolName} failed`, "error");
          else if (r.status === "succeeded" && r.outputs[0] && (get().activeId === `pending:${r.id}` || !get().activeId)) set({ activeId: r.outputs[0].id, selection: null });
          if (r.status === "succeeded" && r.error) get().toast(r.error, "error");
        }
      }
      const optimistic = get().runs.filter((r) => r.optimistic && !runs.some((x) => x.id === r.id));
      set({ runs: [...optimistic, ...runs], me });
      const active = get().activeId;
      if (active && !active.startsWith("pending:") && !get().asset(active)) set({ activeId: runs.find((r) => r.outputs.length)?.outputs[0]?.id ?? null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) get().toast("This project is no longer available", "error");
    }
  },

  setActive: (id) => {
    if (id === get().activeId) return;
    set({ activeId: id, selection: null, hoverSegment: null, mode: ["crop", "adjust", "draw", "text", "shapes"].includes(get().mode) ? "select" : get().mode });
    // Re-bind tool inputs that follow the open image, unless the user picked something by hand.
    const toolId = get().toolId;
    if (toolId && !id?.startsWith("pending:")) bindActiveInputs(toolId);
  },

  openTool: (id) => {
    if (!id) return set({ toolId: null });
    if (id !== get().toolId) track("tool_opened", { tool: id });
    const prevMode = get().mode;
    set({ toolId: id, mode: prevMode === "crop" || prevMode === "adjust" ? "select" : prevMode });
    bindActiveInputs(id);
  },

  setInput: (tool, key, value) =>
    set((s) => {
      const t = s.tools[tool] ?? { inputs: {}, touched: {} };
      return { tools: { ...s.tools, [tool]: { ...t, inputs: { ...t.inputs, [key]: value }, touched: { ...t.touched, [key]: true } } } };
    }),

  setToolSetting: (tool, p) =>
    set((s) => {
      const t = s.tools[tool] ?? { inputs: {}, touched: {} };
      return { tools: { ...s.tools, [tool]: { ...t, ...p } } };
    }),

  setMode: (m) => {
    const s = get();
    const patch: Partial<State> = { mode: m };
    if (["lasso", "brush", "auto", "square"].includes(m)) patch.lastSelectMode = m as SelectMode;
    if (["draw", "text", "shapes"].includes(m)) patch.lastAnnotateMode = m as AnnotateMode;
    if (m !== s.mode && !(["lasso", "brush", "auto", "square"].includes(m) && s.selection?.kind === "segment" && m === "auto")) patch.selection = null;
    if (m === "crop" || m === "adjust") patch.toolId = null;
    if (m === "crop" && s.mode !== "crop") patch.crop = { cx: 0.5, cy: 0.5, w: 1, h: 1, rot: 0, lock: false };
    if (m === "adjust" && s.mode !== "adjust") patch.adjust = { ...ADJUST_DEFAULT };
    const annot = (x: Mode) => x === "draw" || x === "text" || x === "shapes";
    if (annot(s.mode) && !annot(m)) patch.ann = { ...s.ann, items: [], editing: null };
    set(patch);
    if (m === "auto" && s.activeId) void get().loadSegments(s.activeId);
  },

  addRun: (r) => set((s) => ({ runs: [r, ...s.runs.filter((x) => x.id !== r.id)] })),
  upsertRun: (r) => set((s) => ({ runs: s.runs.some((x) => x.id === r.id) ? s.runs.map((x) => (x.id === r.id ? r : x)) : [r, ...s.runs] })),
  removeRun: (id) =>
    set((s) => {
      const runs = s.runs.filter((r) => r.id !== id);
      const stillActive = runs.some((r) => r.outputs.some((o) => o.id === s.activeId));
      return { runs, activeId: stillActive ? s.activeId : (runs.find((r) => r.outputs.length)?.outputs[0]?.id ?? null) };
    }),
  removeAsset: (id) =>
    set((s) => {
      const runs = s.runs.map((r) => ({ ...r, outputs: r.outputs.filter((o) => o.id !== id) })).filter((r) => r.outputs.length || r.status !== "succeeded");
      return { runs, activeId: s.activeId === id ? (runs.find((r) => r.outputs.length)?.outputs[0]?.id ?? null) : s.activeId, selectedIds: s.selectedIds.filter((x) => x !== id) };
    }),

  loadSegments: async (assetId, refresh) => {
    const cur = get().segments[assetId];
    if (cur === "loading") return null;
    if (Array.isArray(cur) && !refresh) return cur;
    set((s) => ({ segments: { ...s.segments, [assetId]: "loading" } }));
    try {
      const { segments } = await api.detect(assetId, refresh);
      set((s) => ({ segments: { ...s.segments, [assetId]: segments } }));
      if (!segments.length) get().toast("No garments detected — try Lasso or Brush.");
      return segments;
    } catch (e) {
      set((s) => ({ segments: { ...s.segments, [assetId]: "error" } }));
      get().toast((e as Error).message, "error");
      return null;
    }
  },
}));

/** Fill a tool's "Applying to" inputs with the open image (only inputs the user hasn't set by hand). */
function bindActiveInputs(toolId: string) {
  const s = useStudio.getState();
  const tool: Tool | undefined = toolById(toolId);
  const active = s.activeId?.startsWith("pending:") ? null : s.activeId;
  if (!tool) return;
  const t = s.tools[toolId] ?? { inputs: {}, touched: {} };
  const inputs = { ...t.inputs };
  let boundOne = false;
  for (const spec of tool.inputs) {
    if (spec.kind !== "image" || !bindsActive(spec)) continue;
    // Only the first bindable input follows the open image (e.g. Base Model Photo, not New Garment).
    if (boundOne) continue;
    boundOne = true;
    if (t.touched[spec.key] && inputs[spec.key]) continue;
    inputs[spec.key] = active ? (spec.collection ? [active] : active) : spec.collection ? [] : null;
    // A mask drawn on another image no longer applies.
    for (const m of tool.inputs) if (m.kind === "mask" && m.of === spec.key) inputs[m.key] = null;
  }
  useStudio.setState({ tools: { ...s.tools, [toolId]: { ...t, inputs, resolution: t.resolution ?? tool.resolutions[0], aspect: t.aspect ?? tool.defaultAspect } } });
}

export const isPending = (r: RunDTO) => r.status === "queued" || r.status === "running";

/** All assets across runs, memoized on the runs array (selectors must not return fresh arrays). */
export function useAssets(): AssetDTO[] {
  const runs = useStudio((s) => s.runs);
  return useMemo(() => runs.flatMap((r) => r.outputs), [runs]);
}
