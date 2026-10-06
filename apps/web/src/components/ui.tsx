"use client";

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(...a));

/** Close on outside click / Escape. */
export function useDismiss(open: boolean, onClose: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [open, onClose, refs]);
}

type Placement = "bottom-start" | "bottom-end" | "bottom" | "top-start" | "top-end" | "right-start" | "left-start";

/** Anchored floating layer rendered in a portal (never clipped by panels). */
export function Popover({
  open,
  onClose,
  anchor,
  placement = "bottom-start",
  offset = 8,
  children,
  className,
  matchWidth,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLElement | null>;
  placement?: Placement;
  offset?: number;
  children: ReactNode;
  className?: string;
  matchWidth?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width?: number } | null>(null);
  useDismiss(open, onClose, [ref, anchor]);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const a = anchor.current!.getBoundingClientRect();
      const el = ref.current;
      const w = el?.offsetWidth ?? 0;
      const h = el?.offsetHeight ?? 0;
      let top = a.bottom + offset;
      let left = a.left;
      if (placement === "bottom-end") left = a.right - w;
      if (placement === "bottom") left = a.left + a.width / 2 - w / 2;
      if (placement.startsWith("top")) top = a.top - h - offset;
      if (placement === "top-end") left = a.right - w;
      if (placement === "right-start") {
        top = a.top;
        left = a.right + offset;
      }
      if (placement === "left-start") {
        top = a.top;
        left = a.left - w - offset;
      }
      // Flip/clamp inside the viewport.
      if (top + h > window.innerHeight - 8) top = Math.max(8, (placement.startsWith("bottom") ? a.top - h - offset : window.innerHeight - h - 8));
      left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
      setPos({ top, left, width: matchWidth ? a.width : undefined });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, placement, offset, matchWidth]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className={cn("menu fixed", className)} style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, visibility: pos ? "visible" : "hidden" }}>
      {children}
    </div>,
    document.body,
  );
}

/** Small dark tooltip shown under (or beside) an element after a short delay. */
export function Tip({ label, children, side = "bottom", kbd }: { label: string; children: ReactNode; side?: "bottom" | "right" | "top"; kbd?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const enter = () => {
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      if (side === "right") setPos({ top: r.top + r.height / 2, left: r.right + 10 });
      else if (side === "top") setPos({ top: r.top - 10, left: r.left + r.width / 2 });
      else setPos({ top: r.bottom + 10, left: r.left + r.width / 2 });
      setShow(true);
    }, 350);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };
  return (
    <span ref={ref} className="inline-flex" onPointerEnter={enter} onPointerLeave={leave} onPointerDown={leave}>
      {children}
      {show &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[90] flex animate-fade-in items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-line-2 bg-[#1d1d1d] px-2 py-1 text-[12px] text-fg shadow-lg"
            style={{ top: pos.top, left: pos.left, transform: side === "right" ? "translateY(-50%)" : side === "top" ? "translate(-50%,-100%)" : "translateX(-50%)" }}
          >
            {label}
            {kbd && <span className="kbd">{kbd}</span>}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function Modal({ open, onClose, children, className, title, width }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; title?: string; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={cn("panel relative w-full max-w-[440px] animate-pop p-5 shadow-2xl", className)} style={width ? { maxWidth: width } : undefined}>
        {title && <h2 className="mb-4 pr-8 text-[15px] font-medium">{title}</h2>}
        <button aria-label="Close" onClick={onClose} className="icon-btn absolute top-3 right-3 h-7 w-7">
          <X size={15} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOpts = { title: string; body?: string; confirm?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

/** In-app confirm dialog (never window.confirm). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => done(false)} title={state?.title}>
        {state?.body && <p className="-mt-2 mb-5 text-[13px] leading-relaxed text-dim">{state.body}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button autoFocus className={cn("btn", state?.danger ? "bg-danger text-white hover:bg-[#f26b68]" : "bg-white text-black hover:bg-white/90")} onClick={() => done(true)}>
            {state?.confirm ?? "Confirm"}
          </button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("animate-spin", className)} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** The Canopy mark (replaces the studio logo everywhere). */
export function CanopyMark({ size = 22, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/canopy-mark.svg" alt="Canopy" width={Math.round(size * 0.754)} height={size} className={cn("select-none", className)} draggable={false} />;
}
