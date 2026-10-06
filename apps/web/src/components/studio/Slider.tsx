"use client";

import { useRef } from "react";
import { cn } from "@/components/ui";

/**
 * Field-style slider: label on the left, value on the right, the filled portion shaded,
 * optional gradient rail under it (Warmth / Tint / Hue). Drag anywhere; arrow keys nudge.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  gradient,
  ticks,
  className,
  center,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  gradient?: string;
  ticks?: boolean;
  className?: string;
  /** Fill from this value instead of from min (bipolar sliders). */
  center?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;
  const from = center != null ? ((center - min) / (max - min)) * 100 : 0;
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const v = Math.round((min + t * (max - min)) / step) * step;
    onChange(Number(v.toFixed(4)));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className={cn("relative flex h-[30px] cursor-ew-resize touch-none items-center overflow-hidden rounded-[8px] bg-[#1f1f1f] px-2.5 outline-none select-none focus-visible:ring-1 focus-visible:ring-line-3", className)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        set(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e.clientX)}
      onDoubleClick={() => center != null && onChange(center)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(max, Number((value + step).toFixed(4))));
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(min, Number((value - step).toFixed(4))));
        else return;
        e.preventDefault();
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 bg-[#2b2b2b]" style={{ left: `${Math.min(from, pct)}%`, width: `${Math.abs(pct - from)}%` }} />
      {ticks && (
        <div className="pointer-events-none absolute inset-x-[30%] inset-y-[9px] flex justify-between">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="w-px bg-[#3b3b3b]" />
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-[6px] w-[2px] rounded bg-[#d9d9d9] opacity-0 transition-opacity [div:hover>&]:opacity-100" style={{ left: `calc(${pct}% - 1px)` }} />
      <span className="pointer-events-none relative z-[1] text-[12px] text-fg-2">{label}</span>
      <span className="pointer-events-none relative z-[1] ml-auto font-mono text-[11.5px] text-fg-2">{format(value)}</span>
      {gradient && <div className="pointer-events-none absolute inset-x-1 bottom-[2px] h-[2px] rounded-full" style={{ background: gradient }} />}
    </div>
  );
}
