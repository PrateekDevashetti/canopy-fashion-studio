"use client";

import { CircleAlert, Check } from "lucide-react";
import { useStudio } from "@/lib/store";

export function Toasts() {
  const toasts = useStudio((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed top-[60px] left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="glass pointer-events-auto flex max-w-[520px] animate-pop items-center gap-2 rounded-[10px] px-3 py-2 text-[12.5px] text-fg">
          {t.tone === "error" ? <CircleAlert size={14} className="shrink-0 text-danger" /> : t.tone === "ok" ? <Check size={14} className="shrink-0 text-accent" /> : null}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
