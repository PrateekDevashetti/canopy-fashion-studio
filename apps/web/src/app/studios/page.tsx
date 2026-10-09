import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listProjects } from "@fashion/core";
import { getAccountUser, withSpendableCredits } from "@/lib/auth";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Studios" };

export default async function StudiosPage() {
  const user = await getAccountUser();
  if (!user) redirect("/sign-in?redirect_url=/studios");
  const [projects, spending] = await Promise.all([listProjects(user.id), withSpendableCredits(user)]);
  return <Dashboard user={{ name: user.name, email: user.email, credits: spending.credits, unlimitedCredits: spending.unlimitedCredits }} initial={projects} />;
}
