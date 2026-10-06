"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { SECTIONS, SOON, TOOLS, type Tool } from "@fashion/core/tools";
import { useStudio } from "@/lib/store";
import { cn, Tip } from "@/components/ui";
import { LibraryIcon } from "./icons";
import { pickFiles, useUploader } from "./useUploader";

const SEEN_KEY = "fs.seenTools";

function useSeen() {
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
    } catch {}
  }, []);
  const mark = (id: string) =>
    setSeen((s) => {
      if (s.includes(id)) return s;
      const next = [...s, id];
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return { seen, mark };
}

function PreviewCard({ tool, top }: { tool: Tool; top: number }) {
  return createPortal(
    <div className="pointer-events-none fixed left-[145px] z-[60] h-[213px] w-[213px] animate-pop overflow-hidden rounded-[12px] border border-line-2 bg-panel shadow-[0_16px_50px_rgba(0,0,0,0.7)]" style={{ top }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tool.preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_38%,rgba(0,0,0,0.82)_100%)]" />
      <div className="absolute inset-x-[13px] bottom-[12px]">
        <div className="text-[12.5px] font-semibold text-white">{tool.name}</div>
        <div className="mt-1 text-[11.5px] leading-[1.4] text-white/80">{tool.description}</div>
      </div>
    </div>,
    document.body,
  );
}

function ToolTile({ tool, seen, onSeen }: { tool: Tool; seen: boolean; onSeen: () => void }) {
  const toolId = useStudio((s) => s.toolId);
  const view = useStudio((s) => s.view);
  const openTool = useStudio((s) => s.openTool);
  const set = useStudio((s) => s.set);
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = toolId === tool.id && view === "editor";
  return (
    <>
      <button
        ref={ref}
        data-tool={tool.id}
        data-tour={`tool-${tool.id}`}
        aria-pressed={selected}
        className="group relative flex flex-col items-center gap-[6px]"
        onPointerEnter={() => {
          timer.current = setTimeout(() => {
            const r = ref.current?.getBoundingClientRect();
            if (r) setHover(Math.min(window.innerHeight - 225, Math.max(70, r.top + r.height / 2 - 140)));
          }, 220);
        }}
        onPointerLeave={() => {
          if (timer.current) clearTimeout(timer.current);
          setHover(null);
        }}
        onClick={() => {
          setHover(null);
          onSeen();
          set({ view: "editor" });
          openTool(selected ? null : tool.id);
        }}
      >
        <span className={cn("flex h-[53px] w-[53px] items-center justify-center rounded-[12px] transition-colors", selected ? "bg-accent-bg" : "group-hover:bg-[#262626]", hover != null && !selected && "bg-[#262626]")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tool.icon} alt="" width={40} height={40} className="h-[40px] w-[40px] object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]" draggable={false} />
        </span>
        <span className={cn("text-[10.5px] leading-none", selected ? "font-semibold text-white" : "text-mute group-hover:text-fg-2")}>{tool.short}</span>
        {tool.isNew && !seen && <span className="absolute top-[-3px] right-[4px] h-[6px] w-[6px] rounded-full bg-accent" aria-label="New" />}
      </button>
      {hover != null && <PreviewCard tool={tool} top={hover} />}
    </>
  );
}

export function ToolRail() {
  const libraryOpen = useStudio((s) => s.libraryOpen);
  const set = useStudio((s) => s.set);
  const upload = useUploader();
  const { seen, mark } = useSeen();
  return (
    <aside className="fixed top-[95px] bottom-[42px] left-[10px] z-20 flex w-[124px] flex-col rounded-[13px] border border-line bg-panel" data-tour="rail">
      <div className="flex gap-[5px] p-[6px]">
        <Tip label="Library" side="right">
          <button aria-label="Library" data-library-toggle className={cn("flex h-[53px] w-[53px] items-center justify-center rounded-[11px] bg-[#232323] text-fg-2 hover:bg-[#2b2b2b]", libraryOpen && "bg-[#2e2e2e] text-fg")} onClick={() => set({ libraryOpen: !libraryOpen })}>
            <LibraryIcon size={17} />
          </button>
        </Tip>
        <Tip label="Upload" side="right">
          <button
            aria-label="Upload"
            data-tour="upload"
            className="flex h-[53px] w-[53px] items-center justify-center rounded-[11px] border border-dashed border-line-3 text-fg-2 hover:border-[#4a4a4a] hover:bg-[#1c1c1c]"
            onClick={async () => {
              const files = await pickFiles();
              if (files.length) await upload(files);
            }}
          >
            <Plus size={17} strokeWidth={1.6} />
          </button>
        </Tip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-3 [scrollbar-width:none]">
        {SECTIONS.map((sec) => (
          <section key={sec.id}>
            <div className="mx-[7px] mt-[9px] mb-[12px] flex items-center gap-2">
              <span className="h-px flex-1 bg-line-2" />
              <span className="text-[11px] font-medium text-fg-2">{sec.label}</span>
              <span className="h-px flex-1 bg-line-2" />
            </div>
            <div className="grid grid-cols-2 gap-x-[4px] gap-y-[13px] px-[6px]">
              {TOOLS.filter((t) => t.section === sec.id).map((t) => (
                <ToolTile key={t.id} tool={t} seen={seen.includes(t.id)} onSeen={() => mark(t.id)} />
              ))}
            </div>
          </section>
        ))}
        <section>
          <div className="mx-[7px] mt-[14px] mb-[10px] flex items-center gap-2">
            <span className="h-px flex-1 bg-line-2" />
            <span className="text-[11px] font-medium text-faint">Soon</span>
            <span className="h-px flex-1 bg-line-2" />
          </div>
          <div className="flex flex-col gap-1 px-[8px]">
            {SOON.map((t) => (
              <Tip key={t.id} label={t.description} side="right">
                <div className="w-full cursor-default rounded-[8px] px-1.5 py-1 text-[10.5px] text-faint">{t.name}</div>
              </Tip>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
