"use client";

import { X } from "lucide-react";
import { useStudio, ADJUST_DEFAULT, type Adjust } from "@/lib/store";
import { saveAdjust, saveCrop } from "@/lib/actions";
import { cn, Spinner } from "@/components/ui";
import { Slider } from "./Slider";

function Shell({ title, desc, children, onSave, saving }: { title: string; desc: string; children: React.ReactNode; onSave: () => void; saving: boolean }) {
  const setMode = useStudio((s) => s.setMode);
  return (
    <aside className="fixed top-[64px] right-[10px] bottom-[8px] z-20 flex w-[266px] animate-fade-in flex-col rounded-[13px] border border-line bg-panel">
      <header className="mx-[10px] flex items-start gap-2 border-b border-line-2 pt-[12px] pb-[11px]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium text-fg">{title}</h2>
          <p className="mt-[3px] text-[11px] text-dim">{desc}</p>
        </div>
        <button aria-label="Close" className="-mr-1 flex h-7 w-7 items-center justify-center rounded-[8px] text-dim hover:bg-hover hover:text-fg" onClick={() => setMode("select")}>
          <X size={15} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-[10px] pt-[12px]">{children}</div>
      <footer className="mx-[10px] border-t border-line-2 pt-[10px] pb-[10px]">
        <button className="btn-accent w-full" disabled={saving} onClick={onSave}>
          {saving ? <Spinner size={15} /> : "Save"}
        </button>
      </footer>
    </aside>
  );
}

function Num({ label, value, onChange, min = 0, max = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="flex flex-1 items-center gap-2 text-[11.5px] text-dim">
      {label}
      <input
        type="number"
        step={0.01}
        min={min}
        max={max}
        value={Number(value.toFixed(2))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-full min-w-0 bg-transparent font-mono text-[11.5px] text-fg-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
    </label>
  );
}

export function CropPanel() {
  const crop = useStudio((s) => s.crop);
  const set = useStudio((s) => s.set);
  const busy = useStudio((s) => s.busy === "crop");
  const upd = (p: Partial<typeof crop>) => {
    const c = { ...crop, ...p };
    c.w = Math.min(c.w, 1);
    c.h = Math.min(c.h, 1);
    c.cx = Math.min(1 - c.w / 2, Math.max(c.w / 2, c.cx));
    c.cy = Math.min(1 - c.h / 2, Math.max(c.h / 2, c.cy));
    set({ crop: c });
  };
  return (
    <Shell title="Crop" desc="Resize, reposition, and rotate" onSave={() => void saveCrop()} saving={busy}>
      <div className="px-[3px]">
        <div className="label mb-2">Center</div>
        <div className="mb-4 flex gap-3">
          <Num label="X" value={crop.cx} onChange={(v) => upd({ cx: v })} />
          <Num label="Y" value={crop.cy} onChange={(v) => upd({ cy: v })} />
        </div>
        <div className="label mb-2">Size</div>
        <div className="mb-4 flex gap-3">
          <Num label="X" value={crop.w} min={0.03} onChange={(v) => upd({ w: v, ...(crop.lock ? { h: (crop.h * v) / crop.w } : {}) })} />
          <Num label="Y" value={crop.h} min={0.03} onChange={(v) => upd({ h: v, ...(crop.lock ? { w: (crop.w * v) / crop.h } : {}) })} />
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="label">Lock ratio</span>
          <button role="switch" aria-checked={crop.lock} aria-label="Lock ratio" className={cn("relative h-[18px] w-[30px] rounded-full transition-colors", crop.lock ? "bg-accent" : "bg-[#3a3a3a]")} onClick={() => upd({ lock: !crop.lock })}>
            <span className={cn("absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all", crop.lock ? "left-[14px]" : "left-[2px]")} />
          </button>
        </div>
        <Slider label="Rotation (deg)" value={crop.rot} min={-45} max={45} center={0} onChange={(v) => upd({ rot: v })} />
        <div className="mt-4 flex flex-wrap gap-1.5">
          {[
            ["Free", 0],
            ["1:1", 1],
            ["4:5", 0.8],
            ["3:4", 0.75],
            ["16:9", 16 / 9],
          ].map(([l, r]) => (
            <button
              key={l as string}
              className="btn h-7 px-2.5 text-[11.5px]"
              onClick={() => {
                if (!r) return upd({ lock: false });
                const a = useStudio.getState().active();
                const W = a?.width || 1;
                const H = a?.height || 1;
                // Largest box of ratio r that fits the image.
                let w = 1;
                let h = (W / (r as number)) / H;
                if (h > 1) {
                  h = 1;
                  w = (H * (r as number)) / W;
                }
                upd({ w, h, cx: 0.5, cy: 0.5, lock: true });
              }}
            >
              {l as string}
            </button>
          ))}
        </div>
      </div>
    </Shell>
  );
}

const ROWS: { key: keyof Adjust; label: string; min: number; max: number; step: number; gradient?: string }[] = [
  { key: "warmth", label: "Warmth", min: -100, max: 100, step: 1, gradient: "linear-gradient(90deg,#4ea4ff,#9a9a9a,#ffbf3d)" },
  { key: "contrast", label: "Contrast", min: 0, max: 2, step: 0.01 },
  { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
  { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
  { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
  { key: "tint", label: "Tint", min: -100, max: 100, step: 1, gradient: "linear-gradient(90deg,#4cd964,#9a9a9a,#d84cf0)" },
  { key: "hue", label: "Hue", min: -180, max: 180, step: 1, gradient: "linear-gradient(90deg,#ff4d4d,#ffd84d,#5dff4d,#4dfff0,#4d6bff,#e14dff,#ff4d4d)" },
];

export function AdjustPanel() {
  const adjust = useStudio((s) => s.adjust);
  const set = useStudio((s) => s.set);
  const busy = useStudio((s) => s.busy === "adjust");
  return (
    <Shell title="Image adjustments" desc="Adjust color, tone, and light" onSave={() => void saveAdjust()} saving={busy}>
      <div className="flex flex-col gap-[10px]">
        {ROWS.map((r) => (
          <Slider
            key={r.key}
            className="h-[38px] rounded-[9px] bg-[#1d1d1d]"
            label={r.label}
            value={adjust[r.key]}
            min={r.min}
            max={r.max}
            step={r.step}
            center={ADJUST_DEFAULT[r.key]}
            gradient={r.gradient}
            format={(v) => (r.step < 1 ? String(Number(v.toFixed(2))) : String(Math.round(v)))}
            onChange={(v) => set({ adjust: { ...adjust, [r.key]: v } })}
          />
        ))}
        <button className="btn-ghost mt-1 self-start text-[11.5px] text-dim hover:text-fg" onClick={() => set({ adjust: { ...ADJUST_DEFAULT } })}>
          Reset all
        </button>
      </div>
    </Shell>
  );
}
