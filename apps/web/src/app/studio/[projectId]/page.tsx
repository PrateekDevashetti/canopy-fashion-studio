import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { projectRole } from "@fashion/core";
import { getSessionUser } from "@/lib/auth";
import { Studio } from "@/components/studio/Studio";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  const user = await getSessionUser();
  const r = user ? await projectRole(projectId, user.id) : null;
  return { title: r?.project.name ?? "Fashion Studio" };
}

export default async function StudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?redirect_url=/studio/${projectId}`);
  const r = await projectRole(projectId, user.id);
  if (!r) notFound();
  return <Studio projectId={projectId} />;
}
