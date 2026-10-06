"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  EllipsisVertical,
  Expand,
  FolderDown,
  GalleryHorizontal,
  LayoutGrid,
  Link2,
  MessageSquareText,
  Plus,
  Search,
  SquareArrowOutUpRight,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, timeAgo, type AssetDTO, type ProjectDTO, type RunDTO } from "@/lib/api";
import { useStudio, isPending, useAssets } from "@/lib/store";
import { ExportDialog, OpenInCanvasDialog, ShareAssetsDialog, ShareForReviewDialog } from "./FeedDialogs";
import { copyShareLink, deleteAssets, deleteRun, downloadAsset, downloadAssets, openInCanvas, toggleFlag } from "@/lib/actions";
import { cn, Popover, Spinner, Tip, useConfirm } from "@/components/ui";

function Breadcrumb() {
  const project = useStudio((s) => s.project)!;
  const role = useStudio((s) => s.role);
  const set = useStudio((s) => s.set);
  const toast = useStudio((s) => s.toast);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState<ProjectDTO[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api.projects(q).then((r) => setList(r.projects)).catch(() => setList([])), 120);
    return () => clearTimeout(t);
  }, [open, q]);
  const rename = async () => {
    setRenaming(false);
    if (!name.trim() || name === project.name) return setName(project.name);
    try {
      set({ project: (await api.renameProject(project.id, name)).project });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      <a href="/studios" className="text-dim hover:text-fg">
        Fashion Studio
      </a>
      <span className="text-faint">/</span>
      {renaming ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === "Enter" && rename()} className="field h-7 w-[200px] px-2" />
      ) : (
        <button ref={ref} className="flex items-center gap-1 rounded-[7px] px-1.5 py-1 font-medium text-fg hover:bg-hover" onClick={() => setOpen((o) => !o)}>
          {project.name} <ChevronDown size={13} className="text-dim" />
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} className="w-[280px] p-1.5">
        <div className="mb-1 flex items-center gap-2 rounded-[8px] bg-[#232323] px-2">
          <Search size={13} className="text-dim" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute" />
        </div>
        <div className="max-h-[260px] overflow-y-auto">
          {list === null ? (
            <div className="flex justify-center py-3 text-dim">
              <Spinner size={14} />
            </div>
          ) : (
            list.map((p) => (
              <button key={p.id} className={cn("menu-item", p.id === project.id && "bg-hover text-fg")} onClick={() => (setOpen(false), router.push(`/studio/${p.id}?view=feed`))}>
                <span className="h-6 w-6 shrink-0 overflow-hidden rounded-[5px] bg-[#262626]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.cover && <img src={p.cover} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
        <div className="my-1 h-px bg-line-2" />
        {role !== "viewer" && (
          <button className="menu-item" onClick={() => (setOpen(false), setRenaming(true))}>
            Rename project
          </button>
        )}
        <button
          className="menu-item"
          onClick={async () => {
            setOpen(false);
            const { project: p } = await api.createProject();
            router.push(`/studio/${p.id}`);
          }}
        >
          <Plus size={14} /> New project
        </button>
      </Popover>
    </div>
  );
}

function ItemMenu({ a, onInfo }: { a: AssetDTO; onInfo: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const role = useStudio((s) => s.role);
  const confirm = useConfirm();
  return (
    <>
      <button ref={ref} aria-label="More" className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-black/60 text-white backdrop-blur hover:bg-black/80" onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
        <EllipsisVertical size={14} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" className="w-[190px]">
        <button className="menu-item" onClick={() => (setOpen(false), onInfo())}>
          Show info
        </button>
        <button className="menu-item" onClick={() => (setOpen(false), void openInCanvas([a.id]))}>
          Open in Canvas
        </button>
        <button className="menu-item" onClick={() => (setOpen(false), void toggleFlag([a.id], "marked"))}>
          {a.marked ? "Unmark" : "Mark"}
        </button>
        <button className="menu-item" onClick={() => (setOpen(false), void copyShareLink([a.id]))}>
          Copy share link
        </button>
        {role === "owner" && (
          <button
            className="menu-item text-danger hover:text-danger"
            onClick={async () => {
              setOpen(false);
              if (await confirm({ title: "Delete this result?", body: "It will be removed from the feed for everyone.", confirm: "Delete", danger: true })) await deleteAssets([a.id]);
            }}
          >
            Delete
          </button>
        )}
      </Popover>
    </>
  );
}

function Item({ a, height, selected, onSelect, onOpen, onFullscreen }: { a: AssetDTO; height: number; selected: boolean; onSelect: (e: React.MouseEvent) => void; onOpen: () => void; onFullscreen: () => void }) {
  const set = useStudio((s) => s.set);
  const ratio = a.width && a.height ? a.width / a.height : 0.8;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-asset={a.id}
      className={cn("group relative shrink-0 cursor-pointer overflow-hidden rounded-[6px] border-2 bg-[#1a1a1a]", selected ? "border-accent" : "border-transparent")}
      style={{ height, width: height * ratio }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("application/x-fs-asset", a.id)}
    >
      {a.media === "video" ? (
        <video src={a.url} poster={a.poster ?? undefined} muted loop playsInline className="h-full w-full object-cover" onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.url} alt={a.name} loading="lazy" className="h-full w-full object-cover" draggable={false} />
      )}
      {selected && (
        <span className="absolute top-2 right-2 flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-accent text-accent-ink">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
      )}
      {a.marked && (
        <span className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[#f2c94c]">
          <Star size={11} fill="currentColor" />
        </span>
      )}
      {!selected && (
        <div className="absolute top-2 right-2 hidden gap-1 group-hover:flex" onClick={(e) => e.stopPropagation()}>
          <Tip label="Download">
            <button aria-label="Download" className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-black/60 text-white backdrop-blur hover:bg-black/80" onClick={() => downloadAsset(a)}>
              <Download size={13} />
            </button>
          </Tip>
          <Tip label="Fullscreen">
            <button aria-label="Fullscreen" className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-black/60 text-white backdrop-blur hover:bg-black/80" onClick={onFullscreen}>
              <Expand size={13} />
            </button>
          </Tip>
          <ItemMenu a={a} onInfo={() => set({ activeId: a.id, infoOpen: true })} />
        </div>
      )}
    </div>
  );
}

function Lightbox({ list, index, onClose, onIndex }: { list: AssetDTO[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const a = list[index];
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(list.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [index, list.length, onClose, onIndex]);
  if (!a) return null;
  return (
    <div className="fixed inset-0 z-[85] flex animate-fade-in items-center justify-center bg-black/92" onClick={onClose}>
      {a.media === "video" ? (
        <video src={a.url} controls autoPlay loop className="max-h-[88vh] max-w-[86vw]" onClick={(e) => e.stopPropagation()} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.url} alt={a.name} className="max-h-[88vh] max-w-[86vw] object-contain" onClick={(e) => e.stopPropagation()} />
      )}
      <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Download" className="icon-btn bg-white/10" onClick={() => downloadAsset(a)}>
          <Download size={16} />
        </button>
        <button aria-label="Close" className="icon-btn bg-white/10" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[12px] text-white/70 uppercase">{a.name}</div>
      {index > 0 && (
        <button aria-label="Previous" className="icon-btn absolute left-4 bg-white/10" onClick={(e) => (e.stopPropagation(), onIndex(index - 1))}>
          <ChevronLeft size={18} />
        </button>
      )}
      {index < list.length - 1 && (
        <button aria-label="Next" className="icon-btn absolute right-4 bg-white/10" onClick={(e) => (e.stopPropagation(), onIndex(index + 1))}>
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}

const ACTIONS = [
  { id: "mark", label: "Mark", desc: "Mark these for the team's marked filter", Icon: Bookmark },
  { id: "canvas", label: "Open in Canvas", desc: "Place these on a canvas as media nodes", Icon: SquareArrowOutUpRight },
  { id: "share", label: "Share assets", desc: "Copy a link anyone can open", Icon: Link2 },
  { id: "review", label: "Share for review", desc: "Collect comments and approvals from collaborators", Icon: MessageSquareText },
  { id: "download", label: "Download", desc: "Original resolution files", Icon: Download },
  { id: "save", label: "Save to Assets", desc: "Keep these in your Assets", Icon: FolderDown },
  { id: "export", label: "Export", desc: "Send assets to Shopify as a draft product", Icon: Upload },
  { id: "delete", label: "Delete", desc: "Remove from the feed — this can't be undone", Icon: Trash2 },
] as const;

export function SelectionPanel() {
  const ids = useStudio((s) => s.selectedIds);
  const assets = useAssets();
  const role = useStudio((s) => s.role);
  const set = useStudio((s) => s.set);
  const toast = useStudio((s) => s.toast);
  const confirm = useConfirm();
  const list = assets.filter((a) => ids.includes(a.id));
  const [dialog, setDialog] = useState<null | "canvas" | "share" | "review" | "export">(null);
  const allMarked = list.length > 0 && list.every((a) => a.marked);
  const allSaved = list.length > 0 && list.every((a) => a.saved);
  const run = async (id: (typeof ACTIONS)[number]["id"]) => {
    if (id === "mark") return toggleFlag(ids, "marked");
    if (id === "canvas" || id === "share" || id === "review" || id === "export") return setDialog(id);
    if (id === "download") return downloadAssets(list, "selection.zip");
    if (id === "save") return toggleFlag(ids, "saved");
    if (id === "delete") {
      if (role !== "owner") return toast("Only the project owner can delete results", "error");
      if (await confirm({ title: `Delete ${ids.length} result${ids.length > 1 ? "s" : ""}?`, body: "They'll be removed from the feed for everyone. This can't be undone.", confirm: "Delete", danger: true })) await deleteAssets(ids);
    }
  };
  if (!ids.length) return null;
  return (
    <aside className="fixed top-[64px] right-[10px] bottom-[8px] z-20 flex w-[266px] animate-fade-in flex-col rounded-[13px] border border-line bg-panel" data-tour="selection-panel">
      <header className="mx-[10px] flex items-start gap-2 border-b border-line-2 pt-[12px] pb-[11px]">
        <div className="flex-1">
          <h2 className="text-[13px] font-medium">
            {ids.length} asset{ids.length > 1 ? "s" : ""} selected
          </h2>
          <p className="mt-[3px] text-[11px] text-dim">Choose what to do with them</p>
        </div>
        <button aria-label="Clear selection" className="-mr-1 flex h-7 w-7 items-center justify-center rounded-[8px] text-dim hover:bg-hover hover:text-fg" onClick={() => set({ selectedIds: [] })}>
          <X size={15} />
        </button>
      </header>
      <div className="flex flex-col gap-0.5 p-1.5">
        {ACTIONS.map((a) => (
          <button key={a.id} className={cn("flex items-start gap-2.5 rounded-[9px] px-2.5 py-2 text-left hover:bg-hover", a.id === "delete" && "text-danger")} onClick={() => void run(a.id)}>
            <a.Icon size={14} className={cn("mt-[2px] shrink-0", a.id === "delete" ? "text-danger" : "text-dim")} />
            <span>
              <span className={cn("block text-[12.5px]", a.id === "delete" ? "text-danger" : "text-fg")}>
                {a.id === "mark" && allMarked ? "Unmark" : a.id === "save" && allSaved ? "Remove from Assets" : a.label}
              </span>
              <span className="block text-[11px] leading-[1.35] text-mute">{a.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <OpenInCanvasDialog open={dialog === "canvas"} onClose={() => setDialog(null)} ids={ids} />
      <ShareAssetsDialog open={dialog === "share"} onClose={() => setDialog(null)} ids={ids} />
      <ShareForReviewDialog open={dialog === "review"} onClose={() => setDialog(null)} ids={ids} />
      <ExportDialog open={dialog === "export"} onClose={() => setDialog(null)} ids={ids} />
    </aside>
  );
}

function RunHeader({ r }: { r: RunDTO }) {
  const role = useStudio((s) => s.role);
  const confirm = useConfirm();
  return (
    <div className="group/run mb-2.5 flex h-7 items-center gap-2">
      <span className="text-[12.5px] font-medium text-fg">{r.toolName}</span>
      <span className="text-[12px] text-mute">{isPending(r) ? "Generating…" : timeAgo(r.finishedAt ?? r.createdAt)}</span>
      {r.status === "failed" && <span className="text-[11.5px] text-danger">Failed</span>}
      <div className="ml-2 hidden items-center gap-0.5 group-hover/run:flex">
        {r.outputs.length > 0 && (
          <Tip label="Download run">
            <button aria-label="Download run" className="flex h-7 w-7 items-center justify-center rounded-[7px] text-dim hover:bg-hover hover:text-fg" onClick={() => void downloadAssets(r.outputs, `${r.toolName.replace(/\W+/g, "-").toLowerCase()}.zip`)}>
              <Download size={13} />
            </button>
          </Tip>
        )}
        {role === "owner" && (
          <Tip label="Delete run">
            <button
              aria-label="Delete run"
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-dim hover:bg-hover hover:text-danger"
              onClick={async () => {
                if (await confirm({ title: "Delete this run?", body: `All ${r.outputs.length} result${r.outputs.length === 1 ? "" : "s"} in it will be removed.`, confirm: "Delete run", danger: true })) await deleteRun(r);
              }}
            >
              <Trash2 size={13} />
            </button>
          </Tip>
        )}
      </div>
    </div>
  );
}

export function Feed() {
  const runs = useStudio((s) => s.runs);
  const selectedIds = useStudio((s) => s.selectedIds);
  const set = useStudio((s) => s.set);
  const setActive = useStudio((s) => s.setActive);
  const [layout, setLayout] = useState<"grid" | "ticker">("grid");
  const [size, setSize] = useState(340);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [light, setLight] = useState<number | null>(null);
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("fs.feed") ?? "{}");
      if (v.layout) setLayout(v.layout);
      if (v.size) setSize(v.size);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("fs.feed", JSON.stringify({ layout, size }));
    } catch {}
  }, [layout, size]);

  const shown = useMemo(() => runs.map((r) => ({ ...r, outputs: onlyMarked ? r.outputs.filter((o) => o.marked) : r.outputs })).filter((r) => r.outputs.length || (!onlyMarked && (isPending(r) || r.status === "failed"))), [runs, onlyMarked]);
  const flat = useMemo(() => shown.flatMap((r) => r.outputs), [shown]);

  const select = (a: AssetDTO, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const i0 = flat.findIndex((x) => x.id === anchor.current);
      const i1 = flat.findIndex((x) => x.id === a.id);
      const range = flat.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((x) => x.id);
      set({ selectedIds: [...new Set([...selectedIds, ...range])] });
      return;
    }
    anchor.current = a.id;
    if (e.metaKey || e.ctrlKey) set({ selectedIds: selectedIds.includes(a.id) ? selectedIds.filter((x) => x !== a.id) : [...selectedIds, a.id] });
    else set({ selectedIds: selectedIds.length === 1 && selectedIds[0] === a.id ? [] : [a.id] });
  };

  const panel = selectedIds.length > 0;
  return (
    <>
      <div className="fixed top-[60px] bottom-0 left-[140px] overflow-y-auto pb-24" style={{ right: panel ? 276 : 10 }} onClick={(e) => e.target === e.currentTarget && set({ selectedIds: [] })}>
        <div className="sticky top-0 z-10 flex h-[46px] items-center justify-between bg-gradient-to-b from-black via-black/95 to-transparent pr-2 pl-[16px]">
          <Breadcrumb />
          <div className="flex items-center gap-1">
            <Tip label="Marked only">
              <button aria-label="Marked only" className={cn("icon-btn h-8 w-8", onlyMarked && "icon-btn-on")} onClick={() => setOnlyMarked((v) => !v)}>
                <Star size={14} />
              </button>
            </Tip>
            <span className="mx-1 h-5 w-px bg-line-2" />
            <Tip label="Grid">
              <button aria-label="Grid layout" className={cn("icon-btn h-8 w-8", layout === "grid" && "icon-btn-on")} onClick={() => setLayout("grid")}>
                <LayoutGrid size={14} />
              </button>
            </Tip>
            <Tip label="Ticker">
              <button aria-label="Ticker layout" className={cn("icon-btn h-8 w-8", layout === "ticker" && "icon-btn-on")} onClick={() => setLayout("ticker")}>
                <GalleryHorizontal size={14} />
              </button>
            </Tip>
            <input aria-label="Thumbnail size" type="range" min={120} max={420} value={size} onChange={(e) => setSize(Number(e.target.value))} className="ml-2 w-[110px] accent-[#d6d6d6]" />
          </div>
        </div>

        <div className="flex flex-col gap-7 px-[16px] pt-3">
          {shown.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-32 text-center">
              <p className="text-[14px] text-fg">{onlyMarked ? "Nothing marked yet" : "Your feed is empty"}</p>
              <p className="text-[12.5px] text-dim">{onlyMarked ? "Mark results to shortlist them here." : "Every generation lands here, newest first."}</p>
            </div>
          )}
          {shown.map((r) => (
            <section key={r.id} data-run={r.id}>
              <RunHeader r={r} />
              <div className={cn("flex gap-2.5", layout === "grid" ? "flex-wrap" : "overflow-x-auto pb-1 [scrollbar-width:thin]")}>
                {r.outputs.map((a) => (
                  <Item
                    key={a.id}
                    a={a}
                    height={layout === "ticker" ? size * 1.25 : size}
                    selected={selectedIds.includes(a.id)}
                    onSelect={(e) => select(a, e)}
                    onOpen={() => {
                      setActive(a.id);
                      set({ view: "editor", selectedIds: [] });
                    }}
                    onFullscreen={() => setLight(flat.findIndex((x) => x.id === a.id))}
                  />
                ))}
                {isPending(r) &&
                  Array.from({ length: Math.max(0, r.expected - r.outputs.length) }, (_, i) => <div key={i} className="shimmer shrink-0 rounded-[6px]" style={{ height: size, width: size * 0.8 }} />)}
                {r.status === "failed" && !r.outputs.length && (
                  <div className="flex shrink-0 flex-col items-center justify-center gap-2 rounded-[6px] border border-danger-line bg-danger-bg p-4 text-center" style={{ height: size, width: size * 0.8 }}>
                    <CircleAlert size={18} className="text-danger" />
                    <p className="text-[12px] leading-[1.4] text-[#f1d6d6]">{r.error ?? "Generation failed"}</p>
                    <p className="text-[11px] text-mute">Credits refunded</p>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      <button
        className="glass fixed bottom-[18px] left-1/2 z-20 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full px-4 text-[12.5px] text-fg-2 hover:text-fg"
        style={{ marginLeft: panel ? -133 : 65 }}
        onClick={() => {
          set({ view: "editor", selectedIds: [] });
          useStudio.getState().openTool("prompt");
        }}
      >
        <Plus size={14} /> Make something new
      </button>
      <SelectionPanel />
      {light != null && <Lightbox list={flat} index={light} onIndex={setLight} onClose={() => setLight(null)} />}
    </>
  );
}
