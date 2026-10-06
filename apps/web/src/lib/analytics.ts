"use client";

/**
 * Product analytics → PostHog (capture API, no SDK). Events are fire-and-forget, never block the
 * UI, never include image content or prompts' private data beyond tool ids and counts.
 * Configure with NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");

let distinctId: string | null = null;
let identified = false;
const ANON = "fs_anon_id";

function anonId() {
  try {
    let id = localStorage.getItem(ANON);
    if (!id) {
      id = `anon_${crypto.randomUUID()}`;
      localStorage.setItem(ANON, id);
    }
    return id;
  } catch {
    return "anon_unknown";
  }
}

function send(event: string, properties: Record<string, unknown>) {
  if (!KEY || typeof window === "undefined") return;
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: distinctId ?? anonId(),
    properties: { ...properties, $current_url: location.href, $pathname: location.pathname, $host: location.host, app: "fashion-studio" },
    timestamp: new Date().toISOString(),
  });
  try {
    if (navigator.sendBeacon?.(`${HOST}/i/v0/e/`, new Blob([body], { type: "application/json" }))) return;
  } catch {}
  void fetch(`${HOST}/i/v0/e/`, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
}

/** Attach events to the signed-in user (merges their anonymous history once). */
export function identify(user: { id: string; email?: string; name?: string; guest?: boolean }) {
  if (!KEY || identified === true && distinctId === user.id) return;
  const anon = anonId();
  distinctId = user.id;
  identified = true;
  send("$identify", { $anon_distinct_id: anon, $set: { email: user.email, name: user.name, guest: Boolean(user.guest) } });
}

export function track(event: string, properties: Record<string, unknown> = {}) {
  send(event, properties);
}

export function pageview() {
  send("$pageview", { title: typeof document !== "undefined" ? document.title : "" });
}
