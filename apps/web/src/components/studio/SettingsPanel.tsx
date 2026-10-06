"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, ChevronDown, Info, RectangleHorizontal, TriangleAlert, X } from "lucide-react";
import { runCost, toolById, type InputSpec, type Tool } from "@fashion/core/tools";
import { useStudio, isPending } from "@/lib/store";
import { blockedModelsFor, generate } from "@/lib/actions";
import { cn, Popover, Spinner, Tip } from "@/components/ui";
import { ImageInput, MaskInput, ColorInput } from "./Inputs";

function Label({ spec, optional }: { spec: InputSpec; optional?: boolean }) {
  return (
    <div className="mb-[9px] flex items-center justify-between">
      <span className="label">
        {spec.label}
        {"info" in spec && spec.info && (
          <Tip label={spec.info} side="top">
            <Info size={11} className="text-mute" />
          </Tip>
        )}
      </span>
      {optional && <span className="text-[11px] text-mute">Optional</span>}
    </div>
  );
}

function TextInput({ tool, spec }: { tool: Tool; spec: Extract<InputSpec, { kind: "text" }> }) {
  const value = useStudio((s) => (s.tools[tool.id]?.inputs[spec.key] as string) ?? "");
  const setInput = useStudio((s) => s.setInput);
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setInput(tool.id, spec.key, e.target.value)}
        placeholder={spec.examples?.[0] ?? spec.placeholder}
        rows={spec.rows ?? 4}
        className="field w-full resize-y px-3 py-2.5 leading-[1.45]"
      />
      {spec.examples && spec.examples.length > 0 && (
        <div className="mt-1">
          <div className="mb-1.5 text-[11.5px] text-mute">Try an example</div>
          <div className="flex flex-wrap gap-1.5">
            {spec.examples.map((ex) => (
              <button key={ex} className="max-w-full truncate rounded-[8px] border border-line-2 bg-[#1b1b1b] px-2.5 py-1.5 text-left text-[12px] text-fg-2 hover:border-line-3 hover:text-fg" onClick={() => setInput(tool.id, spec.key, ex)} title={ex}>
                {ex.length > 34 ? `${ex.slice(0, 32)}…` : ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Prompt tool: one composer box with references and a submit arrow. */
function PromptComposer({ tool }: { tool: Tool }) {
  const ts = useStudio((s) => s.tools[tool.id]);
  const setInput = useStudio((s) => s.setInput);
  const asset = useStudio((s) => s.asset);
  const value = (ts?.inputs.prompt as string) ?? "";
  const refs = (ts?.inputs.references as string[]) ?? [];
  const spec = tool.inputs[0] as Extract<InputSpec, { kind: "text" }>;
  const example = spec.placeholder.replace(/^Try "|"$/g, "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-[12px] border border-line-2 bg-[#1b1b1b] p-3 focus-within:border-line-3">
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setInput(tool.id, "prompt", e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Tab" && !value) {
              e.preventDefault();
              setInput(tool.id, "prompt", example);
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              setBusy(true);
              await generate(tool.id);
              setBusy(false);
            }
          }}
          rows={4}
          className="w-full resize-none bg-transparent text-[13px] leading-[1.45] text-fg outline-none placeholder:text-transparent"
          aria-label="Prompt"
        />
        {!value && (
          <div className="pointer-events-none absolute inset-0 text-[13px] leading-[1.45] text-mute">
            {spec.placeholder} <span className="kbd ml-0.5 align-middle">tab</span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <ImageInput tool={tool} spec={tool.inputs[1] as Extract<InputSpec, { kind: "image" }>} compact />
        {refs.slice(0, 3).map((id) => {
          const a = asset(id);
          return a ? (
            <div key={id} className="group relative h-[44px] w-[44px] overflow-hidden rounded-[8px] border border-line-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.poster ?? a.url} alt="" className="h-full w-full object-cover" />
              <button aria-label="Remove reference" className="absolute top-0.5 right-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 group-hover:flex" onClick={() => setInput(tool.id, "references", refs.filter((r) => r !== id))}>
                <X size={10} />
              </button>
            </div>
          ) : null;
        })}
        <button
          aria-label="Generate"
          disabled={!value.trim() || busy}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#3a3a3a] text-fg transition-colors enabled:hover:bg-[#4a4a4a] disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            await generate(tool.id);
            setBusy(false);
          }}
        >
          {busy ? <Spinner size={15} /> : <ArrowUp size={18} />}
        </button>
      </div>
    </div>
  );
}

function SelectMenu({ value, options, onChange, icon, label }: { value: string; options: string[]; onChange: (v: string) => void; icon?: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} aria-label={label} className="field flex h-[34px] w-full items-center gap-2 px-2.5 text-[13px] hover:border-line-3" onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="flex-1 text-left">{value}</span>
        <ChevronDown size={13} className="text-dim" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="top-start" matchWidth className="max-h-[300px] min-w-0 overflow-y-auto">
        {options.map((o) => (
          <button key={o} className={cn("menu-item", o === value && "bg-hover text-fg")} onClick={() => (onChange(o), setOpen(false))}>
            {o}
          </button>
        ))}
      </Popover>
    </>
  );
}

const AspectIcon = ({ aspect }: { aspect: string }) => {
  if (aspect === "Auto") return <RectangleHorizontal size={14} className="text-dim" />;
  const [w, h] = aspect.split(":").map(Number);
  const s = 12 / Math.max(w, h);
  return <span className="inline-block rounded-[2px] bg-fg-2" style={{ width: Math.max(4, w * s), height: Math.max(4, h * s) }} />;
};

export function SettingsPanel() {
  const toolId = useStudio((s) => s.toolId)!;
  const tool = toolById(toolId)!;
  const ts = useStudio((s) => s.tools[toolId]);
  const openTool = useStudio((s) => s.openTool);
  const setSetting = useStudio((s) => s.setToolSetting);
  const pending = useStudio((s) => s.runs.filter((r) => r.tool === toolId && isPending(r)).length);
  const credits = useStudio((s) => s.me?.credits ?? 0);
  const disabledModels = useStudio((s) => s.me?.disabledModels);
  const [busy, setBusy] = useState(false);
  const blocked = useMemo(() => blockedModelsFor(toolId), [toolId, disabledModels]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tool) return null;
  const resolution = ts?.resolution ?? tool.resolutions[0];
  const aspect = ts?.aspect ?? tool.defaultAspect;
  const cost = runCost(tool, ts?.inputs ?? {}, resolution);
  const isPrompt = tool.id === "prompt";

  return (
    <aside className="fixed top-[64px] right-[10px] bottom-[8px] z-20 flex w-[266px] animate-fade-in flex-col rounded-[13px] border border-line bg-panel" data-tour="settings">
      <header className="mx-[10px] flex items-start gap-2 border-b border-line-2 pt-[12px] pb-[11px]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium text-fg">{tool.name}</h2>
          <p className="mt-[3px] text-[11px] leading-[1.4] text-dim">{tool.description}</p>
        </div>
        <button aria-label="Close tool" className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-dim hover:bg-hover hover:text-fg" onClick={() => openTool(null)}>
          <X size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[13px] pt-[14px] pb-4">
        {isPrompt ? (
          <PromptComposer tool={tool} />
        ) : (
          <div className="flex flex-col">
            {tool.inputs.map((spec, i) => (
              <div key={spec.key} className={cn("pb-[14px]", i < tool.inputs.length - 1 && spec.kind === "image" && "mb-[14px] border-b border-line-2")}>
                <Label spec={spec} optional={"optional" in spec && spec.optional} />
                {spec.kind === "image" && <ImageInput tool={tool} spec={spec} />}
                {spec.kind === "mask" && <MaskInput tool={tool} spec={spec} />}
                {spec.kind === "text" && <TextInput tool={tool} spec={spec} />}
                {spec.kind === "color" && <ColorInput tool={tool} spec={spec} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="mx-[10px] border-t border-line-2 pt-[12px] pb-[10px]">
        <div className="grid grid-cols-2 gap-[10px]">
          <div>
            <div className="label mb-[7px]">
              Resolution
              <Tip label="Output size. 4K costs 2× credits." side="top">
                <Info size={11} className="text-mute" />
              </Tip>
            </div>
            <SelectMenu label="Resolution" value={resolution} options={tool.resolutions} onChange={(v) => setSetting(tool.id, { resolution: v })} />
          </div>
          <div>
            <div className="label mb-[7px]">
              Aspect Ratio
              <Tip label="Auto keeps the input's shape." side="top">
                <Info size={11} className="text-mute" />
              </Tip>
            </div>
            <SelectMenu label="Aspect ratio" value={aspect} options={tool.aspects} icon={<AspectIcon aspect={aspect} />} onChange={(v) => setSetting(tool.id, { aspect: v })} />
          </div>
        </div>

        {blocked.length > 0 && (
          <div className="mt-[14px] rounded-[10px] border border-danger-line bg-danger-bg p-3">
            <div className="flex gap-2">
              <TriangleAlert size={14} className="mt-[1px] shrink-0 text-danger" />
              <p className="text-[11.5px] leading-[1.45] text-[#f1d6d6]">Models used in this tool are blocked for this workspace: {blocked.join(", ")}</p>
            </div>
            <Link href="/settings#models" className="btn mt-2.5 ml-[22px] h-7 text-[11.5px]">
              Open model access settings
            </Link>
          </div>
        )}

        {pending > 0 && <div className="mt-[12px] text-center text-[11px] text-fg-2">{pending} generating…</div>}
        {!isPrompt && (
          <button
            data-tour="generate"
            className="btn-accent mt-[10px] w-full"
            disabled={busy || blocked.length > 0 || credits < cost}
            onClick={async () => {
              setBusy(true);
              await generate(tool.id);
              setBusy(false);
            }}
          >
            {busy ? <Spinner size={15} /> : "Generate"}
            {!busy && <span className="text-[11.5px] font-normal opacity-60">· {cost} credits</span>}
          </button>
        )}
        {credits < cost && (
          <p className="mt-2 text-center text-[11px] text-danger">
            Not enough credits ({credits} left).{" "}
            <Link href="/settings" className="underline">
              Get more
            </Link>
          </p>
        )}
      </footer>
    </aside>
  );
}

