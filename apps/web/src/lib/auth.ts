import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { ensureUser, getUser, type UserRow } from "@fashion/core";

export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
/** Single-user dev mode never runs in production unless explicitly opted in. */
export const devAuthEnabled = !clerkEnabled && (process.env.NODE_ENV !== "production" || process.env.FASHION_DEV_AUTH === "true");

const DEV_USER = { id: "dev_user", email: "dev@canopy.local", name: "Prateek Devashetti" };
export const GUEST_COOKIE = "fs_guest";

export type SessionUser = UserRow & { guest?: boolean };

const secret = () => process.env.GUEST_SECRET || process.env.CLERK_SECRET_KEY || "fashion-studio-dev-secret";
export const signGuest = (id: string) => `${id}.${crypto.createHmac("sha256", secret()).update(id).digest("base64url").slice(0, 32)}`;
function verifyGuest(token: string | undefined): string | null {
  if (!token) return null;
  const id = token.slice(0, token.lastIndexOf("."));
  return id.startsWith("guest_") && signGuest(id) === token ? id : null;
}

/** Signed-in account (Clerk — the same instance as the Canopy canvas), the local dev user, or null. */
export async function getAccountUser(): Promise<SessionUser | null> {
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

/** Account user, or the signed-out demo guest (tour only — everything else is gated). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const acct = await getAccountUser();
  if (acct) return acct;
  const jar = await cookies();
  const guestId = verifyGuest(jar.get(GUEST_COOKIE)?.value);
  if (!guestId) return null;
  const u = await getUser(guestId);
  return u ? { ...u, guest: true } : null;
}
