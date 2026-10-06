"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Info, Plus, Search, ShoppingBag } from "lucide-react";
import { api } from "@/lib/api";
import { useAssets, useStudio } from "@/lib/store";
import { openInCanvas } from "@/lib/actions";
import { track } from "@/lib/analytics";
import { cn, Modal, Spinner } from "@/components/ui";

function Thumbs({ ids }: { ids: string[] }) {
  const assets = useAssets();
  const list = assets.filter((a) => ids.includes(a.id)).slice(0, 3);
  return (
    <div className="flex -space-x-3">
      {list.map((a) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={a.id} src={a.poster ?? a.url} alt="" className="h-9 w-9 rounded-[7px] border-2 border-[#161616] object-cover" />
      ))}
      {!list.length && <span className="h-9 w-9 rounded-[7px] bg-[#222]" />}
    </div>
  );
}

function CopyField({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-line-2 bg-[#1b1b1b] py-1.5 pr-1.5 pl-3">
      <input readOnly value={url} className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-fg-2 outline-none" onFocus={(e) => e.target.select()} aria-label="Link" />
      <button
        className="flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] text-accent hover:bg-hover"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : label}
      </button>
    </div>
  );
}

/* ---------------- Share for review ---------------- */

export function ShareForReviewDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const project = useStudio((s) => s.project);
  const toast = useStudio((s) => s.toast);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) setUrl(null);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Share for review" width={420}>
      <div className="flex items-center gap-3 rounded-[10px] border border-line-2 bg-[#1b1b1b] p-2.5">
        <Thumbs ids={ids} />
        <span className="text-[12.5px] text-fg-2">
          {ids.length} asset{ids.length === 1 ? "" : "s"}
        </span>
      </div>
      {url ? (
        <div className="mt-3">
          <CopyField url={url} />
          <p className="mt-2 text-[11.5px] text-mute">Reviewers can comment and approve each look — no account needed. Track responses in Review Mode.</p>
          <a href={url} target="_blank" rel="noreferrer" className="btn mt-3 w-full">
            <ExternalLink size={13} /> Open review page
          </a>
        </div>
      ) : (
        <button
          className="btn-accent mt-3 w-full"
          disabled={busy || !project || !ids.length}
          onClick={async () => {
            if (!project) return;
            setBusy(true);
            try {
              const r = await api.createReview(project.id, ids);
              setUrl(r.url);
              await navigator.clipboard.writeText(r.url).catch(() => {});
              track("review_link_created", { assets: ids.length });
            } catch (e) {
              toast((e as Error).message, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner size={14} /> : "Create review link"}
        </button>
      )}
    </Modal>
  );
}

/* ---------------- Share assets + Publish to Explore ---------------- */

export function ShareAssetsDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const assets = useAssets();
  const me = useStudio((s) => s.me);
  const project = useStudio((s) => s.project);
  const toast = useStudio((s) => s.toast);
  const [url, setUrl] = useState<string | null>(null);
  const [published, setPublished] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const first = assets.find((a) => a.id === ids[0]);
  const publishable = ids.filter((id) => assets.find((a) => a.id === id)?.kind === "result");

  useEffect(() => {
    if (!open || !ids.length || !project) return;
    setUrl(null);
    setPublished(null);
    let off = false;
    (async () => {
      try {
        // One image → its own link; several → a view-only board.
        const link = ids.length === 1 ? (await api.share(ids[0])).url : `${(await api.createReview(project.id, ids, "Shared looks")).url}?view=1`;
        if (!off) setUrl(link);
        if (publishable[0]) {
          const p = await api.explorePublished(publishable[0]);
          if (!off) setPublished(p.published);
        } else if (!off) setPublished(false);
      } catch (e) {
        if (!off) toast((e as Error).message, "error");
      }
    })();
    return () => {
      off = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} title={ids.length === 1 ? "Share this asset" : `Share ${ids.length} assets`} width={480}>
      {url ? <CopyField url={url} label="Copy share link" /> : <div className="flex h-[46px] items-center justify-center rounded-[10px] border border-line-2 bg-[#1b1b1b] text-dim"><Spinner size={14} /></div>}
      <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-mute">
        <Info size={11} /> Anyone with this link will be able to view the look{ids.length > 1 ? "s" : ""} and metadata
      </p>
      <div className="my-4 h-px bg-line-2" />
      <div className="text-[13.5px] font-medium text-fg">Publish to Explore</div>
      <p className="mt-0.5 text-[12px] text-dim">Share this work with the Canopy community.</p>
      <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-line-2 bg-[#1b1b1b] p-2.5">
        {first && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={first.poster ?? first.url} alt="" className="h-[72px] w-[72px] rounded-[9px] object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-fg">{project?.name ?? "Look"}</div>
          <div className="truncate text-[12px] text-dim">{me?.name}</div>
        </div>
        <button
          className={cn("h-9 rounded-[9px] px-3.5 text-[12.5px] font-medium", published ? "border border-line-3 text-fg-2 hover:bg-hover" : "bg-[#3b6cf6] text-white hover:bg-[#4a78ff] disabled:opacity-50")}
          disabled={busy || published === null || !publishable.length}
          title={!publishable.length ? "Only generated results can be published" : undefined}
          onClick={async () => {
            setBusy(true);
            try {
              if (published) {
                await Promise.all(publishable.map((id) => api.unpublish(id)));
                setPublished(false);
                toast("Removed from Explore");
              } else {
                await Promise.all(publishable.map((id) => api.publish(id, project?.name)));
                setPublished(true);
                track("explore_published", { assets: publishable.length });
                toast("Published to Explore", "ok");
              }
            } catch (e) {
              toast((e as Error).message, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner size={13} /> : published ? "Unpublish" : (
            <span className="flex items-center gap-1.5">
              <Globe size={13} /> Publish to Explore
            </span>
          )}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- Open in Canvas ---------------- */

export function OpenInCanvasDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const project = useStudio((s) => s.project);
  const [list, setList] = useState<{ id: string; name: string; thumbnailUrl: string | null }[] | null>(null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !project) return;
    setList(null);
    setPick(null);
    setQ("");
    api
      .canvases(project.id)
      .then((r) => setList(r.canvases))
      .catch(() => setList([]));
  }, [open, project]);
  const shown = useMemo(() => (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())), [list, q]);
  return (
    <Modal open={open} onClose={onClose} title="Open in Canvas" width={460}>
      <div className="flex items-center gap-2 rounded-[9px] border border-line-2 bg-[#1b1b1b] px-2.5">
        <Search size={13} className="text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search canvases" className="h-9 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-mute" />
      </div>
      <div className="mt-2 max-h-[300px] overflow-y-auto">
        <button className={cn("flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] hover:bg-hover", pick === null && "bg-hover")} onClick={() => setPick(null)}>
          <Plus size={14} className="text-dim" />
          <span className="flex-1">New canvas</span>
          {pick === null && <Check size={14} className="text-fg" />}
        </button>
        {list === null ? (
          <div className="px-2.5 py-2 text-[12px] text-mute">Loading…</div>
        ) : (
          shown.map((c) => (
            <button key={c.id} className={cn("flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] hover:bg-hover", pick === c.id && "bg-hover")} onClick={() => setPick(c.id)}>
              {c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumbnailUrl} alt="" className="h-6 w-6 rounded-[5px] object-cover" />
              ) : (
                <span className="h-6 w-6 rounded-[5px] bg-[#262626]" />
              )}
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {pick === c.id && <Check size={14} />}
            </button>
          ))
        )}
      </div>
      <button
        className="mt-3 h-10 w-full rounded-[10px] bg-[#3b6cf6] text-[13px] font-medium text-white hover:bg-[#4a78ff] disabled:opacity-60"
        disabled={busy || list === null}
        onClick={async () => {
          setBusy(true);
          await openInCanvas(ids, pick);
          track("open_in_canvas", { assets: ids.length, existing: Boolean(pick) });
          setBusy(false);
          onClose();
        }}
      >
        {list === null ? "Checking…" : busy ? <Spinner size={14} /> : pick ? "Add to canvas" : "Open in new canvas"}
      </button>
    </Modal>
  );
}

/* ---------------- Shopify ---------------- */

export function ShopifyConnect({ onConnected }: { onConnected?: (shop: string) => void }) {
  const toast = useStudio((s) => s.toast);
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api.connectShopify(shop, token);
          track("shopify_connected");
          toast(`Connected to ${r.name}`, "ok");
          onConnected?.(r.shop);
        } catch (err) {
          toast((err as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input value={shop} onChange={(e) => setShop(e.target.value)} required placeholder="your-store.myshopify.com" className="field h-9 px-2.5" aria-label="Store domain" />
      <input value={token} onChange={(e) => setToken(e.target.value)} required type="password" placeholder="Admin API access token (shpat_…)" className="field h-9 px-2.5" aria-label="Access token" />
      <p className="text-[11px] leading-[1.45] text-mute">
        In Shopify admin → Settings → Apps → Develop apps, create an app with the <code className="text-fg-2">write_products</code> scope and paste its Admin API token. It's stored encrypted.
      </p>
      <button className="btn-white h-9" disabled={busy}>
        {busy ? <Spinner size={13} /> : "Connect store"}
      </button>
    </form>
  );
}

export function ShopifyExport({ ids, onDone }: { ids: string[]; onDone?: () => void }) {
  const project = useStudio((s) => s.project);
  const toast = useStudio((s) => s.toast);
  const [status, setStatus] = useState<{ connected: boolean; shop?: string; name?: string } | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    api.shopify().then(setStatus).catch(() => setStatus({ connected: false }));
  }, []);
  useEffect(() => {
    if (project && !title) setTitle(project.name);
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!status) return <div className="py-4 text-dim"><Spinner size={14} /></div>;
  if (!status.connected) return <ShopifyConnect onConnected={() => api.shopify().then(setStatus)} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-[9px] border border-line-2 bg-[#1b1b1b] px-2.5 py-2 text-[12px]">
        <ShoppingBag size={13} className="text-accent" />
        <span className="flex-1 truncate text-fg-2">{status.name}</span>
        <button className="text-[11.5px] text-mute hover:text-fg" onClick={async () => (await api.disconnectShopify(), setStatus({ connected: false }))}>
          Disconnect
        </button>
      </div>
      {done ? (
        <a href={done} target="_blank" rel="noreferrer" className="btn-accent w-full">
          <ExternalLink size={13} /> Open the draft product in Shopify
        </a>
      ) : (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product title" className="field h-9 px-2.5" aria-label="Product title" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Description (optional)" className="field resize-none px-2.5 py-2" aria-label="Description" />
          <button
            className="btn-accent w-full"
            disabled={busy || !ids.length || !project}
            onClick={async () => {
              if (!project) return;
              setBusy(true);
              try {
                const r = await api.exportShopify(project.id, ids, title, desc);
                setDone(r.adminUrl);
                track("shopify_exported", { media: r.media });
                toast(`Draft product created with ${r.media} image${r.media === 1 ? "" : "s"}`, "ok");
                onDone?.();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner size={14} /> : `Export ${ids.length} look${ids.length === 1 ? "" : "s"} as a draft product`}
          </button>
        </>
      )}
    </div>
  );
}

export function ExportDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  return (
    <Modal open={open} onClose={onClose} title="Export to Shopify" width={420}>
      <ShopifyExport ids={ids} />
    </Modal>
  );
}
