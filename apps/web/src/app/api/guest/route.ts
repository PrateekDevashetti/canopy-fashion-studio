import { NextResponse } from "next/server";
import { createProject, ensureUser, listProjects } from "@fashion/core";
import { customAlphabet } from "nanoid";
import { getAccountUser, getSessionUser, GUEST_COOKIE, signGuest } from "@/lib/auth";

export const dynamic = "force-dynamic";

const gid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 18);

/** Signed-out "Try Fashion Studio": a guest workspace that can take the tour; real actions ask to sign up. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (await getAccountUser()) return NextResponse.redirect(new URL("/studio", origin));
  const existing = await getSessionUser();
  if (existing?.guest) {
    const [p] = await listProjects(existing.id);
    const id = p?.id ?? (await createProject(existing.id, "Fashion Studio tour")).id;
    return NextResponse.redirect(new URL(`/studio/${id}`, origin));
  }
  const id = `guest_${gid()}`;
  await ensureUser(id, { name: "Guest" });
  const project = await createProject(id, "Fashion Studio tour");
  const res = NextResponse.redirect(new URL(`/studio/${project.id}`, origin));
  res.cookies.set(GUEST_COOKIE, signGuest(id), { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 14 });
  return res;
}
