"use client";

import { useCallback } from "react";
import { api, type AssetDTO, type RunDTO } from "@/lib/api";
import { useStudio } from "@/lib/store";

/** Upload images into the project. A multi-file drop becomes one feed run. Returns the new assets. */
export function useUploader() {
  return useCallback(async (files: File[], opts: { activate?: boolean } = {}): Promise<AssetDTO[]> => {
    const st = useStudio.getState();
    const project = st.project;
    if (!project) return [];
    if (st.role === "viewer") {
      st.toast("You have view-only access to this project", "error");
      return [];
    }
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(f.name));
    if (!images.length) {
      st.toast("Upload PNG, JPG or WebP images", "error");
      return [];
    }
    const tempId = `tmp_${Date.now()}`;
    const placeholder: RunDTO = {
      id: tempId,
      projectId: project.id,
      userId: st.me?.id ?? "",
      tool: "upload",
      toolName: "Upload",
      status: "running",
      inputs: {},
      settings: {},
      cost: 0,
      model: "",
      expected: images.length,
      media: "image",
      error: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      outputs: [],
      optimistic: true,
    };
    st.addRun(placeholder);
    const out: AssetDTO[] = [];
    let runId: string | null = null;
    for (const f of images) {
      try {
        const { asset } = await api.upload(project.id, f, f.name, runId);
        runId = asset.runId;
        out.push(asset);
      } catch (e) {
        st.toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    useStudio.setState((s) => ({ runs: s.runs.filter((r) => r.id !== tempId) }));
    if (out.length && runId) {
      useStudio.getState().upsertRun({ ...placeholder, id: runId, status: "succeeded", optimistic: false, outputs: out, finishedAt: new Date().toISOString() });
      if (opts.activate !== false) {
        useStudio.getState().setActive(out[0].id);
        useStudio.setState({ view: "editor" });
      }
    }
    return out;
  }, []);
}

/** Open the OS file picker; resolves with chosen files (empty when cancelled). */
export function pickFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif";
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}
