"use client";

import { useRef, useState } from "react";
import {
  Brush,
  ChevronDown,
  Crop as CropIcon,
  Download,
  Info,
  Lasso,
  LayoutGrid,
  Lock,
  Monitor,
  MousePointer2,
  MousePointerClick,
  Pencil,
  Send,
  Shapes,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  SquareDashedMousePointer,
  Type,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { CANOPY_HOME } from "@/lib/canopy-home";
import { useStudio, type AnnotateMode, type SelectMode } from "@/lib/store";
import { downloadAsset, removeBackground } from "@/lib/actions";
import { cn, CanopyMark, Popover, Tip } from "@/components/ui";
import { ContextBar } from "./ContextBar";
import { ProjectMenu } from "./ProjectMenu";
import { OpenInCanvasDialog, ShareAssetsDialog } from "./FeedDialogs";
import { BgRemoveIcon, FeedIcon, EditorIcon } from "./icons";

const SELECT_MODES: { id: SelectMode; label: string; desc: string; key: string; Icon: typeof Lasso }[] = [
  { id: "lasso", label: "Lasso", desc: "Draw a freehand selection", key: "L", Icon: Lasso },
  { id: "brush", label: "Brush", desc: "Paint the selection", key: "B", Icon: Brush },
  { id: "auto", label: "Auto detect", desc: "Detect garments, then click one to edit", key: "A", Icon: MousePointerClick },
  { id: "square", label: "Square", desc: "Drag a rectangle — hold Shift for 1:1", key: "S", Icon: SquareDashedMousePointer },
];
const ANNOTATE_MODES: { id: AnnotateMode; label: string; desc: string; Icon: typeof Type }[] = [
  { id: "text", label: "Text", desc: "Place a caption on the image", Icon: Type },
  { id: "draw", label: "Draw", desc: "Draw freehand over the image", Icon: Pencil },
  { id: "shapes", label: "Shapes", desc: "Add a rectangle, ellipse or arrow", Icon: Shapes },
];

function ModeMenu<T extends string>({
  items,
  current,
  active,
  onPick,
  tip,
  ...rest
}: {
  items: { id: T; label: string; desc: string; key?: string; Icon: typeof Type }[];
  current: T;
  active: boolean;
  onPick: (id: T) => void;
  tip: string;
  "data-tour"?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = items.find((i) => i.id === current) ?? items[0];
  return (
    <div ref={ref} className={cn("flex h-9 items-center rounded-[10px] transition-colors", active ? "bg-accent-bg text-accent-fg" : open ? "bg-hover" : "hover:bg-hover")} data-tour={rest["data-tour"]}>
      <Tip label={cur.label} kbd={cur.key}>
        <button aria-label={tip} className="flex h-9 items-center pl-2.5" onClick={() => onPick(cur.id)}>
          <cur.Icon size={17} strokeWidth={1.7} />
        </button>
      </Tip>
      <button aria-label={`${tip} options`} className="flex h-9 items-center pr-2 pl-1 opacity-70 hover:opacity-100" onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={12} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" className="w-[288px] p-1.5">
        {items.map((i) => (
          <button
            key={i.id}
            className="menu-item items-center gap-3 py-2"
            onClick={() => {
              onPick(i.id);
              setOpen(false);
            }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#2a2a2a] text-fg">
              <i.Icon size={15} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-fg">{i.label}</span>
              <span className="block text-[11.5px] text-dim">{i.desc}</span>
            </span>
            {i.key && <span className="kbd h-6 min-w-6 rounded-[7px] text-[11px]">{i.key}</span>}
          </button>
        ))}
      </Popover>
    </div>
  );
}

function ToolbarButton({ label, onClick, active, children, kbd, disabled, ...rest }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode; kbd?: string; disabled?: boolean; "data-tour"?: string }) {
  return (
    <Tip label={label} kbd={kbd}>
      <button aria-label={label} disabled={disabled} className={cn("icon-btn", active && "icon-btn-on")} onClick={onClick} data-tour={rest["data-tour"]}>
        {children}
      </button>
    </Tip>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-line-2" />;

export function ViewToggle() {
  const view = useStudio((s) => s.view);
  const set = useStudio((s) => s.set);
  return (
    <div className="flex items-center gap-0.5" data-tour="view-toggle">
      <button className={cn("flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[13px] transition-colors", view === "editor" ? "bg-accent-bg text-accent-fg" : "text-dim hover:bg-hover hover:text-fg")} onClick={() => set({ view: "editor" })}>
        <EditorIcon size={16} />
        Editor
        <span className={cn("kbd", view === "editor" && "bg-accent-bg-2 text-accent-fg")}>E</span>
      </button>
      <button data-tour="feed-toggle" className={cn("flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-[13px] transition-colors", view === "feed" ? "bg-accent-bg text-accent-fg" : "text-dim hover:bg-hover hover:text-fg")} onClick={() => set({ view: "feed" })}>
        <FeedIcon size={16} />
        Feed
        <span className={cn("kbd", view === "feed" && "bg-accent-bg-2 text-accent-fg")}>F</span>
      </button>
    </div>
  );
}

/** Signed-in users: credits at a glance + account menu (guests get "Sign in" instead). */
function CreditsPill() {
  const me = useStudio((s) => s.me);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  if (!me) return null;
  const low = me.credits < 6;
  return (
    <>
      <button ref={ref} aria-label="Credits and account" className="glass flex h-[40px] items-center gap-2 rounded-[11px] pr-1.5 pl-3 text-[13px] text-fg hover:bg-[#1f1f1f]" onClick={() => setOpen((o) => !o)} data-testid="credits-pill">
        <Zap size={13} className={low ? "text-danger" : "text-accent"} fill="currentColor" />
        <span className="tabular-nums">{me.credits}</span>
        <span className="text-dim">credits</span>
        <span className="ml-1 flex h-[28px] w-[28px] items-center justify-center overflow-hidden rounded-full bg-[#2a2a2a] text-[11.5px] font-medium">
          {me.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (me.name || me.email || "?").slice(0, 1).toUpperCase()
          )}
        </span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" className="w-[240px]">
        <div className="px-2.5 pt-1.5 pb-2">
          <div className="truncate text-[12.5px] text-fg">{me.name || "Your account"}</div>
          <div className="truncate text-[11.5px] text-mute">{me.email}</div>
        </div>
        <div className="mx-2.5 mb-2 rounded-[9px] border border-line-2 bg-[#1b1b1b] p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] text-dim">Credits left</span>
            <span className={cn("text-[15px] font-medium tabular-nums", low && "text-danger")}>{me.credits}</span>
          </div>
          <a className="mt-2 block text-[11.5px] text-accent hover:underline" href="mailto:hello@trycanopy.space?subject=Fashion%20Studio%20credits">
            Get more credits →
          </a>
        </div>
        <Link className="menu-item" href={CANOPY_HOME} onClick={() => setOpen(false)}>
          All projects
        </Link>
        <Link className="menu-item" href="/settings" onClick={() => setOpen(false)}>
          Settings &amp; usage
        </Link>
      </Popover>
    </>
  );
}

function ZoomMenu() {
  const zoom = useStudio((s) => s.zoom);
  const set = useStudio((s) => s.set);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const z = (v: number) => set({ zoom: Math.min(8, Math.max(0.1, v)) });
  return (
    <>
      <button ref={ref} className="flex h-9 items-center gap-1 rounded-[10px] px-2 text-[13px] text-fg-2 hover:bg-hover" onClick={() => setOpen((o) => !o)}>
        {Math.round(zoom * 100)}% <ChevronDown size={12} className="opacity-70" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" className="w-[190px]">
        {[
          ["Zoom in", () => z(zoom * 1.25), "+"],
          ["Zoom out", () => z(zoom / 1.25), "−"],
          ["Zoom to fit", () => z(1), "⇧1"],
          ["50%", () => z(0.5), ""],
          ["200%", () => z(2), ""],
        ].map(([label, fn, k]) => (
          <button key={label as string} className="menu-item justify-between" onClick={() => ((fn as () => void)(), setOpen(false))}>
            {label as string}
            {k && <span className="text-[11px] text-mute">{k as string}</span>}
          </button>
        ))}
      </Popover>
    </>
  );
}

export function TopBar() {
  const s = useStudio();
  const active = s.active();
  const [share, setShare] = useState(false);
  const [canvas, setCanvas] = useState(false);
  const owner = s.role === "owner" ? (s.me?.name ?? "") : "";
  const editing = s.view === "editor" && Boolean(active);
  const isImage = active?.media === "image";
  const selActive = ["lasso", "brush", "auto", "square"].includes(s.mode);
  const annActive = ["draw", "text", "shapes"].includes(s.mode);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-[56px] items-start justify-between px-[22px] pt-[9px]">
        {s.me?.guest ? (
          <div className="pointer-events-auto pt-[8px] text-[15px] font-medium text-fg">Fashion Studio</div>
        ) : (
        <div className="pointer-events-auto flex flex-col">
          <div className="flex items-center gap-3">
            <Link href={CANOPY_HOME} aria-label="All projects" className="flex h-6 w-6 items-center justify-center">
              <CanopyMark size={19} />
            </Link>
            <ProjectMenu />
          </div>
          <div className="mt-[5px] ml-[34px] flex items-center gap-1 text-[11px] text-dim">
            <Lock size={10} />
            <span>
              {s.role === "owner" ? "Private" : "Shared"} · {owner ? `${owner}'s workspace` : "Team workspace"}
            </span>
          </div>
        </div>
        )}

        <div className={cn("pointer-events-auto absolute left-1/2 top-[8px] flex -translate-x-1/2 flex-col items-center gap-2", !s.runs.length && s.view === "editor" && "hidden")}>
          <div className="glass flex h-[46px] items-center gap-0.5 rounded-[14px] px-1.5" data-tour="toolbar">
            {editing && (
              <>
                <ToolbarButton label="Select" kbd="V" active={s.mode === "select"} onClick={() => s.setMode("select")}>
                  <MousePointer2 size={17} strokeWidth={1.7} />
                </ToolbarButton>
                <Divider />
                {isImage && (
                  <>
                    <ModeMenu items={SELECT_MODES} current={s.lastSelectMode} active={selActive} onPick={(m) => s.setMode(m)} tip="Selection" data-tour="select-menu" />
                    <ModeMenu items={ANNOTATE_MODES} current={s.lastAnnotateMode} active={annActive} onPick={(m) => s.setMode(m)} tip="Annotate" />
                    <ToolbarButton label="Crop" kbd="C" active={s.mode === "crop"} onClick={() => s.setMode(s.mode === "crop" ? "select" : "crop")}>
                      <CropIcon size={17} strokeWidth={1.7} />
                    </ToolbarButton>
                    <ToolbarButton label="Adjustments" active={s.mode === "adjust"} onClick={() => s.setMode(s.mode === "adjust" ? "select" : "adjust")}>
                      <SlidersHorizontal size={17} strokeWidth={1.7} />
                    </ToolbarButton>
                    <Divider />
                    <ToolbarButton label="Remove background" onClick={() => void removeBackground()}>
                      <BgRemoveIcon size={17} />
                    </ToolbarButton>
                  </>
                )}
                <ToolbarButton label="Open in Canvas" onClick={() => setCanvas(true)}>
                  <SquareArrowOutUpRight size={17} strokeWidth={1.7} />
                </ToolbarButton>
                <Divider />
                <ToolbarButton label="Download" onClick={() => active && downloadAsset(active)}>
                  <Download size={17} strokeWidth={1.7} />
                </ToolbarButton>
                <ToolbarButton label="Share" onClick={() => setShare(true)}>
                  <Send size={17} strokeWidth={1.7} />
                </ToolbarButton>
                <span className="mx-1 h-[46px] w-px bg-line-2" />
              </>
            )}
            <ViewToggle />
          </div>
          {editing && <ContextBar />}
        </div>

        <div className="pointer-events-auto flex items-center gap-1">
          {s.me?.guest && (
            <a href="/sign-in?redirect_url=/api/guest/claim" className="glass flex h-[40px] items-center rounded-[11px] px-4 text-[13.5px] text-fg hover:bg-[#1f1f1f]">
              Sign in
            </a>
          )}
          {!s.me?.guest && s.view === "editor" && !active && (
            <div className="glass flex h-[46px] items-center gap-0.5 rounded-[14px] px-1.5">
              <Tip label="Single">
                <button aria-label="Single view" className={cn("icon-btn", s.board === "single" && "icon-btn-on")} onClick={() => s.set({ board: "single" })}>
                  <Monitor size={16} strokeWidth={1.7} />
                </button>
              </Tip>
              <Tip label="Grid">
                <button aria-label="Grid view" className={cn("icon-btn", s.board === "grid" && "icon-btn-on")} onClick={() => s.set({ board: "grid" })}>
                  <LayoutGrid size={16} strokeWidth={1.7} />
                </button>
              </Tip>
              <span className="mx-1 h-5 w-px bg-line-2" />
              <ZoomMenu />
            </div>
          )}
          {!s.me?.guest && (s.view === "feed" || active) && (
            <div className="glass flex h-[46px] items-center gap-0.5 rounded-[14px] px-1.5">
              <Tip label="Info">
                <button aria-label="Toggle info" className={cn("icon-btn", s.infoOpen && "icon-btn-on")} onClick={() => s.set({ infoOpen: !s.infoOpen })}>
                  <Info size={16} strokeWidth={1.7} />
                </button>
              </Tip>
              {s.view === "editor" && (
                <>
                  <span className="mx-1 h-5 w-px bg-line-2" />
                  <ZoomMenu />
                </>
              )}
            </div>
          )}
          {!s.me?.guest && <CreditsPill />}
        </div>
      </div>
      <ShareAssetsDialog open={share} onClose={() => setShare(false)} ids={active ? [active.id] : []} />
      <OpenInCanvasDialog open={canvas} onClose={() => setCanvas(false)} ids={active ? [active.id] : []} />
    </>
  );
}
