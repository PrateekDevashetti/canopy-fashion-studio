"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, MessageSquareText, ThumbsUp, TriangleAlert, X } from "lucide-react";
import type { InputSpec, Tool } from "@fashion/core/tools";
import { api, type ReviewBoardDTO } from "@/lib/api";
import { useAssets, useStudio } from "@/lib/store";
import { cn, Spinner } from "@/components/ui";
import { ShareForReviewDialog, ShopifyExport } from "./FeedDialogs";

/** Segmented control for `select` inputs. */
export function SelectInput({ tool, spec }: { tool: Tool; spec: Extract<InputSpec, { kind: "select" }> }) {
  const value = useStudio((s) => (s.tools[tool.id]?.inputs[spec.key] as string) ?? spec.default);
  const setInput = useStudio((s) => s.setInput);
  return (
    <div className="flex rounded-[9px] border border-line-2 bg-[#1b1b1b] p-[3px]" role="radiogroup" aria-label={spec.label}>
      {spec.options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={cn("h-[28px] flex-1 rounded-[7px] px-2 text-[12px] transition-colors", value === o.value ? "bg-[#2e2e2e] text-fg" : "text-dim hover:text-fg")}
          onClick={() => setInput(tool.id, spec.key, o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The looks a panel tool acts on: the feed selection, else the image open in the editor. */
function useTargetIds() {
  const selected = useStudio((s) => s.selectedIds);
  const activeId = useStudio((s) => s.activeId);
  return selected.length ? selected : activeId && !activeId.startsWith("pending:") ? [activeId] : [];
}

function Targets({ ids }: { ids: string[] }) {
  const assets = useAssets();
  const list = assets.filter((a) => ids.includes(a.id));
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.slice(0, 8).map((a) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={a.id} src={a.poster ?? a.url} alt={a.name} className="h-[52px] w-[52px] rounded-[8px] border border-line-2 object-cover" />
      ))}
      {list.length > 8 && <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[8px] bg-[#1f1f1f] text-[12px] text-dim">+{list.length - 8}</span>}
    </div>
  );
}

export function ReviewPanel() {
  const project = useStudio((s) => s.project);
  const set = useStudio((s) => s.set);
  const toast = useStudio((s) => s.toast);
  const ids = useTargetIds();
  const [boards, setBoards] = useState<ReviewBoardDTO[] | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => {
    if (project) api.reviews(project.id).then((r) => setBoards(r.boards)).catch(() => setBoards([]));
  }, [project]);
  useEffect(load, [load]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label mb-[9px]">Looks to review</div>
        {ids.length ? (
          <>
            <Targets ids={ids} />
            <button className="btn-accent mt-3 w-full" onClick={() => setOpen(true)}>
              Share {ids.length} look{ids.length === 1 ? "" : "s"} for review
            </button>
          </>
        ) : (
          <div className="rounded-[10px] border border-dashed border-line-2 p-3 text-[12px] leading-[1.45] text-dim">
            Select looks in the Feed (Shift/⌘-click for several), or open one in the editor.
            <button className="btn mt-2.5 h-8 w-full text-[12px]" onClick={() => set({ view: "feed" })}>
              Go to Feed
            </button>
          </div>
        )}
      </div>
      <div>
        <div className="label mb-[9px]">Review links</div>
        {!boards ? (
          <div className="text-dim">
            <Spinner size={14} />
          </div>
        ) : !boards.length ? (
          <p className="text-[12px] text-mute">No reviews yet. Comments and approvals will show up here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {boards.map((b) => {
              const url = `${origin}/r/${b.token}`;
              return (
                <li key={b.id} className={cn("rounded-[10px] border border-line-2 bg-[#1b1b1b] p-2.5", b.closed && "opacity-55")}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{b.title || `${b.assetIds.length} look${b.assetIds.length === 1 ? "" : "s"}`}</span>
                    <span className="text-[11px] text-mute">{new Date(b.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-dim">
                    <span className="flex items-center gap-1" title="Comments">
                      <MessageSquareText size={12} /> {b.comments}
                    </span>
                    <span className="flex items-center gap-1 text-accent" title="Approvals">
                      <ThumbsUp size={12} /> {b.approvals}
                    </span>
                    {b.changes > 0 && (
                      <span className="flex items-center gap-1 text-[#e8b04b]" title="Changes requested">
                        <TriangleAlert size={12} /> {b.changes}
                      </span>
                    )}
                    {b.closed && <span>Closed</span>}
                  </div>
                  {!b.closed && (
                    <div className="mt-2 flex gap-1.5">
                      <button
                        className="btn h-7 flex-1 text-[11.5px]"
                        onClick={async () => {
                          await navigator.clipboard.writeText(url).catch(() => {});
                          setCopied(b.id);
                          setTimeout(() => setCopied(null), 1500);
                        }}
                      >
                        {copied === b.id ? <Check size={12} /> : <Copy size={12} />} {copied === b.id ? "Copied" : "Copy link"}
                      </button>
                      <a className="btn h-7 px-2 text-[11.5px]" href={url} target="_blank" rel="noreferrer" aria-label="Open review">
                        <ExternalLink size={12} />
                      </a>
                      <button
                        className="btn h-7 px-2 text-[11.5px]"
                        aria-label="Close review link"
                        title="Close link"
                        onClick={async () => {
                          try {
                            await api.closeReview(b.id);
                            load();
                          } catch (e) {
                            toast((e as Error).message, "error");
                          }
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ShareForReviewDialog
        open={open}
        onClose={() => {
          setOpen(false);
          load();
        }}
        ids={ids}
      />
    </div>
  );
}

export function ShopifyPanel() {
  const set = useStudio((s) => s.set);
  const ids = useTargetIds();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label mb-[9px]">Looks to export</div>
        {ids.length ? (
          <Targets ids={ids} />
        ) : (
          <div className="rounded-[10px] border border-dashed border-line-2 p-3 text-[12px] leading-[1.45] text-dim">
            Select the product images in the Feed (packshot, angles, on-model), or open one in the editor.
            <button className="btn mt-2.5 h-8 w-full text-[12px]" onClick={() => set({ view: "feed" })}>
              Go to Feed
            </button>
          </div>
        )}
      </div>
      <div>
        <div className="label mb-[9px]">Shopify</div>
        <ShopifyExport ids={ids} />
      </div>
    </div>
  );
}
