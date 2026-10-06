import "server-only";
import { ensureUser, type UserRow } from "@fashion/core";

export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
/** Single-user dev mode never runs in production unless explicitly opted in. */
export const devAuthEnabled = !clerkEnabled && (process.env.NODE_ENV !== "production" || process.env.FASHION_DEV_AUTH === "true");

const DEV_USER = { id: "dev_user", email: "dev@canopy.local", name: "Prateek Devashetti" };

export type SessionUser = UserRow;

/** The signed-in user (Clerk — the same instance as the Canopy canvas), or the local dev user. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!clerkEnabled) {
    if (!devAuthEnabled) return null;
    return ensureUser(DEV_USER.id, DEV_USER);
  }
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return null;
  const u = await currentUser();
  const email = u?.primaryEmailAddress?.emailAddress ?? "";
  const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || email.split("@")[0] || "";
  return ensureUser(userId, { email, name, imageUrl: u?.imageUrl ?? null });
}
