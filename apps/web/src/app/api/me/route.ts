import { MODELS, updateUserSettings, type ModelId } from "@fashion/core";
import { body, json, route } from "@/lib/http";
import { withSpendableCredits } from "@/lib/auth";

export const dynamic = "force-dynamic";

const me = (u: { guest?: boolean; platformWallet?: boolean; unlimitedCredits?: boolean; id: string; email: string; name: string; imageUrl: string | null; credits: number; onboarded: boolean; settings: { disabledModels?: string[] } }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  imageUrl: u.imageUrl,
  credits: u.credits,
  platformWallet: Boolean(u.platformWallet),
  unlimitedCredits: Boolean(u.unlimitedCredits),
  onboarded: u.onboarded,
  disabledModels: u.settings?.disabledModels ?? [],
  guest: Boolean(u.guest),
});

export const GET = route(async (_req, user) => json(me(await withSpendableCredits(user))), { guests: true });

export const PATCH = route(async (req, user) => {
  const b = await body<{ onboarded?: boolean; disabledModels?: string[] }>(req);
  const disabled = Array.isArray(b.disabledModels) ? b.disabledModels.filter((m): m is ModelId => typeof m === "string" && m in MODELS) : undefined;
  const u = await updateUserSettings(user.id, { onboarded: typeof b.onboarded === "boolean" ? b.onboarded : undefined, disabledModels: disabled });
  return json(me(await withSpendableCredits({ ...u!, guest: user.guest })));
}, { guests: true });
