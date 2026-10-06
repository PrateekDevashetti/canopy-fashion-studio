"use client";

import { useRef } from "react";
import { ArrowUpRight, Brush, Circle, Eraser, RotateCw, Square, Trash2, X } from "lucide-react";
import { ANN_COLORS, useStudio, type ShapeKind } from "@/lib/store";
import { saveAnnotations } from "@/lib/actions";
import { cn, Spinner, Tip } from "@/components/ui";
import { Slider } from "./Slider";

function Colors() {
  const ann = useStudio((s) => s.ann);
  const set = useStudio((s) => s.set);
  const picker = useRef<HTMLInputElement>(null);
  const custom = !ANN_COLORS.includes(ann.color);
  return (
    <div className="flex items-center gap-1.5 px-1">
      {ANN_COLORS.map((c) => (
        <button
          key={c}
          aria-label={`Color ${c}`}
          className={cn("h-[22px] w-[22px] rounded-full border border-white/15 transition-transform hover:scale-110", ann.color === c && "ring-2 ring-white/80 ring-offset-2 ring-offset-[#161616]")}
          style={{ background: c }}
          onClick={() => set({ ann: { ...ann, color: c } })}
        />
      ))}
      <button
        aria-label="Custom color"
        className={cn("h-[22px] w-[22px] rounded-full", custom && "ring-2 ring-white/80 ring-offset-2 ring-offset-[#161616]")}
        style={{ background: custom ? ann.color : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
        onClick={() => picker.current?.click()}
      />
      <input ref={picker} type="color" className="sr-only" value={ann.color} onChange={(e) => set({ ann: { ...ann, color: e.target.value } })} />
    </div>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-line-2" />;

export function ContextBar() {
  const s = useStudio();
  const close = () => s.setMode("select");
  const wrap = (children: React.ReactNode) => <div className="glass flex h-[46px] animate-pop items-center gap-1 rounded-[14px] px-1.5">{children}</div>;
  const segs = s.activeId ? s.segments[s.activeId] : undefined;

  if (s.mode === "lasso" || s.mode === "square" || s.mode === "auto") {
    if (!s.selection && s.mode !== "auto") return null;
    return wrap(
      <>
        {s.mode === "auto" && (
          <Tip label="Detect again">
            <button aria-label="Detect again" className="icon-btn" disabled={segs === "loading"} onClick={() => s.activeId && void s.loadSegments(s.activeId, true)}>
              {segs === "loading" ? <Spinner size={15} /> : <RotateCw size={16} strokeWidth={1.7} />}
            </button>
          </Tip>
        )}
        {s.mode === "auto" && <Sep />}
        <Tip label="Clear selection">
          <button aria-label="Clear selection" className="icon-btn" onClick={() => s.set({ selection: null })}>
            <Trash2 size={16} strokeWidth={1.7} />
          </button>
        </Tip>
        <Sep />
        <button aria-label="Exit selection" className="icon-btn" onClick={close}>
          <X size={16} strokeWidth={1.7} />
        </button>
      </>,
    );
  }

  if (s.mode === "brush")
    return wrap(
      <>
        <Slider className="w-[340px]" label="Size" value={s.brush.size} min={4} max={200} onChange={(v) => s.set({ brush: { ...s.brush, size: v } })} />
        <button aria-label="Brush" className={cn("icon-btn", !s.brush.erase && "bg-[#2e2e2e] text-fg")} onClick={() => s.set({ brush: { ...s.brush, erase: false } })}>
          <Brush size={16} strokeWidth={1.7} />
        </button>
        <button aria-label="Eraser" className={cn("icon-btn", s.brush.erase && "bg-[#2e2e2e] text-fg")} onClick={() => s.set({ brush: { ...s.brush, erase: true } })}>
          <Eraser size={16} strokeWidth={1.7} />
        </button>
        <Sep />
        {s.selection && (
          <button aria-label="Clear selection" className="icon-btn" onClick={() => s.set({ selection: null })}>
            <Trash2 size={16} strokeWidth={1.7} />
          </button>
        )}
        <button aria-label="Exit brush" className="icon-btn" onClick={close}>
          <X size={16} strokeWidth={1.7} />
        </button>
      </>,
    );

  if (s.mode === "draw" || s.mode === "shapes" || s.mode === "text") {
    const saving = s.busy === "annotate";
    return wrap(
      <>
        <Colors />
        <Sep />
        {s.mode === "draw" && <Slider className="w-[340px]" label="Stroke" value={s.ann.stroke} min={1} max={40} onChange={(v) => s.set({ ann: { ...s.ann, stroke: v } })} />}
        {s.mode === "text" && <Slider className="w-[340px]" label="Size" ticks value={s.ann.textSize} min={10} max={200} onChange={(v) => s.set({ ann: { ...s.ann, textSize: v } })} />}
        {s.mode === "shapes" &&
          (
            [
              ["rect", Square],
              ["ellipse", Circle],
              ["arrow", ArrowUpRight],
            ] as [ShapeKind, typeof Square][]
          ).map(([k, I]) => (
            <button key={k} aria-label={k} className={cn("icon-btn", s.ann.shape === k && "bg-[#2e2e2e] text-fg")} onClick={() => s.set({ ann: { ...s.ann, shape: k } })}>
              <I size={17} strokeWidth={1.7} />
            </button>
          ))}
        <Sep />
        <button aria-label="Discard" className="icon-btn" onClick={close}>
          <X size={16} strokeWidth={1.7} />
        </button>
        <button className="btn-white ml-0.5 h-9 px-4 text-[13px]" disabled={saving || !s.ann.items.length} onClick={() => void saveAnnotations()}>
          {saving ? <Spinner size={14} /> : "Save"}
        </button>
      </>,
    );
  }
  return null;
}
