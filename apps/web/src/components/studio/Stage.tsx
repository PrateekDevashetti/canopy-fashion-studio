"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStudio, isPending, useAssets } from "@/lib/store";
import { applyAdjust, isNeutral, loadImage } from "@/lib/render";
import { Spinner } from "@/components/ui";
import { EmptyState } from "./EmptyState";
import { Overlays } from "./Overlays";

export const STRIP_H = 98;

/** Canvas area bounds in viewport px (matches the reference 1600×900 layout). */
export function useStageBox(rightOpen: boolean) {
  const pinned = useStudio((s) => s.stripPinned);
  const [vw, setVw] = useState(1600);
  const [vh, setVh] = useState(900);
  useEffect(() => {
    const r = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    r();
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  const left = 140;
  const right = rightOpen ? 276 : 10;
  const top = 67;
  const bottom = pinned ? 94 : 14;
  return { left, top, width: Math.max(200, vw - left - right), height: Math.max(200, vh - top - bottom), vw, vh };
}

function AdjustPreview({ url, width, height }: { url: string; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const adjust = useStudio((s) => s.adjust);
  const src = useRef<ImageData | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadImage(url).then((img) => {
      if (cancelled || !ref.current) return;
      const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = ref.current;
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      src.current = ctx.getImageData(0, 0, c.width, c.height);
      draw();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const draw = () => {
    const c = ref.current;
    if (!c || !src.current) return;
    const d = new ImageData(new Uint8ClampedArray(src.current.data), src.current.width, src.current.height);
    if (!isNeutral(useStudio.getState().adjust)) applyAdjust(d.data, useStudio.getState().adjust);
    c.getContext("2d")!.putImageData(d, 0, 0);
  };
  useEffect(() => {
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjust]);
  return <canvas ref={ref} style={{ width, height }} className="absolute inset-0 rounded-[2px]" />;
}

function Grid({ box }: { box: ReturnType<typeof useStageBox> }) {
  const assets = useAssets();
  const setActive = useStudio((s) => s.setActive);
  const set = useStudio((s) => s.set);
  return (
    <div className="fixed overflow-y-auto" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-2">
        {assets.map((a) => (
          <button
            key={a.id}
            className="group relative aspect-[4/5] overflow-hidden rounded-[10px] border border-line bg-panel"
            onClick={() => {
              setActive(a.id);
              set({ board: "single" });
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.poster ?? a.url} alt={a.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-left text-[10.5px] text-white/85 uppercase">{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stage({ rightOpen }: { rightOpen: boolean }) {
  const s = useStudio();
  const box = useStageBox(rightOpen);
  const active = s.active();
  const pendingRun = s.activeId?.startsWith("pending:") ? s.runs.find((r) => `pending:${r.id}` === s.activeId) : undefined;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [space, setSpace] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setPan({ x: 0, y: 0 }), [s.activeId]);
  useEffect(() => {
    if (s.zoom === 1) setPan({ x: 0, y: 0 });
  }, [s.zoom]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input, textarea")) {
        setSpace(true);
        e.preventDefault();
      }
      if ((e.key === "=" || e.key === "+") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        s.set({ zoom: Math.min(8, useStudio.getState().zoom * 1.25) });
      }
      if (e.key === "-" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        s.set({ zoom: Math.max(0.1, useStudio.getState().zoom / 1.25) });
      }
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        s.set({ zoom: 1 });
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘/ctrl + wheel (and trackpad pinch) zooms; plain wheel pans when zoomed in.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const z = useStudio.getState().zoom;
        useStudio.setState({ zoom: Math.min(8, Math.max(0.1, z * Math.exp(-e.deltaY * 0.0025))) });
      } else if (useStudio.getState().zoom > 1) {
        e.preventDefault();
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [active?.id]);

  const hasAnything = s.runs.length > 0;
  if (!hasAnything) return <EmptyState box={box} />;
  if (s.board === "grid" && !active) return <Grid box={box} />;

  if (pendingRun || (!active && s.runs.some(isPending))) {
    const aspect = pendingRun?.settings.aspect && pendingRun.settings.aspect !== "Auto" ? pendingRun.settings.aspect.split(":").map(Number) : [1.1, 1];
    const h = Math.min(box.height, box.width / (aspect[0] / aspect[1]));
    const w = h * (aspect[0] / aspect[1]);
    return (
      <div className="fixed flex items-start justify-center" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
        <div className="relative overflow-hidden rounded-[3px] bg-[#1d1d1d]" style={{ width: w, height: h }}>
          <div className="shimmer absolute inset-0 opacity-70" />
          <div className="absolute inset-y-0 left-0 w-[14%] bg-white/[0.06]" />
          {pendingRun?.status === "failed" && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-dim">{pendingRun.error ?? "Generation failed"}</div>}
        </div>
      </div>
    );
  }

  if (!active)
    return (
      <div className="fixed flex items-center justify-center text-[13px] text-dim" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
        Pick an image from the strip below, or drop one here.
      </div>
    );

  const W = active.width || 1000;
  const H = active.height || 1000;
  const fit = Math.min(box.width / W, box.height / H);
  const scale = fit * s.zoom;
  const dw = W * scale;
  const dh = H * scale;
  // Top-aligned like the reference: the image hangs from the top of the stage and sits flush on the strip.
  const x = box.left + (box.width - dw) / 2 + pan.x;
  const y = box.top + (s.zoom <= 1 ? 0 : (box.height - dh) / 2) + pan.y;
  const detecting = s.mode === "auto" && s.segments[active.id] === "loading";

  return (
    <div
      ref={wrap}
      className="fixed inset-0 z-0"
      style={{ cursor: space ? (panRef.current ? "grabbing" : "grab") : undefined }}
      onPointerDown={(e) => {
        if (space || e.button === 1) {
          panRef.current = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onPointerMove={(e) => {
        const p = panRef.current;
        if (p) setPan({ x: p.x + e.clientX - p.px, y: p.y + e.clientY - p.py });
      }}
      onPointerUp={() => (panRef.current = null)}
    >
      <div className="absolute" style={{ left: x, top: y, width: dw, height: dh }} data-stage-image>
        {active.media === "video" ? (
          <video key={active.id} src={active.url} poster={active.poster ?? undefined} className="h-full w-full rounded-[2px] bg-black object-contain" controls autoPlay loop muted playsInline />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.url}
              alt={active.name}
              draggable={false}
              className="absolute inset-0 h-full w-full rounded-[2px] object-contain"
              style={{ filter: detecting ? "blur(14px) brightness(0.55)" : undefined, transition: "filter .35s", background: active.mime === "image/png" ? undefined : undefined }}
            />
            {s.mode === "adjust" && <AdjustPreview url={active.url} width={dw} height={dh} />}
            <Overlays asset={active} scale={scale} disabled={space} />
          </>
        )}
        {detecting && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-fg">
              <Spinner size={20} />
            </span>
            <div className="text-[15px] font-medium text-white">Detecting garments…</div>
            <div className="mt-1 text-[12.5px] text-white/75">Segmenting the image into editable regions.</div>
          </div>
        )}
      </div>
    </div>
  );
}
