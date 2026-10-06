"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, MessageSquareText, RotateCcw } from "lucide-react";
import { timeAgo } from "@/lib/api";
import { CanopyMark, cn, Spinner } from "@/components/ui";

type Comment = { id: string; author: string; body: string; verdict: "approve" | "changes" | null; createdAt: string };

export function SharedView({ token, asset, review, initialComments }: { token: string; asset: { name: string; media: string; url: string; poster: string | null; width: number; height: number; mime: string }; review: boolean; initialComments: Comment[] }) {
  const [comments, setComments] = useState(initialComments);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ext = asset.mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const send = async (verdict: "approve" | "changes" | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ author, body, verdict }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setComments(j.comments);
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const approvals = comments.filter((c) => c.verdict === "approve").length;
  const changes = comments.filter((c) => c.verdict === "changes").length;
  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row">
      <div className="relative flex flex-1 flex-col">
        <header className="flex h-[60px] items-center gap-3 px-6">
          <Link href="/" className="flex items-center gap-2.5 text-[14px] font-medium">
            <CanopyMark size={20} /> Fashion Studio
          </Link>
          <a href={`${asset.url}?download=${encodeURIComponent(`${asset.name || "look"}.${ext}`)}`} className="btn ml-auto">
            <Download size={13} /> Download
          </a>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          {asset.media === "video" ? (
            <video src={asset.url} poster={asset.poster ?? undefined} controls autoPlay loop muted playsInline className="max-h-[80vh] max-w-full rounded-[6px]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.url} alt={asset.name} className="max-h-[80vh] max-w-full rounded-[6px] object-contain" />
          )}
        </div>
        <p className="pb-6 text-center text-[12px] text-mute uppercase">{asset.name}</p>
      </div>
      {review && (
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
            {comments.length === 0 && <p className="text-[12.5px] text-dim">No feedback yet. Be the first.</p>}
            {comments.map((c) => (
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
            <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" className="field mb-2 h-9 w-full px-3" maxLength={60} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Leave a comment…" rows={3} className="field w-full resize-none px-3 py-2" maxLength={2000} />
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
