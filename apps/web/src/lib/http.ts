import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "@fashion/core";
import { getSessionUser, type SessionUser } from "./auth";

export const json = (data: unknown, init?: number | ResponseInit) => NextResponse.json(data, typeof init === "number" ? { status: init } : init);

/** Wrap an authenticated route: resolves the user and maps errors to JSON responses. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: (req: Request, user: SessionUser, ctx: C) => Promise<Response>, opts: { guests?: boolean } = {}) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await getSessionUser();
      if (!user) return json({ error: "Sign in to continue" }, 401);
      // Signed-out demo guests can take the tour; anything real asks them to sign up.
      if (user.guest && !opts.guests) return json({ error: "Sign up to try out Fashion Studio!", code: "SIGNUP_REQUIRED" }, 403);
      return await handler(req, user, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}`, e);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Run work after the response — inline engine mode for local dev and as a fallback. */
export function engineMode(): "inline" | "worker" {
  return process.env.FASHION_ENGINE_MODE === "worker" ? "worker" : "inline";
}
