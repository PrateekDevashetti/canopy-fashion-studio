"use client";

import { useRef, useState } from "react";
import { BookOpen, Keyboard, LifeBuoy, PlayCircle } from "lucide-react";
import { useStudio } from "@/lib/store";
import { Modal, Popover } from "@/components/ui";

const SHORTCUTS: [string, string][] = [
  ["Editor / Feed", "E / F"],
  ["Select", "V"],
  ["Lasso", "L"],
  ["Brush", "B"],
  ["Auto detect", "A"],
  ["Square (Shift for 1:1)", "S"],
  ["Crop", "C"],
  ["Draw / Text", "D / T"],
  ["Zoom in / out / fit", "⌘ + / ⌘ − / ⌘ 0"],
  ["Pan", "Space + drag"],
  ["Multi-select in Feed", "⇧ / ⌘ click"],
  ["Generate from Prompt", "⌘ ↵"],
  ["Paste image", "⌘ V"],
  ["Cancel", "Esc"],
];

export function HelpButton({ rightOpen }: { rightOpen: boolean }) {
  const set = useStudio((s) => s.set);
  const view = useStudio((s) => s.view);
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const right = view === "editor" && rightOpen ? 289 : 18;
  return (
    <>
      <button ref={ref} aria-label="Help" className="fixed z-30 flex h-[32px] w-[32px] items-center justify-center rounded-full border border-line-2 bg-[#141414] text-[13px] text-fg-2 hover:bg-hover hover:text-fg" style={{ right, bottom: view === "editor" ? 104 : 18 }} onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top-end" className="w-[220px]">
        <button className="menu-item" onClick={() => (setOpen(false), setKeys(true))}>
          <Keyboard size={14} /> Keyboard shortcuts
        </button>
        <button className="menu-item" onClick={() => (setOpen(false), set({ welcome: "tour", tourStep: 0, view: "editor" }))}>
          <PlayCircle size={14} /> Take the tour
        </button>
        <a className="menu-item" href="/#faq" target="_blank" rel="noreferrer">
          <BookOpen size={14} /> Fashion Studio guide
        </a>
        <a className="menu-item" href="mailto:hello@trycanopy.space?subject=Fashion%20Studio">
          <LifeBuoy size={14} /> Contact support
        </a>
      </Popover>
      <Modal open={keys} onClose={() => setKeys(false)} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2.5">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[12.5px] text-dim">{k}</dt>
              <dd className="text-right font-mono text-[12px] text-fg-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </>
  );
}
