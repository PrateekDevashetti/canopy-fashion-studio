import { MODELS, updateUserSettings, type ModelId } from "@fashion/core";
import { body, json, route } from "@/lib/http";

export const dynamic = "force-dynamic";

const me = (u: { id: string; email: string; name: string; imageUrl: string | null; credits: number; onboarded: boolean; settings: { disabledModels?: string[] } }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  imageUrl: u.imageUrl,
  credits: u.credits,
  onboarded: u.onboarded,
  disabledModels: u.settings?.disabledModels ?? [],
});

export const GET = route(async (_req, user) => json(me(user)));

export const PATCH = route(async (req, user) => {
  const b = await body<{ onboarded?: boolean; disabledModels?: string[] }>(req);
  const disabled = Array.isArray(b.disabledModels) ? b.disabledModels.filter((m): m is ModelId => typeof m === "string" && m in MODELS) : undefined;
  const u = await updateUserSettings(user.id, { onboarded: typeof b.onboarded === "boolean" ? b.onboarded : undefined, disabledModels: disabled });
  return json(me(u!));
});
