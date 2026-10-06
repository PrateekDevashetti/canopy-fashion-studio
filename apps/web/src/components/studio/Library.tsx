"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Folder, Globe, Hash, Link2, Search, X } from "lucide-react";
import { api, type AssetDTO, type ExplorePostDTO, type StockPhotoDTO } from "@/lib/api";
import { useAssets, useStudio } from "@/lib/store";
import { track } from "@/lib/analytics";
import { cn, Spinner } from "@/components/ui";

type Source = "assets" | "elements" | "history" | "explore" | "stock" | "savee" | "drive" | "dropbox" | "frameio" | "figma";

/* Small brand glyphs (monochrome / brand-coloured, drawn inline). */
const Glyph = {
  unsplash: () => (
    <svg viewBox="0 0 32 32" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z" />
    </svg>
  ),
  savee: () => <span className="text-[11px] font-semibold tracking-tight">SS</span>,
  drive: () => (
    <svg viewBox="0 0 87.3 78" width="15" height="15" aria-hidden>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  ),
  dropbox: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="#3d82f6" aria-hidden>
      <path d="M6 2 0 6l6 4 6-4zm12 0-6 4 6 4 6-4zM0 14l6 4 6-4-6-4zm18-4-6 4 6 4 6-4zM6 19.5l6 4 6-4-6-4z" />
    </svg>
  ),
  frameio: () => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <rect x="3" y="4" width="2.2" height="16" rx="1" />
      <rect x="8" y="7" width="2.2" height="10" rx="1" />
      <rect x="13" y="9" width="2.2" height="6" rx="1" />
      <rect x="18" y="10.5" width="2.2" height="3" rx="1" />
    </svg>
  ),
  figma: () => (
    <svg viewBox="0 0 24 36" width="11" height="15" aria-hidden>
      <path d="M6 36a6 6 0 0 0 6-6v-6H6a6 6 0 0 0 0 12z" fill="#0acf83" />
      <path d="M0 18a6 6 0 0 1 6-6h6v12H6a6 6 0 0 1-6-6z" fill="#a259ff" />
      <path d="M0 6a6 6 0 0 1 6-6h6v12H6a6 6 0 0 1-6-6z" fill="#f24e1e" />
      <path d="M12 0h6a6 6 0 0 1 0 12h-6z" fill="#ff7262" />
      <path d="M24 18a6 6 0 1 1-12 0 6 6 0 0 1 12 0z" fill="#1abcfe" />
    </svg>
  ),
};

const CONNECTORS: Record<"savee" | "drive" | "dropbox" | "frameio" | "figma", { name: string; desc: string; hint: string; Icon: () => React.ReactElement }> = {
  savee: { name: "Savee", desc: "Access your Savee saves and boards from the library.", hint: "Paste a Savee image link", Icon: Glyph.savee },
  drive: { name: "Google Drive", desc: "Bring images in from Google Drive.", hint: "Paste a Drive file link shared as “Anyone with the link”", Icon: Glyph.drive },
  dropbox: { name: "Dropbox", desc: "Bring images in from Dropbox.", hint: "Paste a Dropbox share link", Icon: Glyph.dropbox },
  frameio: { name: "Frame.io", desc: "Bring review stills in from Frame.io.", hint: "Paste a Frame.io asset download link", Icon: Glyph.frameio },
  figma: { name: "Figma", desc: "Bring frames in from Figma.", hint: "Paste an exported image link from Figma", Icon: Glyph.figma },
};

const STOCK_TABS = ["Fashion", "Abstract", "Nature", "Animals", "Portraits", "Landscape", "Texture"];

/** Add a library item to this project (or just open it if it already lives here) and open it in the editor. */
async function addToProject(a: AssetDTO) {
  const s = useStudio.getState();
  if (!s.project) return;
  if (a.projectId === s.project.id) {
    s.setActive(a.id);
    s.set({ view: "editor", libraryOpen: false });
    return;
  }
  try {
    const { asset } = await api.importAsset(s.project.id, a.id);
    await s.refresh();
    useStudio.getState().setActive(asset.id);
    useStudio.getState().set({ view: "editor", libraryOpen: false });
    track("library_imported", { from: "workspace" });
  } catch (e) {
    s.toast((e as Error).message, "error");
  }
}

async function importLink(url: string, name?: string, from = "link") {
  const s = useStudio.getState();
  if (!s.project) return false;
  try {
    const { asset } = await api.importUrl(s.project.id, url, name);
    await s.refresh();
    useStudio.getState().setActive(asset.id);
    useStudio.getState().set({ view: "editor", libraryOpen: false });
    track("library_imported", { from });
    return true;
  } catch (e) {
    s.toast((e as Error).message, "error");
    return false;
  }
}

function Masonry<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const cols: T[][] = [[], [], []];
  items.forEach((it, i) => cols[i % 3].push(it));
  return (
    <div className="grid grid-cols-3 gap-6">
      {cols.map((c, i) => (
        <div key={i} className="flex flex-col gap-6">
          {c.map(render)}
        </div>
      ))}
    </div>
  );
}

function Card({ src, title, sub, onClick, draggableId }: { src: string; title: string; sub?: string; onClick: () => void; draggableId?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="group text-left"
      draggable={Boolean(draggableId)}
      onDragStart={(e) => draggableId && e.dataTransfer.setData("application/x-fs-asset", draggableId)}
      onClick={async () => {
        setBusy(true);
        await onClick();
        setBusy(false);
      }}
    >
      <div className="relative overflow-hidden rounded-[10px] bg-[#1c1c1c]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} loading="lazy" className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Spinner size={16} />
          </div>
        )}
      </div>
      <div className="mt-2 truncate text-[13px] text-fg">{title}</div>
      {sub && <div className="truncate text-[12px] text-dim">{sub}</div>}
    </button>
  );
}

function AssetsView({ source, q }: { source: "assets" | "elements" | "history"; q: string }) {
  const project = useAssets();
  const [list, setList] = useState<AssetDTO[] | null>(null);
  useEffect(() => {
    setList(null);
    api
      .library(source)
      .then((r) => setList(r.assets))
      .catch(() => setList([]));
  }, [source]);
  // "Assets" also lists this project's own images first, so drag-to-input keeps working.
  const items = useMemo(() => {
    const ws = list ?? [];
    const merged = source === "assets" ? [...project.filter((a) => a.media === "image"), ...ws.filter((w) => !project.some((p) => p.id === w.id))] : ws;
    return merged.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));
  }, [list, project, source, q]);
  if (!list) return <div className="py-16 text-center text-dim"><Spinner size={16} /></div>;
  if (!items.length)
    return (
      <p className="py-16 text-center text-[13px] text-dim">
        {source === "assets" ? "Upload images or use “Save to Assets” in the feed to keep looks here." : source === "elements" ? "Cut-outs, extracted garments and vectors you make show up here." : "Nothing generated yet."}
      </p>
    );
  return <Masonry items={items} render={(a) => <Card key={a.id} src={a.poster ?? a.url} title={a.name || "Untitled"} sub={new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} onClick={() => addToProject(a)} draggableId={a.id} />} />;
}

function ExploreView({ q }: { q: string }) {
  const [posts, setPosts] = useState<ExplorePostDTO[] | null>(null);
  useEffect(() => {
    api
      .explore()
      .then((r) => setPosts(r.posts))
      .catch(() => setPosts([]));
  }, []);
  if (!posts) return <div className="py-16 text-center text-dim"><Spinner size={16} /></div>;
  const shown = posts.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.author.toLowerCase().includes(q.toLowerCase()));
  if (!shown.length) return <p className="py-16 text-center text-[13px] text-dim">Nothing on Explore yet — publish a look from Share → Publish to Explore.</p>;
  return <Masonry items={shown} render={(p) => <Card key={p.id} src={p.asset.poster ?? p.asset.url} title={p.title || "Untitled"} sub={p.author ? `@${p.author}` : undefined} onClick={() => addToProject(p.asset)} />} />;
}

function StockView({ q }: { q: string }) {
  const [tab, setTab] = useState(STOCK_TABS[0]);
  const [data, setData] = useState<{ provider: string; photos: StockPhotoDTO[] } | null>(null);
  const query = q.trim() || tab;
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => {
      api
        .stock(query === "Fashion" ? "fashion editorial" : query)
        .then(setData)
        .catch(() => setData({ provider: "", photos: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  return (
    <>
      <div className="-mt-1 mb-5 flex flex-wrap gap-4">
        {STOCK_TABS.map((t) => (
          <button key={t} className={cn("text-[14px]", t === tab && !q ? "text-fg" : "text-dim hover:text-fg")} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {!data ? (
        <div className="py-16 text-center text-dim"><Spinner size={16} /></div>
      ) : !data.photos.length ? (
        <p className="py-16 text-center text-[13px] text-dim">No photos found.</p>
      ) : (
        <>
          <Masonry items={data.photos} render={(p) => <Card key={p.id} src={p.thumb} title={p.title} sub={p.author} onClick={() => importLink(p.full, p.title.slice(0, 80), data.provider)} />} />
          <p className="mt-6 text-center text-[11px] text-mute">
            Photos from {data.provider === "unsplash" ? "Unsplash" : "Openverse (Creative Commons)"} — check each photo's license before commercial use.
          </p>
        </>
      )}
    </>
  );
}

function ConnectorView({ id }: { id: keyof typeof CONNECTORS }) {
  const c = CONNECTORS[id];
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-full flex-col items-center justify-center pb-24 text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center text-fg [&_svg]:h-8 [&_svg]:w-8">
        <c.Icon />
      </div>
      <div className="text-[15px] font-medium text-fg">{c.name}</div>
      <p className="mt-1 text-[13px] text-dim">{c.desc}</p>
      {!open ? (
        <button className="btn mt-5 h-10 px-4" onClick={() => setOpen(true)}>
          <span className="flex items-center [&_svg]:h-4 [&_svg]:w-4">
            <c.Icon />
          </span>
          Log in with {c.name}
        </button>
      ) : (
        <form
          className="mt-5 flex w-full max-w-[440px] flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await importLink(url, undefined, id)) setUrl("");
            setBusy(false);
          }}
        >
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder={c.hint} className="field h-10 min-w-0 flex-1 px-3" aria-label={`${c.name} link`} autoFocus />
            <button className="btn-white h-10 px-4" disabled={busy}>
              {busy ? <Spinner size={13} /> : "Import"}
            </button>
          </div>
          <p className="text-[11.5px] text-mute">Shared links are downloaded once and added to this project as-is.</p>
        </form>
      )}
    </div>
  );
}

/** Library: your assets, the community Explore feed, stock photos and connected sources. */
export function Library() {
  const set = useStudio((s) => s.set);
  const [src, setSrc] = useState<Source>("assets");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && set({ libraryOpen: false });
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [set]);
  useEffect(() => {
    setQ("");
    setSearching(false);
    track("library_source", { source: src });
  }, [src]);
  const nav: { id: Source; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: "assets", label: "Assets", icon: <Folder size={15} /> },
    { id: "elements", label: "Elements", icon: <Hash size={15} /> },
    { id: "history", label: "History", icon: <Clock size={15} /> },
    { id: "explore", label: "Explore", icon: <Globe size={15} />, badge: "New" },
  ];
  const connectors: { id: Source; label: string; icon: React.ReactNode }[] = [
    { id: "stock", label: "Unsplash", icon: <Glyph.unsplash /> },
    { id: "savee", label: "Savee", icon: <Glyph.savee /> },
    { id: "drive", label: "Google Drive", icon: <Glyph.drive /> },
    { id: "dropbox", label: "Dropbox", icon: <Glyph.dropbox /> },
    { id: "frameio", label: "Frame.io", icon: <Glyph.frameio /> },
    { id: "figma", label: "Figma", icon: <Glyph.figma /> },
  ];
  const title = [...nav, ...connectors].find((n) => n.id === src)?.label ?? "";
  const searchable = ["assets", "elements", "history", "explore", "stock"].includes(src);
  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-black/40" onPointerDown={(e) => e.target === e.currentTarget && set({ libraryOpen: false })}>
      <div ref={panel} role="dialog" aria-label="Library" className="flex h-[min(1130px,calc(100vh-110px))] w-[min(1500px,calc(100vw-260px))] animate-pop overflow-hidden rounded-[18px] border border-line-2 bg-[#141414]/95 shadow-[0_30px_90px_rgba(0,0,0,0.7)] backdrop-blur-xl" style={{ marginLeft: 120 }}>
        <nav className="m-3 flex w-[300px] shrink-0 flex-col rounded-[14px] border border-line-2 bg-[#1a1a1a] p-1.5">
          {nav.map((n) => (
            <button key={n.id} className={cn("flex h-[50px] items-center gap-3 rounded-[10px] px-3 text-[15px]", src === n.id ? "bg-[#262626] text-fg" : "text-fg-2 hover:bg-[#222] hover:text-fg")} onClick={() => setSrc(n.id)}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#242424] text-dim">{n.icon}</span>
              {n.label}
              {n.badge && <span className="rounded-[6px] bg-accent-bg px-1.5 py-0.5 text-[12px] text-accent">{n.badge}</span>}
            </button>
          ))}
          <div className="my-1.5 h-px bg-line-2" />
          {connectors.map((n) => (
            <button key={n.id} className={cn("flex h-[50px] items-center gap-3 rounded-[10px] px-3 text-[15px]", src === n.id ? "bg-[#262626] text-fg" : "text-fg-2 hover:bg-[#222] hover:text-fg")} onClick={() => setSrc(n.id)}>
              <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#242424] text-fg-2">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="mt-auto px-3 pb-2 text-[11.5px] leading-[1.45] text-mute">
            <Link2 size={11} className="mr-1 inline" />
            Drag any image here or onto a tool input.
          </div>
        </nav>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[78px] shrink-0 items-center gap-3 px-7">
            {searching && searchable ? (
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${title}`} className="h-10 flex-1 bg-transparent text-[18px] text-fg outline-none placeholder:text-mute" aria-label="Search library" />
            ) : (
              <h2 className="flex-1 text-[19px] font-medium text-fg">{title}</h2>
            )}
            {searchable && (
              <button aria-label="Search" className={cn("flex h-11 w-11 items-center justify-center rounded-[11px] border border-line-2 text-fg-2 hover:text-fg", searching && "bg-[#262626]")} onClick={() => (setSearching((v) => !v), setQ(""))}>
                <Search size={17} />
              </button>
            )}
            <span className="h-7 w-px bg-line-2" />
            <button aria-label="Close library" className="flex h-11 w-11 items-center justify-center rounded-[11px] text-fg-2 hover:bg-[#222] hover:text-fg" onClick={() => set({ libraryOpen: false })}>
              <X size={18} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
            {(src === "assets" || src === "elements" || src === "history") && <AssetsView source={src} q={q} />}
            {src === "explore" && <ExploreView q={q} />}
            {src === "stock" && <StockView q={q} />}
            {(src === "savee" || src === "drive" || src === "dropbox" || src === "frameio" || src === "figma") && <ConnectorView id={src} />}
          </div>
        </section>
      </div>
    </div>
  );
}
