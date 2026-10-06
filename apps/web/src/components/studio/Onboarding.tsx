"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { useStudio } from "@/lib/store";
import { AUTO_ADVANCE_MS, autoAdvance, endTour, enterStep, startTour, TOUR } from "@/lib/tour";
import { CanopyMark, Spinner } from "@/components/ui";
import { Collage } from "./EmptyState";
import { SignupGate } from "./SignupGate";

function useRect(selector: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) return setRect(null);
    let raf = 0;
    let last = "";
    const tick = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${r.x},${r.y},${r.width},${r.height}` : "";
      if (key !== last) {
        last = key;
        setRect(r && r.width ? r : null);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  return rect;
}

function Media({ srcs }: { srcs: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (srcs.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % srcs.length), 1600);
    return () => clearInterval(t);
  }, [srcs]);
  if (!srcs.length) return <div className="h-[150px] bg-[linear-gradient(135deg,#1d1d1d,#121212)]" />;
  return (
    <div className="relative h-[190px] overflow-hidden bg-[#0d0d0d]">
      {srcs.map((s, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={s} src={s} alt="" className="absolute inset-0 m-auto h-[86%] w-auto rounded-[4px] object-contain transition-opacity duration-700" style={{ opacity: k === i ? 1 : 0 }} />
      ))}
    </div>
  );
}

function Spotlight() {
  const step = useStudio((s) => s.tourStep);
  const def = TOUR[step];
  const rect = useRect(def?.target ?? null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(330);
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });
  if (!def) return null;
  const pad = def.id === "select" ? 0 : 4;
  const r = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  const W = 340;
  let card: React.CSSProperties = { right: 300, bottom: 24 };
  if (r) {
    if (def.place === "left") card = { left: Math.max(16, r.x - W - 14), top: Math.max(70, Math.min(window.innerHeight - 340, r.y + r.h - cardH)) };
    if (def.place === "below") card = { left: Math.min(window.innerWidth - W - 16, Math.max(16, r.x + r.w / 2 - W / 2)), top: r.y + r.h + 14 };
    if (def.place === "above-left") card = { left: Math.max(16, r.x - W / 2), top: Math.max(70, r.y + r.h - 330) };
  }
  if (typeof card.top === "number") card.top = Math.max(16, Math.min(card.top, window.innerHeight - cardH - 16));
  const last = step === TOUR.length - 1;
  return createPortal(
    <div className="fixed inset-0 z-[75]" style={{ pointerEvents: "none" }}>
      {r ? (
        <>
          {/* Blockers around the hole keep the user on the highlighted control. */}
          <div className="pointer-events-auto absolute top-0 left-0 w-full bg-black/55" style={{ height: r.y }} />
          <div className="pointer-events-auto absolute left-0 w-full bg-black/55" style={{ top: r.y + r.h, bottom: 0 }} />
          <div className="pointer-events-auto absolute left-0 bg-black/55" style={{ top: r.y, height: r.h, width: r.x }} />
          <div className="pointer-events-auto absolute right-0 bg-black/55" style={{ top: r.y, height: r.h, left: r.x + r.w }} />
          <div className="absolute rounded-[12px] border-2 border-accent shadow-[0_0_24px_rgba(91,196,102,0.55)] transition-all duration-300" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-black/55" />
      )}
      <div ref={cardRef} className="pointer-events-auto absolute w-[340px] animate-pop overflow-hidden rounded-[16px] border border-line-2 bg-[#161616] shadow-[0_20px_60px_rgba(0,0,0,0.7)]" style={card}>
        <Media srcs={def.media} />
        <button aria-label="Close tour" className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80" onClick={() => void endTour()}>
          <X size={16} />
        </button>
        {!last && (
          <div className="h-[2px] w-full bg-white/10" aria-hidden>
            <div key={step} className="h-full bg-accent" style={{ animation: `tour-countdown ${AUTO_ADVANCE_MS}ms linear forwards` }} />
          </div>
        )}
        <div className="px-5 pt-4 pb-5">
          <div className="text-[16px] font-medium text-fg">{def.title}</div>
          <p className="mt-1.5 text-[13.5px] leading-[1.45] text-fg-2">{def.body}</p>
          {last && (
            <>
              <button className="mt-4 h-10 w-full rounded-[10px] bg-[#d9d9d9] text-[13.5px] font-medium text-black hover:bg-white" disabled={busy} onClick={async () => (setBusy(true), await endTour())}>
                {busy ? <Spinner size={14} /> : "Finish"}
              </button>
              <button className="mt-3 flex items-center gap-1.5 text-[12.5px] text-dim hover:text-fg" onClick={() => void enterStep(step - 1)}>
                <ArrowLeft size={13} /> Back
              </button>
            </>
          )}
          <div className="mt-4 flex gap-1">
            {TOUR.map((_, k) => (
              <span key={k} className={k <= step ? "h-1 flex-1 rounded-full bg-accent" : "h-1 flex-1 rounded-full bg-[#2c2c2c]"} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Welcome() {
  const set = useStudio((s) => s.set);
  const [busy, setBusy] = useState(false);
  return createPortal(
    <div className="fixed inset-0 z-[78] animate-fade-in bg-black">
      <div className="absolute inset-0 blur-[10px] brightness-[0.45]">
        <Collage />
      </div>
      <button aria-label="Close" className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-[#1c1c1c] text-fg-2 hover:text-fg" onClick={() => void endTour()}>
        <X size={16} />
      </button>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <CanopyMark size={42} />
        <h1 className="mt-[22px] text-[25px] font-medium tracking-[-0.01em] text-fg">Welcome to Fashion Studio</h1>
        <p className="mt-[7px] max-w-[290px] text-[12.5px] leading-[1.45] text-dim">See how you can go from idea to garment to campaign, all in one tool.</p>
        <button
          className="btn-accent mt-[22px] h-10 rounded-[9px] px-[13px] text-[12.5px]"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await startTour().catch(() => set({ welcome: "hidden" }));
            setBusy(false);
          }}
        >
          {busy ? <Spinner size={16} /> : "Get started"}
        </button>
        <button className="mt-[10px] text-[11.5px] text-dim hover:text-fg" onClick={() => void endTour()}>
          Skip onboarding
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function Onboarding() {
  const welcome = useStudio((s) => s.welcome);
  const step = useStudio((s) => s.tourStep);
  const selection = useStudio((s) => s.selection);
  const view = useStudio((s) => s.view);
  const [gate, setGate] = useState(false);

  // Advance on the user's own actions (click the garment, switch to Feed).
  useEffect(() => {
    if (welcome !== "tour") return;
    if (TOUR[step]?.id === "select" && selection?.kind === "segment") {
      useStudio.getState().setInput("garment-recolor", "mask", selection.segment.maskKey);
      useStudio.getState().setInput("garment-recolor", "maskLabel", selection.segment.label);
      void enterStep(2);
    }
    if (TOUR[step]?.id === "review" && view === "feed") void enterStep(5);
  }, [welcome, step, selection, view]);

  // …or after AUTO_ADVANCE_MS without a click, do the step for them (not on the final step).
  useEffect(() => {
    if (welcome !== "tour" || step >= TOUR.length - 1) return;
    const t = window.setTimeout(() => void autoAdvance(step), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [welcome, step]);

  useEffect(() => {
    const open = () => setGate(true);
    window.addEventListener("fs:signup", open);
    return () => window.removeEventListener("fs:signup", open);
  }, []);

  return (
    <>
      {welcome === "intro" && <Welcome />}
      {welcome === "tour" && <Spotlight />}
      {gate && <SignupGate onClose={() => setGate(false)} />}
    </>
  );
}
