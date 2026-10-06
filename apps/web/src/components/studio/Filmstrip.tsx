"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, Play } from "lucide-react";
import { timeAgo, type RunDTO } from "@/lib/api";
import { useStudio, isPending } from "@/lib/store";
import { cn, Tip } from "@/components/ui";
import { PinToggleIcon } from "./icons";

export const runTitle = (r: RunDTO) => (r.tool === "upload" ? r.outputs[0]?.name || "Upload" : r.outputs[0]?.name || r.toolName);

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Filmstrip({ rightOpen }: { rightOpen: boolean }) {
  const runs = useStudio((s) => s.runs);
  const activeId = useStudio((s) => s.activeId);
  const setActive = useStudio((s) => s.setActive);
  const pinned = useStudio((s) => s.stripPinned);
  const set = useStudio((s) => s.set);
  const now = useNow();
  const [peek, setPeek] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const visible = runs.filter((r) => r.outputs.length || isPending(r) || r.status === "failed").slice(0, 80);
  // Oldest on the left, newest on the right — like the reference strip.
  const ordered = [...visible].reverse();

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [visible.length]);

  if (!runs.length) return null;
  const shown = pinned || peek;

  return (
    <>
      {!pinned && <div className="fixed right-0 bottom-0 left-[140px] z-20 h-[18px]" onPointerEnter={() => setPeek(true)} />}
      <div
        className={cn("fixed bottom-[8px] left-[140px] z-20 h-[85px] rounded-[13px] border border-line bg-panel transition-transform duration-300", !shown && "translate-y-[110px]")}
        style={{ right: rightOpen ? 276 : 10 }}
        onPointerLeave={() => setPeek(false)}
        data-tour="filmstrip"
      >
        <div ref={scroller} className="flex h-full items-start gap-[22px] overflow-x-auto overflow-y-hidden pr-12 pl-[15px] [scrollbar-width:none]">
          {ordered.map((r) => (
            <div key={r.id} className="flex shrink-0 flex-col pt-[11px]">
              <div className="mb-[7px] flex h-[13px] items-center gap-[6px] text-[10.5px] whitespace-nowrap">
                <span className="max-w-[230px] truncate text-fg-2 uppercase">{runTitle(r)}</span>
                <span className="text-mute">{isPending(r) ? "Generating…" : timeAgo(r.finishedAt ?? r.createdAt, now)}</span>
              </div>
              <div className="flex gap-[6px]">
                {r.outputs.map((o) => (
                  <button
                    key={o.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-fs-asset", o.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    aria-label={o.name}
                    className={cn("relative h-[46px] w-[46px] overflow-hidden rounded-[6px] border-2 transition-colors", o.id === activeId ? "border-white" : "border-transparent hover:border-white/30")}
                    onClick={() => setActive(o.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.poster ?? o.url} alt="" loading="lazy" className={cn("h-full w-full object-cover", o.mime === "image/png" && "bg-[#262626]")} draggable={false} />
                    {o.media === "video" && (
                      <span className="absolute right-0.5 bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/70">
                        <Play size={7} fill="white" />
                      </span>
                    )}
                  </button>
                ))}
                {isPending(r) &&
                  Array.from({ length: Math.max(0, r.expected - r.outputs.length) }, (_, i) => (
                    <button key={i} aria-label="Generating" className={cn("shimmer h-[46px] w-[46px] rounded-[6px] border-2", activeId === `pending:${r.id}` ? "border-white" : "border-transparent")} onClick={() => setActive(`pending:${r.id}`)} />
                  ))}
                {r.status === "failed" && !r.outputs.length && (
                  <Tip label={r.error ?? "Generation failed — credits refunded"} side="top">
                    <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[6px] border border-danger-line bg-danger-bg text-danger">
                      <CircleAlert size={16} />
                    </span>
                  </Tip>
                )}
              </div>
            </div>
          ))}
        </div>
        <Tip label={pinned ? "Auto-hide strip" : "Pin strip"} side="top">
          <button aria-label="Toggle strip pin" className="absolute top-[8px] right-[10px] flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-accent-fg hover:bg-hover" onClick={() => set({ stripPinned: !pinned })}>
            <PinToggleIcon size={13} pinned={pinned} />
          </button>
        </Tip>
      </div>
    </>
  );
}
