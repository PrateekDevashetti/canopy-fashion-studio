import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { claimGuest } from "@fashion/core";
import { getAccountUser, GUEST_COOKIE, signGuest } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** After sign-up from the demo: carry the guest's tour project over to the new account. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const user = await getAccountUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?redirect_url=/api/guest/claim", origin));
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  let projectId: string | null = null;
  if (token) {
    const id = token.slice(0, token.lastIndexOf("."));
    if (signGuest(id) === token) projectId = await claimGuest(id, user.id);
  }
  const res = NextResponse.redirect(new URL(projectId ? `/studio/${projectId}` : "/studio", origin));
  res.cookies.delete(GUEST_COOKIE);
  return res;
}
