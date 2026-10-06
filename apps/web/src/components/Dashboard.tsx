"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ellipsis, Plus, Search, Settings } from "lucide-react";
import { api, timeAgo, type ProjectDTO } from "@/lib/api";
import { CanopyMark, ConfirmProvider, Popover, Spinner, useConfirm, cn } from "@/components/ui";
import { UserMenu } from "./UserMenu";

function StudioCard() {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="group relative w-full max-w-[420px] overflow-hidden rounded-[16px] border border-line bg-panel">
      <button className="block w-full text-left" onClick={() => (setBusy(true), router.push("/studio"))} aria-label="Open Fashion Studio">
        <div className="relative h-[210px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/hero.jpg" alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <span className="absolute bottom-4 left-5 font-serif text-[30px] text-white italic">Fashion Studio</span>
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Spinner size={20} />
            </span>
          )}
        </div>
        <div className="px-5 pt-3.5 pb-5">
          <p className="text-[13px] leading-[1.5] text-dim">Turn sketches into renders, swap colors and garments, and review everything in one feed.</p>
        </div>
      </button>
      <button ref={ref} aria-label="Fashion Studio options" className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75" onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={16} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" className="w-[200px]">
        <button className="menu-item" onClick={() => router.push("/studio")}>
          Open last edited
        </button>
        <button className="menu-item" onClick={() => router.push("/studio?new=1")}>
          New project
        </button>
      </Popover>
    </div>
  );
}

function ProjectCard({ p, onRename, onDelete }: { p: ProjectDTO; onRename: (p: ProjectDTO) => void; onDelete: (p: ProjectDTO) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="group relative">
      <Link href={`/studio/${p.id}`} className="block overflow-hidden rounded-[12px] border border-line bg-panel transition-colors hover:border-line-3">
        <div className="aspect-[4/3] overflow-hidden bg-[#161616]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.cover ? <img src={p.cover} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-faint"><CanopyMark size={26} className="opacity-25" /></div>}
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-fg">{p.name}</div>
            <div className="text-[11.5px] text-mute">Edited {timeAgo(p.lastOpenedAt).toLowerCase()}</div>
          </div>
          <span className="rounded-[5px] bg-accent-bg px-1.5 py-0.5 text-[10.5px] font-medium text-accent-fg">Studio</span>
          {p.shared && <span className="rounded-[5px] bg-[#232323] px-1.5 py-0.5 text-[10.5px] text-dim">Shared</span>}
        </div>
      </Link>
      {!p.shared && (
        <>
          <button ref={ref} aria-label="Project options" className="absolute top-2 right-2 hidden h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex" onClick={() => setOpen(true)}>
            <Ellipsis size={14} />
          </button>
          <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" className="w-[170px]">
            <button className="menu-item" onClick={() => (setOpen(false), onRename(p))}>
              Rename
            </button>
            <button className="menu-item text-danger hover:text-danger" onClick={() => (setOpen(false), onDelete(p))}>
              Delete
            </button>
          </Popover>
        </>
      )}
    </div>
  );
}

function Inner({ user, initial }: { user: { name: string; email: string; credits: number }; initial: ProjectDTO[] }) {
  const [tab, setTab] = useState<"studios" | "projects">("studios");
  const [projects, setProjects] = useState(initial);
  const [q, setQ] = useState("");
  const confirm = useConfirm();
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => api.projects(q).then((r) => setProjects(r.projects)).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);
  const rename = async (p: ProjectDTO) => {
    const name = window.prompt("Rename project", p.name);
    if (!name?.trim()) return;
    await api.renameProject(p.id, name);
    setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, name } : x)));
  };
  const del = async (p: ProjectDTO) => {
    if (!(await confirm({ title: `Delete “${p.name}”?`, body: "Every run and result in it will be removed. This can't be undone.", confirm: "Delete", danger: true }))) return;
    await api.deleteProject(p.id);
    setProjects((ps) => ps.filter((x) => x.id !== p.id));
  };
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-6 border-b border-line bg-black/80 px-6 backdrop-blur">
        <Link href="/" className="flex items-center gap-2.5">
          <CanopyMark size={22} />
          <span className="text-[14px] font-medium">Canopy</span>
        </Link>
        <nav className="flex gap-1">
          {(["studios", "projects"] as const).map((t) => (
            <button key={t} className={cn("rounded-[8px] px-3 py-1.5 text-[13px] capitalize", tab === t ? "bg-[#1f1f1f] text-fg" : "text-dim hover:text-fg")} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-dim">{user.credits} credits</span>
          <Link href="/settings" aria-label="Settings" className="icon-btn">
            <Settings size={16} />
          </Link>
          <UserMenu name={user.name} email={user.email} />
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-10">
        {tab === "studios" ? (
          <>
            <h1 className="mb-1 text-[22px] font-medium">Studios</h1>
            <p className="mb-6 text-[13.5px] text-dim">Focused creative environments built on top of the Canopy canvas.</p>
            <StudioCard />
            {projects.length > 0 && (
              <>
                <div className="mt-12 mb-4 flex items-center justify-between">
                  <h2 className="text-[15px] font-medium">Recent studio projects</h2>
                  <button className="text-[12.5px] text-dim hover:text-fg" onClick={() => setTab("projects")}>
                    View all
                  </button>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {projects.slice(0, 8).map((p) => (
                    <ProjectCard key={p.id} p={p} onRename={rename} onDelete={del} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <h1 className="text-[22px] font-medium">Projects</h1>
              <div className="ml-auto flex h-9 w-[260px] items-center gap-2 rounded-[10px] border border-line-2 bg-[#141414] px-3">
                <Search size={14} className="text-dim" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute" />
              </div>
              <button className="btn-white h-9" onClick={() => router.push("/studio?new=1")}>
                <Plus size={14} /> New project
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="py-20 text-center text-[13.5px] text-dim">{q ? "No projects match." : "No projects yet — open Fashion Studio to start one."}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {projects.map((p) => (
                  <ProjectCard key={p.id} p={p} onRename={rename} onDelete={del} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export function Dashboard(props: { user: { name: string; email: string; credits: number }; initial: ProjectDTO[] }) {
  return (
    <ConfirmProvider>
      <Inner {...props} />
    </ConfirmProvider>
  );
}
