"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { api, bytes } from "@/lib/api";
import { useStudio } from "@/lib/store";
import { downloadAsset } from "@/lib/actions";
import { Spinner } from "@/components/ui";

type Info = Awaited<ReturnType<typeof api.asset>>;

export function DetailsPanel() {
  const s = useStudio();
  const id = s.view === "feed" ? (s.selectedIds[0] ?? s.activeId) : s.activeId;
  const a = s.asset(id);
  const [info, setInfo] = useState<Info | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    setInfo(null);
    if (!a) return;
    setName(a.name);
    let off = false;
    api
      .asset(a.id)
      .then((r) => !off && setInfo(r))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: [string, string][] = a
    ? [
        ["Type", `${a.media === "video" ? "Video" : "Image"} · ${a.mime.split("/")[1]?.toUpperCase()}`],
        ["Resolution", a.width ? `${a.width} × ${a.height}` : "—"],
        ["File size", bytes(a.bytes)],
        ["Model", info?.run?.model || (info ? "—" : "…")],
        ["Generation time", info?.run?.durationMs != null ? `${(info.run.durationMs / 1000).toFixed(1)}s` : info ? "—" : "…"],
        ["Created", new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })],
      ]
    : [];

  return (
    <aside className="fixed top-[64px] right-[10px] bottom-[8px] z-40 flex w-[266px] animate-fade-in flex-col rounded-[13px] border border-line bg-panel shadow-2xl">
      <header className="mx-[10px] flex items-center gap-2 border-b border-line-2 py-[12px]">
        <h2 className="flex-1 text-[13px] font-medium">Details</h2>
        <button aria-label="Close details" className="-mr-1 flex h-7 w-7 items-center justify-center rounded-[8px] text-dim hover:bg-hover hover:text-fg" onClick={() => s.set({ infoOpen: false })}>
          <X size={15} />
        </button>
      </header>
      {!a ? (
        <p className="p-4 text-[12.5px] text-dim">Select a result to see its details.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-[12px]">
          <div className="mb-3 overflow-hidden rounded-[9px] border border-line-2 bg-[#1b1b1b]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.poster ?? a.url} alt="" className="max-h-[220px] w-full object-contain" />
          </div>
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] text-mute">Name</span>
            <input
              value={name}
              disabled={s.role === "viewer"}
              onChange={(e) => setName(e.target.value)}
              onBlur={async () => {
                if (!name.trim() || name === a.name) return setName(a.name);
                try {
                  const { asset } = await api.renameAsset(a.id, name);
                  useStudio.setState((x) => ({ runs: x.runs.map((r) => ({ ...r, outputs: r.outputs.map((o) => (o.id === asset.id ? { ...o, name: asset.name } : o)) })) }));
                } catch (e) {
                  s.toast((e as Error).message, "error");
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="field h-8 w-full px-2.5 text-[12.5px]"
            />
          </label>
          <dl className="flex flex-col gap-2.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-[11.5px] text-mute">{k}</dt>
                <dd className="truncate text-right text-[12px] text-fg-2">{v === "…" ? <Spinner size={11} /> : v}</dd>
              </div>
            ))}
          </dl>
          {info?.run?.inputs && typeof (info.run.inputs as Record<string, unknown>).prompt === "string" && (
            <div className="mt-3 rounded-[8px] bg-[#1b1b1b] p-2.5 text-[11.5px] leading-[1.45] text-dim">{String((info.run.inputs as Record<string, unknown>).prompt)}</div>
          )}
          <button className="btn mt-auto w-full" onClick={() => downloadAsset(a)}>
            <Download size={13} /> Download
          </button>
        </div>
      )}
    </aside>
  );
}
