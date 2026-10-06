"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Plus, ScanSearch, Upload, X } from "lucide-react";
import { NAMED_COLORS } from "@fashion/core/engine/prompts";
import type { InputSpec, Tool } from "@fashion/core/tools";
import type { AssetDTO, SegmentDTO } from "@/lib/api";
import { useStudio, useAssets } from "@/lib/store";
import { cn, Popover, Spinner } from "@/components/ui";
import { pickFiles, useUploader } from "./useUploader";

type ImageSpec = Extract<InputSpec, { kind: "image" }>;
type MaskSpec = Extract<InputSpec, { kind: "mask" }>;
type ColorSpec = Extract<InputSpec, { kind: "color" }>;

const Thumb = ({ a, className }: { a?: AssetDTO; className?: string }) =>
  a ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={a.poster ?? a.url} alt="" className={cn("h-full w-full object-cover", className)} draggable={false} />
  ) : null;

function Card({ thumb, title, sub, onClick, disabled, active, children, ...rest }: { thumb: React.ReactNode; title: string; sub?: string; onClick?: () => void; disabled?: boolean; active?: boolean; children?: React.ReactNode; "data-dropzone"?: boolean; onDrop?: (e: React.DragEvent) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-dropzone={rest["data-dropzone"] ? "" : undefined}
      onDragOver={(e) => {
        if (!rest.onDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        rest.onDrop?.(e);
      }}
      className={cn(
        "flex h-[54px] w-full items-center gap-[10px] rounded-[11px] border border-line-2 bg-[#1a1a1a] pr-2.5 pl-[7px] text-left transition-colors",
        disabled ? "opacity-55" : "cursor-pointer hover:border-line-3 hover:bg-[#1e1e1e]",
        (active || over) && "border-line-3 bg-[#1e1e1e]",
        over && "border-accent/60",
      )}
      onClick={disabled ? undefined : onClick}
      role="button"
      aria-disabled={disabled}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-line-2 bg-[#222] text-dim">{thumb}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-fg">{title}</span>
        {sub && <span className="block truncate text-[11px] text-dim">{sub}</span>}
      </span>
      {children}
      {!disabled && <ChevronDown size={13} className="shrink-0 text-dim" />}
    </div>
  );
}

/** Popover listing project images (newest first) + upload. */
function AssetPicker({ anchor, open, onClose, onPick, selected, multi }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; onPick: (ids: string[]) => void; selected: string[]; multi?: boolean }) {
  const assets = useAssets().filter((a) => a.kind !== "mask");
  const activeId = useStudio((s) => s.activeId);
  const upload = useUploader();
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => {
    if (!multi) return onPick([id]);
    onPick(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} placement="bottom-start" matchWidth className="w-[260px] p-2">
      <button
        className="menu-item mb-1"
        disabled={busy}
        onClick={async () => {
          const files = await pickFiles(Boolean(multi));
          if (!files.length) return;
          setBusy(true);
          const out = await upload(files, { activate: false });
          setBusy(false);
          if (out.length) onPick(multi ? [...selected, ...out.map((a) => a.id)] : [out[0].id]);
          if (!multi) onClose();
        }}
      >
        {busy ? <Spinner size={14} /> : <Upload size={14} />} Upload image{multi ? "s" : ""}
      </button>
      {activeId && !selected.includes(activeId) && (
        <button className="menu-item mb-1" onClick={() => (toggle(activeId), !multi && onClose())}>
          <span className="h-[18px] w-[18px] overflow-hidden rounded-[4px]">
            <Thumb a={assets.find((a) => a.id === activeId)} />
          </span>
          Use open image
        </button>
      )}
      {assets.length > 0 && <div className="mx-1 mt-1 mb-1.5 text-[11px] text-mute">In this project</div>}
      <div className="grid max-h-[260px] grid-cols-4 gap-1.5 overflow-y-auto p-1">
        {assets.map((a) => (
          <button
            key={a.id}
            title={a.name}
            className={cn("relative aspect-square overflow-hidden rounded-[7px] border border-transparent hover:border-line-3", selected.includes(a.id) && "border-accent")}
            onClick={() => (toggle(a.id), !multi && onClose())}
          >
            <Thumb a={a} />
            {selected.includes(a.id) && (
              <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Check size={10} strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      {multi && (
        <button className="btn mt-2 w-full" onClick={onClose}>
          Done
        </button>
      )}
    </Popover>
  );
}

export function ImageInput({ tool, spec, compact }: { tool: Tool; spec: ImageSpec; compact?: boolean }) {
  const raw = useStudio((s) => s.tools[tool.id]?.inputs[spec.key]);
  const setInput = useStudio((s) => s.setInput);
  const asset = useStudio((s) => s.asset);
  const activeId = useStudio((s) => s.activeId);
  const upload = useUploader();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const ids = Array.isArray(raw) ? (raw as string[]) : raw ? [raw as string] : [];
  const set = (next: string[]) => setInput(tool.id, spec.key, spec.collection ? next : (next[0] ?? null));
  const onDrop = async (e: React.DragEvent) => {
    const assetId = e.dataTransfer.getData("application/x-fs-asset");
    if (assetId) {
      e.preventDefault();
      e.stopPropagation();
      set(spec.collection ? [...ids.filter((x) => x !== assetId), assetId] : [assetId]);
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const out = await upload(files, { activate: false });
    if (out.length) set(spec.collection ? [...ids, ...out.map((a) => a.id)] : [out[0].id]);
  };

  if (compact)
    return (
      <div ref={ref}>
        <button aria-label="Add reference" className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-dim hover:bg-hover hover:text-fg" onClick={() => setOpen(true)}>
          <Plus size={18} />
        </button>
        <AssetPicker anchor={ref} open={open} onClose={() => setOpen(false)} selected={ids} onPick={set} multi={spec.collection} />
      </div>
    );

  const first = asset(ids[0]);
  const applying = ids.length === 1 && ids[0] === activeId;
  return (
    <div ref={ref}>
      <Card
        data-dropzone
        onDrop={onDrop}
        active={open}
        onClick={() => setOpen(true)}
        thumb={first ? <Thumb a={first} /> : <Upload size={15} strokeWidth={1.7} />}
        title={first ? (applying ? "Applying to" : ids.length > 1 ? `${ids.length} images` : first.name || "Image") : "Choose or upload"}
        sub={first ? (applying ? first.name || "Open image" : ids.length > 1 ? "Batched — one result each" : "Image") : spec.collection ? "Image · add several to batch" : "Image"}
      >
        {ids.length > 0 && (
          <button
            aria-label={`Clear ${spec.label}`}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-dim hover:bg-hover hover:text-fg"
            onClick={(e) => {
              e.stopPropagation();
              set([]);
            }}
          >
            <X size={13} />
          </button>
        )}
      </Card>
      {spec.collection && ids.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <div key={id} className="group relative h-[40px] w-[40px] overflow-hidden rounded-[7px] border border-line-2">
              <Thumb a={asset(id)} />
              <button aria-label="Remove" className="absolute top-0.5 right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 group-hover:flex" onClick={() => set(ids.filter((x) => x !== id))}>
                <X size={10} />
              </button>
            </div>
          ))}
          <button aria-label="Add more" className="flex h-[40px] w-[40px] items-center justify-center rounded-[7px] border border-dashed border-line-3 text-dim hover:text-fg" onClick={() => setOpen(true)}>
            <Plus size={14} />
          </button>
        </div>
      )}
      <AssetPicker anchor={ref} open={open} onClose={() => setOpen(false)} selected={ids} onPick={set} multi={spec.collection} />
    </div>
  );
}

export function MaskInput({ tool, spec }: { tool: Tool; spec: MaskSpec }) {
  const s = useStudio();
  const ts = s.tools[tool.id];
  const srcRaw = ts?.inputs[spec.of];
  const srcId = Array.isArray(srcRaw) ? (srcRaw[0] as string) : (srcRaw as string | undefined);
  const src = s.asset(srcId);
  const value = ts?.inputs[spec.key] as string | undefined;
  const label = ts?.inputs.maskLabel as string | undefined;
  const ofLabel = tool.inputs.find((i) => i.key === spec.of)?.label ?? "image";
  const segs = srcId ? s.segments[srcId] : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const liveSelection = !value && s.selection && srcId === s.activeId;

  if (!src)
    return <Card disabled thumb={<ScanSearch size={15} strokeWidth={1.6} />} title={`Add ${ofLabel} first`} />;

  const pickSegment = (seg: SegmentDTO) => {
    s.setInput(tool.id, spec.key, seg.maskKey);
    s.setInput(tool.id, "maskLabel", seg.label);
    if (srcId === s.activeId) s.set({ selection: { kind: "segment", segment: seg }, mode: "auto" });
    setOpen(false);
  };

  return (
    <div ref={ref}>
      <Card
        active={open}
        onClick={() => {
          setOpen(true);
          if (srcId && !segs) void s.loadSegments(srcId);
        }}
        thumb={<Thumb a={src} />}
        title={value ? (label ?? "Mask") : liveSelection ? "Applying selection…" : "Select on image"}
        sub={value ? "Selected region" : undefined}
      >
        {value && (
          <button
            aria-label="Clear mask"
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-dim hover:bg-hover hover:text-fg"
            onClick={(e) => {
              e.stopPropagation();
              s.setInput(tool.id, spec.key, null);
              s.setInput(tool.id, "maskLabel", null);
            }}
          >
            <X size={13} />
          </button>
        )}
      </Card>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" matchWidth className="max-h-[360px] overflow-y-auto">
        <button
          className="menu-item"
          onClick={() => {
            setOpen(false);
            if (srcId && srcId !== s.activeId) s.setActive(srcId);
            s.setMode("auto");
          }}
        >
          <ScanSearch size={15} /> Select on image
        </button>
        <div className="my-1 h-px bg-line-2" />
        {segs === "loading" && (
          <div className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-dim">
            <Spinner size={13} /> Detecting garments…
          </div>
        )}
        {segs === "error" && (
          <button className="menu-item text-dim" onClick={() => srcId && void s.loadSegments(srcId, true)}>
            Detection failed — retry
          </button>
        )}
        {Array.isArray(segs) &&
          segs.map((seg) => (
            <button key={seg.id} className={cn("menu-item", value === seg.maskKey && "bg-hover text-fg")} onClick={() => pickSegment(seg)}>
              <span className="relative h-[20px] w-[20px] shrink-0 overflow-hidden rounded-[5px] bg-[#2a2a2a]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seg.maskUrl} alt="" className="absolute inset-0 h-full w-full object-contain opacity-80 mix-blend-screen" />
              </span>
              {seg.label}
            </button>
          ))}
      </Popover>
    </div>
  );
}

type C = { hex: string; name?: string };

export function ColorInput({ tool, spec }: { tool: Tool; spec: ColorSpec }) {
  const raw = useStudio((s) => s.tools[tool.id]?.inputs[spec.key]);
  const setInput = useStudio((s) => s.setInput);
  const colors = (Array.isArray(raw) ? raw : []) as C[];
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("#");
  const set = (next: C[]) => setInput(tool.id, spec.key, next);
  const has = (h: string) => colors.some((c) => c.hex.toLowerCase() === h.toLowerCase());
  const toggle = (c: C) => set(has(c.hex) ? colors.filter((x) => x.hex.toLowerCase() !== c.hex.toLowerCase()) : spec.collection ? [...colors, c] : [c]);
  return (
    <div ref={ref}>
      <button className="field flex min-h-[38px] w-full flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-left hover:border-line-3" onClick={() => setOpen(true)}>
        {colors.length === 0 && <span className="text-[13px] text-mute">Choose a color</span>}
        {colors.map((c) => (
          <span key={c.hex} className="flex items-center gap-1.5 rounded-[6px] bg-[#262626] py-0.5 pr-1 pl-1 text-[12px] text-fg-2">
            <span className="h-3.5 w-3.5 rounded-[3px] border border-white/15" style={{ background: c.hex }} />
            {c.name ?? c.hex}
            <span
              role="button"
              aria-label={`Remove ${c.name ?? c.hex}`}
              className="flex h-4 w-4 items-center justify-center rounded text-dim hover:text-fg"
              onClick={(e) => {
                e.stopPropagation();
                toggle(c);
              }}
            >
              <X size={10} />
            </span>
          </span>
        ))}
      </button>
      {spec.collection && colors.length > 1 && <p className="mt-1.5 text-[11px] text-mute">{colors.length} colorways — one result each</p>}
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" matchWidth className="p-2.5">
        <div className="grid grid-cols-6 gap-1.5">
          {NAMED_COLORS.map((c) => (
            <button key={c.hex} title={c.name} aria-label={c.name} className={cn("relative aspect-square rounded-[7px] border border-white/10", has(c.hex) && "ring-2 ring-white ring-offset-2 ring-offset-[#1b1b1b]")} style={{ background: c.hex }} onClick={() => toggle(c)} />
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <input type="color" aria-label="Pick custom color" className="h-8 w-8 shrink-0 cursor-pointer rounded-[6px] border border-line-2 bg-transparent" onChange={(e) => setHex(e.target.value)} value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#888888"} />
          <input value={hex} onChange={(e) => setHex(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)} placeholder="#hex" className="field h-8 min-w-0 flex-1 px-2 font-mono text-[12px]" maxLength={7} />
          <button className="btn h-8 px-2.5" disabled={!/^#[0-9a-f]{6}$/i.test(hex) || has(hex)} onClick={() => (toggle({ hex: hex.toLowerCase() }), setHex("#"))}>
            Add
          </button>
        </div>
      </Popover>
    </div>
  );
}
