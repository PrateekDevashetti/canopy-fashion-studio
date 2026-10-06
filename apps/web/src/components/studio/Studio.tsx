"use client";

import { useEffect, useRef, useState } from "react";
import { identify, pageview } from "@/lib/analytics";
import { useStudio, isPending } from "@/lib/store";
import { ConfirmProvider, Spinner } from "@/components/ui";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { SettingsPanel } from "./SettingsPanel";
import { CropPanel, AdjustPanel } from "./EditPanels";
import { Stage } from "./Stage";
import { Filmstrip } from "./Filmstrip";
import { Feed } from "./Feed";
import { DetailsPanel } from "./DetailsPanel";
import { Library } from "./Library";
import { Toasts } from "./Toasts";
import { HelpButton } from "./Help";
import { Onboarding } from "./Onboarding";
import { useUploader } from "./useUploader";

export function Studio({ projectId }: { projectId: string }) {
  const s = useStudio();
  const [error, setError] = useState<string | null>(null);
  const upload = useUploader();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    useStudio
      .getState()
      .init(projectId)
      .catch((e) => setError(e.message));
    pageview();
  }, [projectId]);

  // Attribute analytics to the signed-in (or guest) user.
  const meId = s.me?.id;
  useEffect(() => {
    const me = useStudio.getState().me;
    if (me) identify(me);
  }, [meId]);

  // Poll: fast while anything is generating, slow otherwise (picks up teammates' runs).
  const pending = s.runs.some(isPending);
  useEffect(() => {
    if (!s.loaded) return;
    const t = setInterval(() => void useStudio.getState().refresh(), pending ? 2000 : 15000);
    return () => clearInterval(t);
  }, [s.loaded, pending]);

  // Keep the URL in sync with the view so refresh / share keeps context.
  useEffect(() => {
    if (!s.loaded) return;
    const url = new URL(window.location.href);
    if (s.view === "feed") url.searchParams.set("view", "feed");
    else url.searchParams.delete("view");
    url.searchParams.delete("tool");
    url.searchParams.delete("tour");
    window.history.replaceState(null, "", url);
  }, [s.view, s.loaded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useStudio.getState();
      const hasImage = Boolean(st.active());
      const k = e.key.toLowerCase();
      if (k === "e") st.set({ view: "editor" });
      else if (k === "f") st.set({ view: "feed" });
      else if (k === "escape") {
        if (st.selection) st.set({ selection: null });
        else if (st.mode !== "select") st.setMode("select");
        else if (st.selectedIds.length) st.set({ selectedIds: [] });
      } else if (st.view === "editor" && hasImage) {
        if (k === "v") st.setMode("select");
        else if (k === "l") st.setMode("lasso");
        else if (k === "b") st.setMode("brush");
        else if (k === "a") st.setMode("auto");
        else if (k === "s") st.setMode("square");
        else if (k === "c") st.setMode("crop");
        else if (k === "t") st.setMode("text");
        else if (k === "d") st.setMode("draw");
        else return;
      } else return;
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length && !(e.target as HTMLElement).closest("input, textarea")) {
        e.preventDefault();
        void upload(files);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [upload]);

  if (error)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg text-center">
        <p className="text-[14px] text-fg">Couldn&apos;t open this project.</p>
        <p className="text-[12.5px] text-dim">{error}</p>
        <a href="/studios" className="btn mt-2">
          Back to Studios
        </a>
      </div>
    );
  if (!s.loaded)
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-dim">
        <Spinner size={22} />
      </div>
    );

  const rightOpen = s.view === "editor" && (Boolean(s.toolId) || s.mode === "crop" || s.mode === "adjust");

  return (
    <ConfirmProvider>
      <div
        className="relative h-screen w-screen overflow-hidden bg-bg select-none"
        onDragEnter={(e) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(e) => {
          dragDepth.current = 0;
          setDragging(false);
          const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
          if (!files.length) return;
          e.preventDefault();
          if ((e.target as HTMLElement).closest("[data-dropzone]")) return; // input pickers handle their own drops
          void upload(files);
        }}
      >
        <TopBar />
        <ToolRail />
        {s.view === "editor" ? (
          <>
            <Stage rightOpen={rightOpen} />
            <Filmstrip rightOpen={rightOpen} />
            {s.mode === "crop" ? <CropPanel /> : s.mode === "adjust" ? <AdjustPanel /> : s.toolId ? <SettingsPanel /> : null}
          </>
        ) : (
          <Feed />
        )}
        {s.infoOpen && <DetailsPanel />}
        {s.libraryOpen && <Library />}
        <HelpButton rightOpen={rightOpen} />
        <Toasts />
        <Onboarding />
        {/* The editor is a desktop tool (like the reference); small screens get a clear note instead of a broken layout. */}
        <div className="fixed inset-0 z-[99] flex flex-col items-center justify-center gap-3 bg-black/95 p-8 text-center min-[900px]:hidden">
          <p className="text-[16px] font-medium text-fg">Fashion Studio works best on a larger screen</p>
          <p className="max-w-[320px] text-[13.5px] leading-[1.5] text-dim">Open this project on a laptop or desktop to use the editor. Your work is saved and synced.</p>
          <a href="/studios" className="btn mt-2 h-11 px-5">
            Back to projects
          </a>
        </div>
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-black/55 backdrop-blur-[1px]">
            <div className="rounded-[16px] border border-dashed border-accent/70 bg-black/60 px-8 py-6 text-[14px] text-fg">Drop images to add them to this project</div>
          </div>
        )}
      </div>
    </ConfirmProvider>
  );
}
