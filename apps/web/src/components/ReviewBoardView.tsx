"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, MessageSquareText, RotateCcw } from "lucide-react";
import { timeAgo, type AssetDTO } from "@/lib/api";
import { CanopyMark, cn, Spinner } from "@/components/ui";

type Comment = { id: string; author: string; body: string; verdict: "approve" | "changes" | null; createdAt: string };
type Look = { asset: AssetDTO; comments: Comment[] };

function Badge({ comments }: { comments: Comment[] }) {
  const ok = comments.filter((c) => c.verdict === "approve").length;
  const ch = comments.filter((c) => c.verdict === "changes").length;
  const n = comments.filter((c) => c.body).length;
  if (!ok && !ch && !n) return null;
  return (
    <div className="absolute top-2 left-2 flex gap-1">
      {ok > 0 && <span className="rounded-[6px] bg-accent-bg px-1.5 py-0.5 text-[10.5px] text-accent-fg">✓ {ok}</span>}
      {ch > 0 && <span className="rounded-[6px] bg-[#3a2a12] px-1.5 py-0.5 text-[10.5px] text-[#f2c94c]">↺ {ch}</span>}
      {n > 0 && <span className="rounded-[6px] bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">💬 {n}</span>}
    </div>
  );
}

export function ReviewBoardView({ token, board, looks: initial, viewOnly }: { token: string; board: { title: string; by: string; createdAt: string }; looks: Look[]; viewOnly: boolean }) {
  const [looks, setLooks] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(initial.length === 1 ? initial[0].asset.id : null);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const look = looks.find((l) => l.asset.id === openId) ?? null;

  const send = async (verdict: "approve" | "changes" | null) => {
    if (!look) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/board/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: look.asset.id, author, body, verdict }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setLooks((ls) => ls.map((l) => (l.asset.id === look.asset.id ? { ...l, comments: j.comments } : l)));
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <header className="flex h-[60px] items-center gap-3 px-6">
      <Link href="/" className="flex items-center gap-2.5 text-[14px] font-medium">
        <CanopyMark size={20} /> Fashion Studio
      </Link>
      <span className="text-dim">/</span>
      <span className="truncate text-[13.5px] text-fg-2">{board.title}</span>
      {board.by && <span className="text-[12px] text-mute">by {board.by}</span>}
    </header>
  );

  if (!look) {
    return (
      <div className="min-h-screen bg-bg">
        {header}
        <p className="px-6 text-[12.5px] text-dim">
          {looks.length} look{looks.length === 1 ? "" : "s"} · {viewOnly ? "Click a look to view it" : "Click a look to comment, approve or request changes"}
        </p>
        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3 lg:grid-cols-4">
          {looks.map((l) => (
            <button key={l.asset.id} className="group relative overflow-hidden rounded-[10px] bg-[#161616] text-left" onClick={() => setOpenId(l.asset.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.asset.poster ?? l.asset.url} alt={l.asset.name} className="aspect-[4/5] w-full object-cover transition-transform group-hover:scale-[1.02]" />
              {!viewOnly && <Badge comments={l.comments} />}
              <div className="truncate px-2.5 py-2 text-[12px] text-fg-2">{l.asset.name}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const a = look.asset;
  const ext = a.mime === "image/svg+xml" ? "svg" : (a.mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png");
  const approvals = look.comments.filter((c) => c.verdict === "approve").length;
  const changes = look.comments.filter((c) => c.verdict === "changes").length;
  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <div className="relative flex flex-1 flex-col">
        {header}
        <div className="flex items-center gap-2 px-6">
          {looks.length > 1 && (
            <button className="btn h-8 text-[12px]" onClick={() => setOpenId(null)}>
              <ArrowLeft size={13} /> All looks
            </button>
          )}
          <a href={`${a.originalUrl ?? a.url}?download=${encodeURIComponent(`${a.name || "look"}.${ext}`)}`} className="btn ml-auto h-8 text-[12px]">
            <Download size={13} /> Download
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          {a.media === "video" ? (
            <video src={a.url} poster={a.poster ?? undefined} controls autoPlay loop muted playsInline className="max-h-[78vh] max-w-full rounded-[6px]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.url} alt={a.name} className="max-h-[78vh] max-w-full rounded-[6px] object-contain" />
          )}
        </div>
        <p className="pb-6 text-center text-[12px] text-mute uppercase">{a.name}</p>
      </div>
      {!viewOnly && (
        <aside className="flex w-full flex-col border-l border-line bg-panel lg:w-[360px]">
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-2 text-[14px] font-medium">
              <MessageSquareText size={15} /> Review
            </div>
            <p className="mt-1 text-[12px] text-dim">
              {approvals} approval{approvals === 1 ? "" : "s"} · {changes} change request{changes === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex min-h-[200px] flex-1 flex-col gap-3 overflow-y-auto p-5">
            {look.comments.length === 0 && <p className="text-[12.5px] text-dim">No feedback yet. Be the first.</p>}
            {look.comments.map((c) => (
              <div key={c.id} className="rounded-[10px] bg-[#1b1b1b] p-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-medium text-fg">{c.author}</span>
                  {c.verdict && (
                    <span className={cn("rounded-[5px] px-1.5 py-0.5 text-[10.5px]", c.verdict === "approve" ? "bg-accent-bg text-accent-fg" : "bg-[#3a2a12] text-[#f2c94c]")}>{c.verdict === "approve" ? "Approved" : "Changes requested"}</span>
                  )}
                  <span className="ml-auto text-mute">{timeAgo(c.createdAt)}</span>
                </div>
                {c.body && <p className="mt-1.5 text-[12.5px] leading-[1.45] whitespace-pre-wrap text-fg-2">{c.body}</p>}
              </div>
            ))}
          </div>
          <div className="border-t border-line p-5">
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" className="field mb-2 h-9 w-full px-3" maxLength={60} aria-label="Your name" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Leave a comment…" rows={3} className="field w-full resize-none px-3 py-2" maxLength={2000} aria-label="Comment" />
            {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
            <div className="mt-2 flex gap-2">
              <button className="btn flex-1" disabled={busy || !body.trim()} onClick={() => void send(null)}>
                {busy ? <Spinner size={13} /> : "Comment"}
              </button>
              <button className="btn flex-1 bg-accent-bg text-accent-fg hover:bg-accent-bg-2" disabled={busy} onClick={() => void send("approve")}>
                <Check size={13} /> Approve
              </button>
              <button className="btn flex-1" disabled={busy} onClick={() => void send("changes")}>
                <RotateCcw size={13} /> Changes
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
