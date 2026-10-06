"use client";

import { runCost, toolById, validateInputs, MODELS, EDITOR_OPS } from "@fashion/core/tools";
import { api, downloadUrl, downloadZip, fileName, type AssetDTO, type RunDTO } from "./api";
import { renderAdjusted, renderAnnotated, renderCrop, selectionEmpty, selectionMask } from "./render";
import { useStudio, isPending } from "./store";

const st = () => useStudio.getState();

function placeholder(tool: string, name: string, expected: number, media: "image" | "video" = "image"): RunDTO {
  const s = st();
  return {
    id: `tmp_${Math.random().toString(36).slice(2)}`,
    projectId: s.project!.id,
    userId: s.me?.id ?? "",
    tool,
    toolName: name,
    status: "queued",
    inputs: {},
    settings: {},
    cost: 0,
    model: "",
    expected,
    media,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    outputs: [],
    optimistic: true,
  };
}

/** Start a run with an optimistic feed placeholder; reconciles with the server response. */
async function start(tool: string, inputs: Record<string, unknown>, settings: { resolution?: string; aspect?: string }, expected: number) {
  const s = st();
  if (!s.project) return null;
  if (s.role === "viewer") {
    s.toast("You have view-only access to this project", "error");
    return null;
  }
  const t = toolById(tool);
  const temp = placeholder(tool, t?.name ?? (EDITOR_OPS as Record<string, { name: string }>)[tool]?.name ?? tool, expected, t?.media);
  s.addRun(temp);
  try {
    const { run } = await api.createRun(s.project.id, tool, inputs, settings);
    useStudio.setState((x) => ({ runs: [run, ...x.runs.filter((r) => r.id !== temp.id && r.id !== run.id)], me: x.me ? { ...x.me, credits: x.me.credits - run.cost } : x.me }));
    // Focus the generating placeholder, like the reference (the result replaces it when ready).
    if (st().view === "editor") useStudio.setState({ activeId: `pending:${run.id}`, selection: null });
    return run;
  } catch (e) {
    useStudio.setState((x) => ({ runs: x.runs.filter((r) => r.id !== temp.id) }));
    st().toast((e as Error).message, "error");
    return null;
  }
}

export function blockedModelsFor(tool: string): string[] {
  const t = toolById(tool);
  const disabled = new Set(st().me?.disabledModels ?? []);
  return (t?.models ?? []).filter((m) => disabled.has(m)).map((m) => MODELS[m].label);
}

/** Generate with the open tool's current inputs. */
export async function generate(toolId: string) {
  const s = st();
  const tool = toolById(toolId);
  if (!tool) return;
  if (s.welcome === "tour") {
    const { tourGenerate } = await import("./tour");
    return tourGenerate(toolId);
  }
  if (s.me?.guest) {
    window.dispatchEvent(new CustomEvent("fs:signup"));
    return;
  }
  const ts = s.tools[toolId] ?? { inputs: {}, touched: {} };
  const inputs = { ...ts.inputs };
  // A live canvas selection fills an empty mask input.
  for (const spec of tool.inputs) {
    if (spec.kind === "mask" && !inputs[spec.key] && s.selection && !selectionEmpty(s.selection) && inputs[spec.of] === s.activeId) {
      const key = await commitSelection();
      if (key) {
        inputs[spec.key] = key.key;
        inputs.maskLabel = key.label;
      }
    }
  }
  const problem = validateInputs(tool, inputs);
  if (problem) return s.toast(problem, "error");
  const settings = { resolution: ts.resolution ?? tool.resolutions[0], aspect: ts.aspect ?? tool.defaultAspect };
  const outputs = tool.outputs * Math.max(1, ...tool.inputs.map((sp) => ((sp.kind === "image" || sp.kind === "color") && sp.collection && Array.isArray(inputs[sp.key]) ? (inputs[sp.key] as unknown[]).length : 1)));
  const cost = runCost(tool, inputs, settings.resolution);
  if ((s.me?.credits ?? 0) < cost) return s.toast(`Not enough credits — this run needs ${cost}.`, "error");
  return start(toolId, inputs, settings, outputs);
}

/** Upload the current canvas selection as a mask. */
export async function commitSelection(): Promise<{ key: string; label?: string } | null> {
  const s = st();
  const a = s.active();
  if (!a || !s.selection || !s.project) return null;
  if (s.selection.kind === "segment") return { key: s.selection.segment.maskKey, label: s.selection.segment.label };
  if (selectionEmpty(s.selection)) return null;
  try {
    const blob = await selectionMask(s.selection, a.width, a.height);
    const { key } = await api.saveMask(s.project.id, blob);
    return { key };
  } catch (e) {
    s.toast((e as Error).message, "error");
    return null;
  }
}

/** "Make a change…" on the selected region. */
export async function regionEdit(prompt: string) {
  const s = st();
  const a = s.active();
  if (!a || !prompt.trim()) return;
  s.set({ busy: "region" });
  const mask = await commitSelection();
  s.set({ busy: null });
  if (!mask) return s.toast("Select a region first", "error");
  const run = await start("region-edit", { image: a.id, mask: mask.key, maskLabel: mask.label, prompt }, { resolution: "1K", aspect: "Auto" }, 1);
  if (run) st().set({ selection: null });
}

export async function removeBackground() {
  const a = st().active();
  if (!a || a.media !== "image") return;
  await start("remove-background", { image: a.id }, {}, 1);
}

async function saveRendered(op: "crop" | "adjust" | "annotate", blob: Blob, parent: AssetDTO) {
  const s = st();
  if (!s.project) return;
  s.set({ busy: op });
  try {
    const { asset } = await api.saveEdit(s.project.id, op, parent.id, blob);
    const run: RunDTO = { ...placeholder(op, EDITOR_OPS[op].name, 1), id: asset.runId!, status: "succeeded", optimistic: false, outputs: [asset], finishedAt: asset.createdAt };
    st().upsertRun(run);
    st().setActive(asset.id);
    st().setMode("select");
    st().toast(`Saved as a new version`, "ok");
  } catch (e) {
    st().toast((e as Error).message, "error");
  } finally {
    st().set({ busy: null });
  }
}

export async function saveAnnotations() {
  const s = st();
  const a = s.active();
  if (!a) return;
  const items = s.ann.items.filter((i) => i.kind !== "text" || i.text.trim());
  if (!items.length) return s.setMode("select");
  await saveRendered("annotate", await renderAnnotated(a.url, items), a);
}

export async function saveCrop() {
  const s = st();
  const a = s.active();
  if (!a) return;
  const c = s.crop;
  if (c.w >= 0.999 && c.h >= 0.999 && c.rot === 0) return s.setMode("select");
  await saveRendered("crop", await renderCrop(a.url, c), a);
}

export async function saveAdjust() {
  const s = st();
  const a = s.active();
  if (!a) return;
  await saveRendered("adjust", await renderAdjusted(a.url, s.adjust), a);
}

export function downloadAsset(a: AssetDTO) {
  void downloadUrl(a.url, fileName(a));
}

export async function downloadAssets(list: AssetDTO[], zipName = "fashion-studio.zip") {
  if (list.length === 1) return downloadAsset(list[0]);
  st().toast(`Preparing ${list.length} files…`);
  try {
    await downloadZip(list.map((a) => ({ url: a.url, name: fileName(a) })), zipName);
  } catch {
    st().toast("Download failed", "error");
  }
}

export async function deleteAssets(ids: string[]) {
  const s = st();
  for (const id of ids) {
    try {
      await api.deleteAsset(id);
      st().removeAsset(id);
    } catch (e) {
      s.toast((e as Error).message, "error");
      return;
    }
  }
  st().set({ selectedIds: [] });
}

export async function deleteRun(run: RunDTO) {
  try {
    if (!run.optimistic) await api.deleteRun(run.id);
    st().removeRun(run.id);
  } catch (e) {
    st().toast((e as Error).message, "error");
  }
}

export async function toggleFlag(ids: string[], flag: "marked" | "saved") {
  const s = st();
  const all = s.assets().filter((a) => ids.includes(a.id));
  const next = !all.every((a) => a[flag as keyof AssetDTO]);
  await Promise.all(
    all.map(async (a) => {
      try {
        const res = await fetch(`/api/assets/${a.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [flag]: next }) });
        if (!res.ok) throw new Error((await res.json()).error);
      } catch (e) {
        s.toast((e as Error).message, "error");
      }
    }),
  );
  useStudio.setState((x) => ({ runs: x.runs.map((r) => ({ ...r, outputs: r.outputs.map((o) => (ids.includes(o.id) ? { ...o, [flag]: next } : o)) })) }));
  s.toast(flag === "marked" ? (next ? "Marked" : "Unmarked") : next ? "Saved to Assets" : "Removed from Assets", "ok");
}

export async function copyShareLink(ids: string[]) {
  const s = st();
  try {
    const urls = await Promise.all(ids.map(async (id) => (await api.share(id)).url));
    await navigator.clipboard.writeText(urls.join("\n"));
    useStudio.setState((x) => ({ runs: x.runs.map((r) => ({ ...r, outputs: r.outputs.map((o) => (ids.includes(o.id) ? { ...o, shared: true } : o)) })) }));
    s.toast(ids.length > 1 ? `${ids.length} links copied` : "Link copied", "ok");
    return urls;
  } catch (e) {
    s.toast((e as Error).message, "error");
    return [];
  }
}

/** Send results to the Canopy canvas as image nodes. */
export async function openInCanvas(ids: string[]) {
  const s = st();
  if (!s.project || !ids.length) return;
  const win = window.open("about:blank", "_blank");
  try {
    const res = await fetch(`/api/projects/${s.project.id}/canvas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetIds: ids }) });
    const j = (await res.json()) as { url?: string; error?: string; fallback?: string };
    if (!res.ok || !j.url) throw new Error(j.error ?? "Couldn't open the canvas");
    if (win) win.location.href = j.url;
    else window.open(j.url, "_blank");
    if (j.fallback) {
      s.toast(j.fallback);
      await downloadAssets(s.assets().filter((a) => ids.includes(a.id)), "for-canvas.zip");
    }
  } catch (e) {
    win?.close();
    s.toast((e as Error).message, "error");
  }
}

export const pendingCount = () => st().runs.filter(isPending).length;
