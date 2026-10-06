"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MODELS, TOOLS, type ModelId } from "@fashion/core/tools";
import { api, timeAgo } from "@/lib/api";
import { CanopyMark, cn, Spinner } from "@/components/ui";
import { UserMenu } from "./UserMenu";

type Row = { id: string; delta: number; reason: string; createdAt: string };

export function SettingsView({ user, ledger }: { user: { name: string; email: string; credits: number; disabledModels: string[] }; ledger: Row[] }) {
  const [disabled, setDisabled] = useState<string[]>(user.disabledModels);
  const [saving, setSaving] = useState<string | null>(null);
  const toggle = async (m: string) => {
    const next = disabled.includes(m) ? disabled.filter((x) => x !== m) : [...disabled, m];
    setSaving(m);
    try {
      const me = await api.updateMe({ disabledModels: next });
      setDisabled(me.disabledModels);
    } finally {
      setSaving(null);
    }
  };
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex h-[60px] items-center gap-4 border-b border-line px-6">
        <Link href="/studios" className="flex items-center gap-2 text-[13px] text-dim hover:text-fg">
          <ArrowLeft size={14} /> Back
        </Link>
        <CanopyMark size={20} />
        <span className="text-[14px] font-medium">Workspace settings</span>
        <div className="ml-auto">
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="mx-auto flex max-w-[760px] flex-col gap-10 px-6 py-10">
        <section>
          <h2 className="mb-1 text-[16px] font-medium">Account</h2>
          <p className="text-[13px] text-dim">
            {user.name || "—"} · {user.email || "—"}
          </p>
          <p className="mt-1 text-[12px] text-mute">Signed in with your Canopy account — the same login as the Canopy canvas.</p>
        </section>

        <section id="models">
          <h2 className="mb-1 text-[16px] font-medium">Model access</h2>
          <p className="mb-4 text-[13px] text-dim">Choose which models your workspace can use. Tools that rely on a disabled model show a warning and can&apos;t generate.</p>
          <div className="overflow-hidden rounded-[12px] border border-line">
            {(Object.keys(MODELS) as ModelId[]).map((m, i) => {
              const off = disabled.includes(m);
              const users = TOOLS.filter((t) => t.models.includes(m)).map((t) => t.name);
              return (
                <div key={m} className={cn("flex items-center gap-4 bg-panel px-4 py-3", i && "border-t border-line")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] text-fg">{MODELS[m].label}</div>
                    <div className="text-[11.5px] text-mute">{MODELS[m].why} {users.length ? `Used by ${users.join(", ")}.` : MODELS[m].kind === "matting" ? "Used by Remove background." : "Used by editor tools."}</div>
                  </div>
                  {saving === m && <Spinner size={13} />}
                  <button role="switch" aria-checked={!off} aria-label={`Enable ${MODELS[m].label}`} className={cn("relative h-[20px] w-[34px] rounded-full transition-colors", off ? "bg-[#3a3a3a]" : "bg-accent")} onClick={() => void toggle(m)}>
                    <span className={cn("absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all", off ? "left-[2px]" : "left-[16px]")} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="mb-1 text-[16px] font-medium">Credits</h2>
              <p className="text-[13px] text-dim">Every generation shows its cost before you run it. Failed generations are refunded automatically.</p>
            </div>
            <div className="text-right">
              <div className="text-[26px] font-medium">{user.credits}</div>
              <div className="text-[11.5px] text-mute">credits left</div>
            </div>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-line">
            {ledger.length === 0 && <p className="bg-panel px-4 py-6 text-center text-[13px] text-dim">No activity yet.</p>}
            {ledger.map((r, i) => (
              <div key={r.id} className={cn("flex items-center gap-4 bg-panel px-4 py-2.5 text-[13px]", i && "border-t border-line")}>
                <span className="flex-1 capitalize text-fg-2">{r.reason}</span>
                <span className="text-[12px] text-mute">{timeAgo(r.createdAt)}</span>
                <span className={cn("w-14 text-right font-mono", r.delta >= 0 ? "text-accent-fg" : "text-fg-2")}>
                  {r.delta > 0 ? "+" : ""}
                  {r.delta}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-mute">
            Need more credits? <a className="underline hover:text-fg" href="mailto:hello@trycanopy.space?subject=Fashion%20Studio%20credits">Contact us</a>.
          </p>
        </section>
      </main>
    </div>
  );
}
