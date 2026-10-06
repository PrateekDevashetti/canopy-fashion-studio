import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ledger } from "@fashion/core";
import { getAccountUser } from "@/lib/auth";
import { SettingsView } from "@/components/SettingsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace settings" };

export default async function SettingsPage() {
  const user = await getAccountUser();
  if (!user) redirect("/sign-in?redirect_url=/settings");
  return (
    <SettingsView
      user={{ name: user.name, email: user.email, credits: user.credits, disabledModels: user.settings?.disabledModels ?? [] }}
      ledger={await ledger(user.id)}
    />
  );
}
