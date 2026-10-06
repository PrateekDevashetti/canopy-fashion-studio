"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { api, type Role } from "@/lib/api";
import { useStudio } from "@/lib/store";
import { Modal, Spinner } from "@/components/ui";

type Members = Awaited<ReturnType<typeof api.members>>;

export function MembersSection() {
  const project = useStudio((s) => s.project)!;
  const toast = useStudio((s) => s.toast);
  const [data, setData] = useState<Members | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.members(project.id).then(setData).catch(() => {});
  }, [project.id]);
  const owner = data?.role === "owner";
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-fg-2">People with access</div>
      {owner && (
        <form
          className="mb-3 flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api.invite(project.id, email, role);
              setData((d) => (d ? { ...d, members: r.members as Members["members"] } : d));
              setEmail("");
              toast("Invite saved — they'll get access when they sign in with that email", "ok");
            } catch (err) {
              toast((err as Error).message, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="teammate@brand.com" className="field h-9 min-w-0 flex-1 px-2.5" />
          <select value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} className="field h-9 px-2 text-[12.5px]">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn-white h-9 px-3" disabled={busy}>
            {busy ? <Spinner size={13} /> : "Invite"}
          </button>
        </form>
      )}
      {!data ? (
        <div className="py-3 text-dim">
          <Spinner size={14} />
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          <li className="flex items-center justify-between rounded-[8px] px-1 py-1.5 text-[12.5px]">
            <span className="text-fg">{data.owner.name || data.owner.email}</span>
            <span className="text-mute">Owner</span>
          </li>
          {data.members.map((m) => (
            <li key={m.email} className="flex items-center gap-2 rounded-[8px] px-1 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate text-fg-2">{m.email}</span>
              {!m.joined && <span className="text-[11px] text-mute">Invited</span>}
              <span className="text-mute">{m.role === "editor" ? "Can edit" : "Can view"}</span>
              {owner && (
                <button
                  aria-label={`Remove ${m.email}`}
                  className="flex h-6 w-6 items-center justify-center rounded-[6px] text-dim hover:bg-hover hover:text-danger"
                  onClick={async () => {
                    const r = await api.removeMember(project.id, m.email);
                    setData((d) => (d ? { ...d, members: r.members as Members["members"] } : d));
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!owner && data && <p className="mt-2 text-[11.5px] text-mute">Only the owner can invite people. Editors can generate with any tool; deleting runs and results is reserved for the owner.</p>}
    </div>
  );
}

export function MembersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Share project">
      <MembersSection />
    </Modal>
  );
}

export function ShareDialog({ open, onClose, assetIds }: { open: boolean; onClose: () => void; assetIds: string[] }) {
  const role = useStudio((s) => s.role as Role);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setUrl(null);
      setCopied(false);
    }
  }, [open]);
  const id = assetIds[0];
  return (
    <Modal open={open} onClose={onClose} title="Share">
      {id && (
        <div className="mb-5">
          <div className="mb-2 text-[12px] font-medium text-fg-2">Public link to this image</div>
          {url ? (
            <div className="flex gap-1.5">
              <input readOnly value={url} className="field h-9 min-w-0 flex-1 px-2.5 font-mono text-[11.5px]" onFocus={(e) => e.target.select()} />
              <button
                className="btn-white h-9 px-3"
                onClick={async () => {
                  await navigator.clipboard.writeText(url).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <button
              className="btn h-9 w-full"
              disabled={busy || role === "viewer"}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api.share(id);
                  setUrl(r.url);
                  await navigator.clipboard.writeText(r.url).catch(() => {});
                  setCopied(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Spinner size={13} /> : <Link2 size={14} />} Create link
            </button>
          )}
          <p className="mt-1.5 text-[11px] text-mute">Anyone with the link can view and download this image. Add “?review=1” to collect comments.</p>
        </div>
      )}
      <MembersSection />
    </Modal>
  );
}
