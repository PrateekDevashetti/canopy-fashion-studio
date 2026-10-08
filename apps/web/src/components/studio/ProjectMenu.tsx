"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Ellipsis, FolderInput, FolderPlus, House, Pencil, Plus, Shirt, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { goCanopyHome } from "@/lib/canopy-home";
import { useStudio } from "@/lib/store";
import { track } from "@/lib/analytics";
import { cn, Modal, Popover, Spinner, useConfirm } from "@/components/ui";
import { MembersSection } from "./Dialogs";

const CANVAS_APP = process.env.NEXT_PUBLIC_CANOPY_APP_URL ?? "https://app.trycanopy.space";

function Item({ icon, label, onClick, disabled, trailing }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; trailing?: React.ReactNode }) {
  return (
    <button className="flex h-[44px] w-full items-center gap-3 rounded-[10px] px-2 text-left text-[14px] text-fg hover:bg-[#262626] disabled:opacity-45 disabled:hover:bg-transparent" onClick={onClick} disabled={disabled}>
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[#2a2a2a] text-fg-2">{icon}</span>
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  );
}

function FolderMenu({ anchor, open, onClose }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void }) {
  const project = useStudio((s) => s.project)!;
  const set = useStudio((s) => s.set);
  const toast = useStudio((s) => s.toast);
  const [folders, setFolders] = useState<{ id: string; name: string }[] | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) api.folders().then((r) => setFolders(r.folders)).catch(() => setFolders([]));
  }, [open]);
  const move = async (folderId: string | null) => {
    try {
      await api.moveProject(project.id, folderId);
      set({ project: { ...project, folderId } });
      toast(folderId ? `Moved to ${folders?.find((f) => f.id === folderId)?.name}` : "Moved to All projects", "ok");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} className="w-[240px]">
      <div className="px-2.5 pt-1 pb-1.5 text-[11.5px] text-mute">Move “{project.name}” to</div>
      <button className="menu-item justify-between" onClick={() => void move(null)}>
        All projects {!project.folderId && <Check size={13} />}
      </button>
      {folders === null ? (
        <div className="px-2.5 py-2 text-dim">
          <Spinner size={12} />
        </div>
      ) : (
        folders.map((f) => (
          <button key={f.id} className="menu-item justify-between" onClick={() => void move(f.id)}>
            <span className="truncate">{f.name}</span>
            {project.folderId === f.id && <Check size={13} />}
          </button>
        ))
      )}
      <div className="my-1 h-px bg-line-2" />
      <form
        className="flex items-center gap-1.5 px-1.5 pb-1"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            const { folder } = await api.createFolder(name);
            setFolders((f) => [...(f ?? []), folder]);
            setName("");
            await move(folder.id);
          } catch (err) {
            toast((err as Error).message, "error");
          }
        }}
      >
        <FolderPlus size={13} className="ml-1 shrink-0 text-dim" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder" className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-mute" aria-label="New folder name" />
      </form>
    </Popover>
  );
}

function PreferencesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useStudio((s) => s.project)!;
  const role = useStudio((s) => s.role);
  const set = useStudio((s) => s.set);
  const toast = useStudio((s) => s.toast);
  const confirm = useConfirm();
  const p = project.preferences ?? {};
  const [desc, setDesc] = useState(p.description ?? "");
  const [imgRes, setImgRes] = useState(p.imageResolution ?? "1K");
  const [vidRes, setVidRes] = useState(p.videoResolution ?? "720p");
  const [aspect, setAspect] = useState(p.aspect ?? "Auto");
  const [busy, setBusy] = useState(false);
  const editable = role !== "viewer";
  const Seg = ({ value, options, onChange, label }: { value: string; options: string[]; onChange: (v: string) => void; label: string }) => (
    <div className="flex rounded-[9px] border border-line-2 bg-[#1b1b1b] p-[3px]" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={value === o} disabled={!editable} className={cn("h-7 flex-1 rounded-[7px] text-[12px]", value === o ? "bg-[#2e2e2e] text-fg" : "text-dim hover:text-fg")} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
  return (
    <Modal open={open} onClose={onClose} title="Project preferences" width={480}>
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-dim">Description</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!editable} rows={2} maxLength={500} placeholder="What's this project for? e.g. SS27 denim drop" className="field w-full resize-none px-2.5 py-2" />
        </label>
        <div>
          <span className="mb-1.5 block text-[12px] text-dim">Default image resolution</span>
          <Seg label="Default image resolution" value={imgRes} options={["1K", "2K", "4K"]} onChange={setImgRes} />
        </div>
        <div>
          <span className="mb-1.5 block text-[12px] text-dim">Default video resolution</span>
          <Seg label="Default video resolution" value={vidRes} options={["720p", "1080p"]} onChange={setVidRes} />
        </div>
        <div>
          <span className="mb-1.5 block text-[12px] text-dim">Default aspect ratio</span>
          <Seg label="Default aspect ratio" value={aspect} options={["Auto", "1:1", "4:5", "3:4", "9:16", "16:9"]} onChange={setAspect} />
        </div>
        {editable && (
          <button
            className="btn-white h-9"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api.updatePrefs(project.id, { description: desc, imageResolution: imgRes, videoResolution: vidRes, aspect });
                set({ project: { ...project, preferences: r.preferences } });
                toast("Preferences saved", "ok");
                onClose();
              } catch (e) {
                toast((e as Error).message, "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner size={13} /> : "Save preferences"}
          </button>
        )}
        <div className="h-px bg-line-2" />
        <MembersSection />
        {role === "owner" && (
          <>
            <div className="h-px bg-line-2" />
            <button
              className="btn h-9 border-danger-line text-danger hover:bg-danger-bg"
              onClick={async () => {
                if (!(await confirm({ title: "Delete this project?", body: "Every run and result in it will be removed for everyone. This can't be undone.", confirm: "Delete project", danger: true }))) return;
                await api.deleteProject(project.id);
                goCanopyHome();
              }}
            >
              Delete project
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ProjectMenu() {
  const project = useStudio((s) => s.project)!;
  const role = useStudio((s) => s.role);
  const set = useStudio((s) => s.set);
  const toast = useStudio((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const rename = async () => {
    setRenaming(false);
    const n = name.trim();
    if (!n || n === project.name) return setName(project.name);
    try {
      const r = await api.renameProject(project.id, n);
      set({ project: { ...project, ...r.project } });
    } catch (e) {
      toast((e as Error).message, "error");
      setName(project.name);
    }
  };

  return (
    <div ref={ref} className="flex items-center gap-1.5">
      {renaming ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === "Enter") void rename();
            if (e.key === "Escape") {
              setName(project.name);
              setRenaming(false);
            }
          }}
          className="field h-6 w-[180px] rounded-[6px] px-1.5 text-[13px] font-semibold"
          aria-label="Project name"
        />
      ) : (
        <button className="max-w-[260px] truncate text-[13px] font-semibold text-fg" onDoubleClick={() => role !== "viewer" && setRenaming(true)} onClick={() => setOpen((o) => !o)}>
          {project.name}
        </button>
      )}
      <button aria-label="Project menu" className="flex h-6 w-6 items-center justify-center rounded-[6px] text-dim hover:bg-hover hover:text-fg" onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={15} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} className="w-[300px] rounded-[16px] p-1.5">
        <Item icon={<House size={15} />} label="Back to home" onClick={() => goCanopyHome()} />
        <div className="mx-1 my-1 h-px bg-line-2" />
        <Item
          icon={<Plus size={15} />}
          label="New project"
          onClick={() => {
            track("new_canvas_clicked");
            window.open(CANVAS_APP, "_blank", "noopener");
            setOpen(false);
          }}
        />
        <Item
          icon={<Shirt size={15} />}
          label="New Fashion Studio"
          onClick={async () => {
            setOpen(false);
            const { project: p } = await api.createProject();
            track("project_created");
            router.push(`/studio/${p.id}`);
          }}
        />
        <Item icon={<Pencil size={15} />} label="Rename project" disabled={role === "viewer"} onClick={() => (setOpen(false), setRenaming(true))} />
        <Item icon={<FolderInput size={15} />} label="Move to folder" disabled={role !== "owner"} onClick={() => (setOpen(false), setFolderOpen(true))} trailing={<ChevronRight size={15} className="text-dim" />} />
        <Item icon={<SlidersHorizontal size={15} />} label="Project preferences" onClick={() => (setOpen(false), setPrefs(true))} />
      </Popover>
      <FolderMenu anchor={ref} open={folderOpen} onClose={() => setFolderOpen(false)} />
      <PreferencesDialog open={prefs} onClose={() => setPrefs(false)} />
    </div>
  );
}
