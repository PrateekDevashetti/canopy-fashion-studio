/**
 * Server-side product events → PostHog capture API. Fire-and-forget with a short timeout:
 * analytics must never slow down or fail a request or a generation.
 */
const KEY = () => process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = () => (process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/$/, "");

export function capture(event: string, distinctId: string, properties: Record<string, unknown> = {}) {
  const key = KEY();
  if (!key || process.env.NODE_ENV === "test") return;
  void fetch(`${HOST()}/i/v0/e/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: { ...properties, app: "fashion-studio", source: "server", env: process.env.VERCEL_ENV ?? process.env.NODE_ENV }, timestamp: new Date().toISOString() }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}
