import "server-only";
import { NextResponse } from "next/server";
import { clientIp, HttpError, rateLimit, type LimitName } from "@fashion/core";
import { getSessionUser, type SessionUser } from "./auth";

export const json = (data: unknown, init?: number | ResponseInit) => NextResponse.json(data, typeof init === "number" ? { status: init } : init);

/** Structured security event (auth failures, blocked origins, rate limits). No secrets or bodies. */
export function securityEvent(event: string, req: Request, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ level: "security", event, method: req.method, path: new URL(req.url).pathname, ip: clientIp(req), ...extra }));
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense in depth (session cookies are SameSite=Lax already): a mutating request that
 * carries an Origin header must come from this app's own origin.
 */
export function sameOrigin(req: Request): boolean {
  if (!MUTATING.has(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers / server-to-server
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Wrap an authenticated route: resolves the user, enforces origin + rate limits, and maps errors to JSON responses. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: (req: Request, user: SessionUser, ctx: C) => Promise<Response>, opts: { guests?: boolean; limit?: LimitName } = {}) {
  return async (req: Request, ctx: C) => {
    try {
      if (!sameOrigin(req)) {
        securityEvent("cross_origin_blocked", req, { origin: req.headers.get("origin") });
        return json({ error: "Cross-origin request blocked" }, 403);
      }
      const user = await getSessionUser();
      if (!user) return json({ error: "Sign in to continue" }, 401);
      // Signed-out demo guests can take the tour; anything real asks them to sign up.
      if (user.guest && !opts.guests) return json({ error: "Sign up to try out Fashion Studio!", code: "SIGNUP_REQUIRED" }, 403);
      if (opts.limit && MUTATING.has(req.method)) {
        const rl = await rateLimit(opts.limit, user.id);
        if (!rl.ok) {
          securityEvent("rate_limited", req, { limit: opts.limit, user: user.id });
          return json({ error: "You're going a little fast — try again in a moment." }, { status: 429, headers: { "retry-after": String(rl.retryAfter) } });
        }
      }
      return await handler(req, user, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 403) securityEvent("forbidden", req, { reason: e.message.slice(0, 80) });
        return json({ error: e.message }, e.status);
      }
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
