"use client";

import { useState } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { useStudio } from "@/lib/store";
import { generate } from "@/lib/actions";
import { CanopyMark, Spinner } from "@/components/ui";
import { pickFiles, useUploader } from "./useUploader";

/** Collage positions sampled from the reference at 1600×900, expressed in viewport percentages. */
const COLLAGE: [string, number, number, number, number][] = [
  ["c3", 234, 189, 283, 112],
  ["c1", 187, 103, 86, 105],
  ["c2", 277, 103, 86, 105],
  ["c4", 187, 252, 100, 123],
  ["c5", 481, 97, 124, 157],
  ["c6", 999, 94, 91, 91],
  ["c13", 962, 157, 54, 55],
  ["c7", 1357, 125, 120, 133],
  ["c9", 1490, 89, 110, 282],
  ["c8", 1167, 266, 310, 198],
  ["c12", 1337, 533, 211, 284],
  ["c13", 1196, 762, 86, 115],
  ["c14", 1285, 762, 93, 115],
  ["c10", 236, 673, 85, 88],
  ["c11", 292, 723, 219, 177],
];

export function Collage({ dim = 0 }: { dim?: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ opacity: 1 - dim }}>
      {COLLAGE.map(([src, x, y, w, h], i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={`/studio/collage/${src}.jpg`}
          alt=""
          className="absolute animate-rise object-cover shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
          style={{ left: `${(x / 1600) * 100}vw`, top: `${(y / 900) * 100}vh`, width: `${(w / 1600) * 100}vw`, height: `${(h / 900) * 100}vh`, animationDelay: `${i * 35}ms` }}
          draggable={false}
        />
      ))}
    </div>
  );
}

function Tile({ label, onFiles }: { label: string; onFiles: (f: File[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      data-dropzone
      className="flex h-[92px] w-[80px] flex-col justify-between rounded-[10px] border border-line-2 bg-[#1a1a1a] p-[10px] text-left transition-colors hover:border-line-3 hover:bg-[#202020] data-[over=true]:border-accent/60"
      data-over={over}
      onClick={async () => {
        const f = await pickFiles();
        if (f.length) onFiles(f);
      }}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = [...e.dataTransfer.files].filter((x) => x.type.startsWith("image/"));
        if (f.length) onFiles(f);
      }}
    >
      <Plus size={14} className="text-dim" />
      <span className="text-[11.5px] font-medium text-fg-2">{label}</span>
    </button>
  );
}

export function EmptyState({ box }: { box: { left: number; top: number; width: number; height: number } }) {
  const upload = useUploader();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const role = useStudio((s) => s.role);

  const startSketch = async (files: File[]) => {
    const out = await upload(files);
    if (!out.length) return;
    const st = useStudio.getState();
    st.openTool("sketch-to-render");
    st.setInput("sketch-to-render", "sketch", out.map((a) => a.id));
  };

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const st = useStudio.getState();
    st.openTool("prompt");
    st.setInput("prompt", "prompt", text);
    await generate("prompt");
    setBusy(false);
  };

  return (
    <>
      <Collage />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_340px_300px_at_50%_52%,rgba(0,0,0,0.98),rgba(0,0,0,0.85)_55%,transparent_100%)]" />
      <div className="fixed z-10 flex flex-col items-center" style={{ left: box.left, width: box.width, top: "36.5vh" }} data-tour="empty">
        <CanopyMark size={30} />
        <h1 className="mt-[14px] text-[24px] font-medium tracking-[-0.01em] text-fg">Fashion Studio</h1>
        <p className="mt-[8px] text-[12.5px] text-dim">Start with a sketch, reference, or prompt of your idea.</p>
        {role !== "viewer" && (
          <div className="mt-[24px] flex items-stretch gap-[7px]">
            <Tile label="Sketch" onFiles={startSketch} />
            <Tile label="Image" onFiles={(f) => void upload(f)} />
            <div className="flex h-[92px] w-[346px] flex-col rounded-[10px] border border-line-2 bg-[#1a1a1a] p-[10px] focus-within:border-line-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Describe a look, campaign, or product image.."
                className="flex-1 resize-none bg-transparent pt-[42px] text-[12.5px] leading-[1.4] text-fg outline-none placeholder:text-mute focus:pt-0"
              />
              <button aria-label="Generate" disabled={!text.trim() || busy} className="absolute self-end" style={{ marginTop: 52 }} onClick={() => void submit()}>
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#3a3a3a] text-fg hover:bg-[#4a4a4a]">{busy ? <Spinner size={13} /> : <ArrowUp size={16} />}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
