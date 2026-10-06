import { redirect } from "next/navigation";
import { createProject, openLatestProject } from "@fashion/core";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The Fashion Studio card: most recent project, or a fresh one on first visit. `?new=1` forces a new one. */
export default async function StudioEntry({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?redirect_url=/studio");
  const sp = await searchParams;
  const id = sp.new ? (await createProject(user.id)).id : await openLatestProject(user.id);
  const qs = new URLSearchParams();
  if (sp.tool) qs.set("tool", sp.tool);
  if (sp.view) qs.set("view", sp.view);
  redirect(`/studio/${id}${qs.size ? `?${qs}` : ""}`);
}
