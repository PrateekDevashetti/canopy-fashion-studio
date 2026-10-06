"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Ellipsis, GripVertical, Plus, X } from "lucide-react";
import type { AssetDTO, SegmentDTO } from "@/lib/api";
import { useStudio, type AnnItem } from "@/lib/store";
import { regionEdit } from "@/lib/actions";
import { FONT, loadImage, selectionEmpty } from "@/lib/render";
import { Spinner } from "@/components/ui";

const GREEN = "#86e07f";
const GREEN_FILL = "rgba(134,224,127,0.28)";
const uid = () => Math.random().toString(36).slice(2, 9);

/** Point → natural image pixels. */
function usePoint(ref: React.RefObject<SVGSVGElement | null>, W: number, H: number) {
  return (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W)), Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H))];
  };
}

/** Hit-test detected garment regions using small rasterized copies of their masks. */
function useSegmentHits(segments: SegmentDTO[] | null) {
  const [hits, setHits] = useState<{ seg: SegmentDTO; data: Uint8ClampedArray }[]>([]);
  useEffect(() => {
    let off = false;
    if (!segments?.length) return setHits([]);
    void Promise.all(
      segments.map(async (seg) => {
        const img = await loadImage(seg.maskUrl);
        const c = document.createElement("canvas");
        c.width = 128;
        c.height = 128;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, 128, 128);
        return { seg, data: ctx.getImageData(0, 0, 128, 128).data };
      }),
    ).then((h) => !off && setHits(h));
    return () => {
      off = true;
    };
  }, [segments]);
  return (nx: number, ny: number): SegmentDTO | null => {
    const x = Math.min(127, Math.floor(nx * 128));
    const y = Math.min(127, Math.floor(ny * 128));
    // Prefer the smallest region under the pointer (a sleeve over the whole jacket).
    let best: SegmentDTO | null = null;
    for (const h of hits) if (h.data[(y * 128 + x) * 4] > 127 && (!best || h.seg.area < best.area)) best = h.seg;
    return best;
  };
}

function SegmentTint({ seg, strong }: { seg: SegmentDTO; strong?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity"
      style={{
        background: strong ? "rgba(150,230,120,0.45)" : "rgba(150,230,120,0.32)",
        maskImage: `url(${seg.maskUrl})`,
        WebkitMaskImage: `url(${seg.maskUrl})`,
        maskMode: "luminance",
        maskSize: "100% 100%",
        WebkitMaskSize: "100% 100%",
        filter: "drop-shadow(0 0 6px rgba(134,224,127,0.9))",
      }}
    />
  );
}

/** Floating "Make a change…" composer anchored above the selection; draggable by its grip. */
function ChangeBubble({ anchor, onClose, closeX }: { anchor: { x: number; y: number }; onClose: () => void; closeX?: boolean }) {
  const [text, setText] = useState("");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const busy = useStudio((s) => s.busy === "region");
  const submit = async () => {
    if (!text.trim()) return;
    await regionEdit(text);
    setText("");
  };
  return (
    <div
      className="glass absolute z-10 flex h-[46px] w-[372px] max-w-[90%] animate-pop items-center gap-1.5 rounded-full pr-[5px] pl-2"
      style={{ left: `calc(${anchor.x}px + ${offset.x}px)`, top: anchor.y + offset.y, transform: "translate(-50%, -50%)" }}
      onPointerDown={(e) => e.stopPropagation()}
      data-tour="change-bubble"
    >
      {closeX ? (
        <button aria-label="Cancel" className="flex h-7 w-7 items-center justify-center rounded-full text-dim hover:text-fg" onClick={onClose}>
          <X size={15} />
        </button>
      ) : (
        <span
          className="flex h-7 w-5 cursor-grab items-center justify-center text-mute active:cursor-grabbing"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => drag.current && setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y })}
          onPointerUp={() => (drag.current = null)}
        >
          <GripVertical size={14} />
        </span>
      )}
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
        placeholder="Make a change…"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-dim"
      />
      <button aria-label="Apply change" disabled={!text.trim() || busy} className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-[#3b3b3b] text-fg transition-colors enabled:hover:bg-[#4b4b4b] disabled:opacity-60" onClick={() => void submit()}>
        {busy ? <Spinner size={14} /> : <ArrowUp size={17} />}
      </button>
    </div>
  );
}

function selectionBox(sel: NonNullable<ReturnType<typeof useStudio.getState>["selection"]>, W: number, H: number): [number, number, number, number] {
  if (sel.kind === "segment") {
    const [x0, y0, x1, y1] = sel.segment.box;
    return [x0 * W, y0 * H, x1 * W, y1 * H];
  }
  const pts = sel.kind === "lasso" ? sel.points : sel.kind === "square" ? [[sel.rect[0], sel.rect[1]] as [number, number], [sel.rect[2], sel.rect[3]] as [number, number]] : sel.strokes.flatMap((s) => s.points);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function Overlays({ asset, scale, disabled }: { asset: AssetDTO; scale: number; disabled?: boolean }) {
  const s = useStudio();
  const W = asset.width || 1000;
  const H = asset.height || 1000;
  const svg = useRef<SVGSVGElement>(null);
  const pt = usePoint(svg, W, H);
  const drawing = useRef<null | { kind: string; id?: string; start?: [number, number]; shift?: boolean }>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [, bump] = useState(0);
  const segs = Array.isArray(s.segments[asset.id]) ? (s.segments[asset.id] as SegmentDTO[]) : null;
  const hitTest = useSegmentHits(s.mode === "auto" ? segs : null);
  const [hover, setHover] = useState<SegmentDTO | null>(null);
  const sel = s.selection;
  const ann = s.ann;
  const mode = s.mode;

  const inSelect = mode === "lasso" || mode === "square" || mode === "brush" || mode === "auto";
  const inAnn = mode === "draw" || mode === "shapes" || mode === "text";

  const setAnnItems = (fn: (items: AnnItem[]) => AnnItem[]) => useStudio.setState((x) => ({ ann: { ...x.ann, items: fn(x.ann.items) } }));

  const onDown = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    const p = pt(e);
    if (mode === "lasso") {
      drawing.current = { kind: "lasso" };
      s.set({ selection: { kind: "lasso", points: [p] } });
    } else if (mode === "square") {
      drawing.current = { kind: "square", start: p };
      s.set({ selection: { kind: "square", rect: [p[0], p[1], p[0], p[1]] } });
    } else if (mode === "brush") {
      drawing.current = { kind: "brush" };
      const prev = sel?.kind === "brush" ? sel.strokes : [];
      s.set({ selection: { kind: "brush", strokes: [...prev, { points: [p], size: s.brush.size / scale, erase: s.brush.erase }] } });
    } else if (mode === "auto") {
      // Hit-test at the click itself — works without a prior hover (touch, fast clicks).
      const r = svg.current!.getBoundingClientRect();
      const hit = (segs && hitTest((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)) || hover;
      s.set({ selection: hit ? { kind: "segment", segment: hit } : null });
      return;
    } else if (mode === "draw") {
      const id = uid();
      drawing.current = { kind: "path", id };
      setAnnItems((items) => [...items, { id, kind: "path", points: [p], color: ann.color, width: ann.stroke / scale }]);
    } else if (mode === "shapes") {
      const id = uid();
      drawing.current = { kind: "shape", id };
      setAnnItems((items) => [...items, { id, kind: ann.shape, from: p, to: p, color: ann.color, width: Math.max(2, 4 / scale) }]);
    } else if (mode === "text") {
      if (ann.editing) return s.set({ ann: { ...ann, editing: null } });
      const id = uid();
      setAnnItems((items) => [...items, { id, kind: "text", at: p, text: "", color: ann.color, size: ann.textSize / scale }]);
      useStudio.setState((x) => ({ ann: { ...x.ann, editing: id } }));
      return;
    } else return;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = pt(e);
    if (mode === "brush") setCursor(p);
    if (mode === "auto" && segs) {
      const r = svg.current!.getBoundingClientRect();
      setHover(hitTest((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
    }
    const d = drawing.current;
    if (!d) return;
    const cur = useStudio.getState().selection;
    if (d.kind === "lasso" && cur?.kind === "lasso") s.set({ selection: { kind: "lasso", points: [...cur.points, p] } });
    else if (d.kind === "square" && d.start) {
      let [x, y] = p;
      if (e.shiftKey) {
        const side = Math.max(Math.abs(x - d.start[0]), Math.abs(y - d.start[1]));
        x = d.start[0] + Math.sign(x - d.start[0] || 1) * side;
        y = d.start[1] + Math.sign(y - d.start[1] || 1) * side;
      }
      s.set({ selection: { kind: "square", rect: [d.start[0], d.start[1], x, y] } });
    } else if (d.kind === "brush" && cur?.kind === "brush") {
      const strokes = cur.strokes.slice();
      const last = strokes[strokes.length - 1];
      strokes[strokes.length - 1] = { ...last, points: [...last.points, p] };
      s.set({ selection: { kind: "brush", strokes } });
    } else if (d.kind === "path") setAnnItems((items) => items.map((it) => (it.id === d.id && it.kind === "path" ? { ...it, points: [...it.points, p] } : it)));
    else if (d.kind === "shape") setAnnItems((items) => items.map((it) => (it.id === d.id && "to" in it ? { ...it, to: p } : it)));
  };

  const onUp = () => {
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;
    // The ref change alone doesn't re-render; the bubble and closed lasso path depend on it.
    bump((n) => n + 1);
    const cur = useStudio.getState().selection;
    if ((d.kind === "lasso" || d.kind === "square") && selectionEmpty(cur)) s.set({ selection: null });
    if (d.kind === "shape") setAnnItems((items) => items.filter((it) => !("to" in it) || it.id !== d.id || Math.hypot(it.to[0] - it.from[0], it.to[1] - it.from[1]) > 3));
  };

  // Brush selection rendered through an SVG mask so erasing works visually.
  const brushMaskId = useMemo(() => `bm_${asset.id}`, [asset.id]);
  const box = sel && !selectionEmpty(sel) && !drawing.current ? selectionBox(sel, W, H) : null;
  const bubbleAnchor = box ? { x: ((box[0] + box[2]) / 2) * scale, y: Math.max(78, box[1] * scale - 4) } : null;

  const cursorStyle = disabled ? undefined : inSelect || inAnn ? (mode === "brush" ? "none" : mode === "text" ? "text" : mode === "auto" ? (hover ? "pointer" : "default") : "crosshair") : undefined;

  return (
    <>
      {mode === "auto" && segs && sel?.kind === "segment" && <SegmentTint seg={sel.segment} strong />}
      {mode === "auto" && segs && hover && hover.id !== (sel?.kind === "segment" ? sel.segment.id : null) && <SegmentTint seg={hover} />}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: cursorStyle, pointerEvents: inSelect || inAnn ? "auto" : "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => {
          setCursor(null);
          setHover(null);
        }}
      >
        {sel?.kind === "lasso" && sel.points.length > 1 && <path d={`M${sel.points.map((p) => p.join(",")).join("L")}${drawing.current ? "" : "Z"}`} fill={GREEN_FILL} stroke={GREEN} strokeWidth={2.2 / scale} strokeLinejoin="round" />}
        {sel?.kind === "square" && (
          <rect x={Math.min(sel.rect[0], sel.rect[2])} y={Math.min(sel.rect[1], sel.rect[3])} width={Math.abs(sel.rect[2] - sel.rect[0])} height={Math.abs(sel.rect[3] - sel.rect[1])} fill={GREEN_FILL} stroke={GREEN} strokeWidth={2 / scale} />
        )}
        {sel?.kind === "brush" && (
          <>
            <defs>
              <mask id={brushMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
                <rect width={W} height={H} fill="black" />
                {sel.strokes.map((st, i) => (
                  <path key={i} d={`M${st.points.map((p) => p.join(",")).join("L")}`} stroke={st.erase ? "black" : "white"} strokeWidth={st.size} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                ))}
              </mask>
            </defs>
            <rect width={W} height={H} fill="rgba(160,120,60,0.45)" mask={`url(#${brushMaskId})`} />
          </>
        )}
        {mode === "brush" && cursor && <circle cx={cursor[0]} cy={cursor[1]} r={s.brush.size / scale / 2} fill="none" stroke="white" strokeWidth={1.5 / scale} />}
        {ann.items.map((it) =>
          it.kind === "path" ? (
            <path key={it.id} d={`M${it.points.map((p) => p.join(",")).join("L")}`} stroke={it.color} strokeWidth={it.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ) : it.kind === "rect" ? (
            <rect key={it.id} x={Math.min(it.from[0], it.to[0])} y={Math.min(it.from[1], it.to[1])} width={Math.abs(it.to[0] - it.from[0])} height={Math.abs(it.to[1] - it.from[1])} stroke={it.color} strokeWidth={it.width} fill="none" />
          ) : it.kind === "ellipse" ? (
            <ellipse key={it.id} cx={(it.from[0] + it.to[0]) / 2} cy={(it.from[1] + it.to[1]) / 2} rx={Math.abs(it.to[0] - it.from[0]) / 2} ry={Math.abs(it.to[1] - it.from[1]) / 2} stroke={it.color} strokeWidth={it.width} fill="none" />
          ) : it.kind === "arrow" ? (
            <Arrow key={it.id} from={it.from} to={it.to} color={it.color} width={it.width} />
          ) : null,
        )}
      </svg>

      {/* Text items are HTML so they can be edited in place. */}
      {ann.items.map((it) => (it.kind === "text" ? <TextItem key={it.id} item={it} scale={scale} /> : null))}

      {mode === "auto" && hover && !sel && (
        <span
          className="pointer-events-none absolute z-[5] flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black text-white shadow-lg"
          style={{ left: ((hover.box[0] + hover.box[2]) / 2) * W * scale, top: ((hover.box[1] + hover.box[3]) / 2) * H * scale }}
        >
          <Plus size={15} />
        </span>
      )}

      {inSelect && bubbleAnchor && <ChangeBubble anchor={bubbleAnchor} closeX={mode === "auto"} onClose={() => s.set({ selection: null })} />}

      {mode === "crop" && <CropOverlay W={W} H={H} scale={scale} />}
    </>
  );
}

function Arrow({ from, to, color, width }: { from: [number, number]; to: [number, number]; color: string; width: number }) {
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const head = Math.max(12, width * 3.2);
  const p1 = [to[0] - head * Math.cos(ang - Math.PI / 7), to[1] - head * Math.sin(ang - Math.PI / 7)];
  const p2 = [to[0] - head * Math.cos(ang + Math.PI / 7), to[1] - head * Math.sin(ang + Math.PI / 7)];
  return (
    <g>
      <line x1={from[0]} y1={from[1]} x2={to[0] - Math.cos(ang) * head * 0.6} y2={to[1] - Math.sin(ang) * head * 0.6} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <path d={`M${to.join(",")}L${p1.join(",")}L${p2.join(",")}Z`} fill={color} />
    </g>
  );
}

function TextItem({ item, scale }: { item: Extract<AnnItem, { kind: "text" }>; scale: number }) {
  const editing = useStudio((s) => s.ann.editing === item.id);
  const ref = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ x: number; y: number; at: [number, number] } | null>(null);
  const update = (patch: Partial<typeof item>) => useStudio.setState((x) => ({ ann: { ...x.ann, items: x.ann.items.map((i) => (i.id === item.id ? ({ ...i, ...patch } as AnnItem) : i)) } }));
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  const fontPx = item.size * scale;
  const lines = Math.max(1, item.text.split("\n").length);
  return (
    <div className="absolute z-[6]" style={{ left: item.at[0] * scale, top: item.at[1] * scale }} onPointerDown={(e) => e.stopPropagation()}>
      <button
        aria-label="Move text"
        className="absolute -top-[22px] left-1/2 flex h-[16px] w-[26px] -translate-x-1/2 cursor-move items-center justify-center rounded-[5px] bg-[#3a3a3a] text-white/90"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, at: item.at };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) update({ at: [d.at[0] + (e.clientX - d.x) / scale, d.at[1] + (e.clientY - d.y) / scale] });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <Ellipsis size={12} />
      </button>
      <textarea
        ref={ref}
        value={item.text}
        onChange={(e) => update({ text: e.target.value })}
        onFocus={() => useStudio.setState((x) => ({ ann: { ...x.ann, editing: item.id } }))}
        onKeyDown={(e) => e.stopPropagation()}
        rows={lines}
        spellCheck={false}
        className="block resize-none overflow-hidden border border-transparent bg-transparent p-0 outline-none focus:border-[#86e07f]"
        style={{ font: FONT(fontPx), color: item.color, lineHeight: 1.2, width: Math.max(fontPx * 0.8, (Math.max(...item.text.split("\n").map((l) => l.length), 1) + 1) * fontPx * 0.56), height: lines * fontPx * 1.2 + 2, caretColor: item.color }}
      />
    </div>
  );
}

function CropOverlay({ W, H, scale }: { W: number; H: number; scale: number }) {
  const crop = useStudio((s) => s.crop);
  const set = useStudio((s) => s.set);
  const drag = useRef<{ kind: string; x: number; y: number; c: typeof crop } | null>(null);
  const x = (crop.cx - crop.w / 2) * W * scale;
  const y = (crop.cy - crop.h / 2) * H * scale;
  const w = crop.w * W * scale;
  const h = crop.h * H * scale;
  const ratio = (crop.w * W) / (crop.h * H);
  const start = (kind: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { kind, x: e.clientX, y: e.clientY, c: crop };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / (W * scale);
    const dy = (e.clientY - d.y) / (H * scale);
    const c = { ...d.c };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    if (d.kind === "move") {
      c.cx = clamp(d.c.cx + dx, c.w / 2, 1 - c.w / 2);
      c.cy = clamp(d.c.cy + dy, c.h / 2, 1 - c.h / 2);
    } else {
      let l = d.c.cx - d.c.w / 2,
        r = d.c.cx + d.c.w / 2,
        t = d.c.cy - d.c.h / 2,
        b = d.c.cy + d.c.h / 2;
      if (d.kind.includes("l")) l = clamp(l + dx, 0, r - 0.03);
      if (d.kind.includes("r")) r = clamp(r + dx, l + 0.03, 1);
      if (d.kind.includes("t")) t = clamp(t + dy, 0, b - 0.03);
      if (d.kind.includes("b")) b = clamp(b + dy, t + 0.03, 1);
      if (d.c.lock) {
        const nw = r - l;
        const nh = (nw * W) / ratio / H;
        if (d.kind.includes("t")) t = b - nh;
        else b = t + nh;
        if (t < 0 || b > 1) return;
      }
      c.cx = (l + r) / 2;
      c.cy = (t + b) / 2;
      c.w = r - l;
      c.h = b - t;
    }
    set({ crop: c });
  };
  const handle = (kind: string, style: React.CSSProperties) => <span className="absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 border border-[#86e07f] bg-[#111]" style={{ ...style, cursor: `${kind === "tl" || kind === "br" ? "nwse" : "nesw"}-resize` }} onPointerDown={start(kind)} onPointerMove={move} onPointerUp={() => (drag.current = null)} />;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-black/45" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px)` }} />
      <div className="absolute cursor-move border border-[#86e07f]" style={{ left: x, top: y, width: w, height: h, transform: `rotate(${crop.rot}deg)` }} onPointerDown={start("move")} onPointerMove={move} onPointerUp={() => (drag.current = null)}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_33%,rgba(134,224,127,0.25)_33%,rgba(134,224,127,0.25)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgba(134,224,127,0.25)_66%,rgba(134,224,127,0.25)_calc(66%+1px),transparent_calc(66%+1px))]" />
        {handle("tl", { left: 0, top: 0 })}
        {handle("tr", { left: "100%", top: 0 })}
        {handle("bl", { left: 0, top: "100%" })}
        {handle("br", { left: "100%", top: "100%" })}
      </div>
    </div>
  );
}
