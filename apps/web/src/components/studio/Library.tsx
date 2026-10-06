"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useStudio, useAssets } from "@/lib/store";
import { cn } from "@/components/ui";

type Filter = "all" | "uploads" | "results" | "saved" | "marked";

/** Library: every image in the project, filterable; click to open, drag onto inputs. */
export function Library() {
  const assets = useAssets();
  const activeId = useStudio((s) => s.activeId);
  const setActive = useStudio((s) => s.setActive);
  const set = useStudio((s) => s.set);
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>("all");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest("[data-library-toggle]") || t.closest(".menu")) return;
      set({ libraryOpen: false });
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [set]);
  const list = assets.filter(
    (a) =>
      (f === "all" || (f === "uploads" && a.kind === "upload") || (f === "results" && a.kind === "result") || (f === "saved" && a.saved) || (f === "marked" && a.marked)) &&
      (!q || a.name.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div ref={ref} className="fixed top-[95px] bottom-[42px] left-[140px] z-40 flex w-[320px] animate-pop flex-col rounded-[13px] border border-line-2 bg-panel shadow-2xl">
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <h2 className="flex-1 text-[13px] font-medium">Library</h2>
        <button aria-label="Close library" className="flex h-7 w-7 items-center justify-center rounded-[8px] text-dim hover:bg-hover hover:text-fg" onClick={() => set({ libraryOpen: false })}>
          <X size={15} />
        </button>
      </header>
      <div className="mx-3 flex items-center gap-2 rounded-[8px] bg-[#1f1f1f] px-2">
        <Search size={13} className="text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-mute" />
      </div>
      <div className="mx-3 mt-2 flex gap-1">
        {(["all", "uploads", "results", "saved", "marked"] as Filter[]).map((x) => (
          <button key={x} className={cn("rounded-[7px] px-2 py-1 text-[11.5px] capitalize", f === x ? "bg-[#2a2a2a] text-fg" : "text-dim hover:text-fg")} onClick={() => setF(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="mt-2 grid min-h-0 flex-1 auto-rows-[90px] grid-cols-3 gap-1.5 overflow-y-auto px-3 pb-3">
        {list.map((a) => (
          <button
            key={a.id}
            title={a.name}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("application/x-fs-asset", a.id)}
            className={cn("overflow-hidden rounded-[7px] border-2", a.id === activeId ? "border-white" : "border-transparent hover:border-white/25")}
            onClick={() => {
              setActive(a.id);
              set({ view: "editor", libraryOpen: false });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.poster ?? a.url} alt="" className="h-full w-full object-cover" loading="lazy" />
          </button>
        ))}
        {list.length === 0 && <p className="col-span-3 py-10 text-center text-[12px] text-dim">Nothing here yet.</p>}
      </div>
    </div>
  );
}
