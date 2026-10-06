/**
 * Thin, dependency-free provider clients.
 * - fal.ai: Nano Banana 2 (image gen/edit), BiRefNet (matting), SAM 3 (masks), Veo/Kling (video).
 * - OpenRouter: Gemini 3.6 Flash for vision (garment detection).
 * Every call retries transient failures (429/5xx/network) with backoff.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryable = false,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const falKey = () => {
  const k = process.env.FAL_KEY;
  if (!k) throw new ProviderError("FAL_KEY is not configured", 500);
  return k;
};

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable = e instanceof ProviderError ? e.retryable : true;
      if (!retryable || i === tries - 1) break;
      await sleep(1500 * (i + 1) + Math.random() * 500);
    }
  }
  throw last;
}

async function readError(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    const d = j.detail ?? j.error ?? j.message;
    return typeof d === "string" ? d : JSON.stringify(d).slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/** Synchronous fal call (fine for image models that finish in < 60s). */
export async function falRun<T = Record<string, unknown>>(endpoint: string, input: Record<string, unknown>, timeoutMs = 180_000): Promise<T> {
  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`https://fal.run/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Key ${falKey()}`, "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const msg = await readError(res);
        throw new ProviderError(`${endpoint}: ${msg || res.statusText}`, res.status, res.status === 429 || res.status >= 500);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(`${endpoint}: ${(e as Error).message}`, 0, true);
    } finally {
      clearTimeout(timer);
    }
  });
}

export type QueueRef = { endpoint: string; requestId: string; statusUrl: string; responseUrl: string };

/** Submit a long job (video) to the fal queue. */
export async function falSubmit(endpoint: string, input: Record<string, unknown>): Promise<QueueRef> {
  return withRetry(async () => {
    const res = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Key ${falKey()}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new ProviderError(`${endpoint}: ${await readError(res)}`, res.status, res.status === 429 || res.status >= 500);
    const j = (await res.json()) as { request_id: string; status_url: string; response_url: string };
    return { endpoint, requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
  });
}

/** Poll a queued fal job until it completes (or the deadline passes). */
export async function falWait<T = Record<string, unknown>>(ref: QueueRef, deadlineMs = 15 * 60_000): Promise<T> {
  const until = Date.now() + deadlineMs;
  let delay = 3000;
  while (Date.now() < until) {
    const res = await fetch(ref.statusUrl, { headers: { Authorization: `Key ${falKey()}` } }).catch(() => null);
    if (res?.ok) {
      const s = (await res.json()) as { status: string; error?: string };
      if (s.status === "COMPLETED") {
        const out = await fetch(ref.responseUrl, { headers: { Authorization: `Key ${falKey()}` } });
        if (!out.ok) throw new ProviderError(`${ref.endpoint}: ${await readError(out)}`, out.status, false);
        return (await out.json()) as T;
      }
      if (s.status === "FAILED" || s.error) throw new ProviderError(`${ref.endpoint}: ${s.error ?? "generation failed"}`, 500, false);
    } else if (res && res.status !== 404 && res.status < 500) {
      throw new ProviderError(`${ref.endpoint}: ${await readError(res)}`, res.status, false);
    }
    await sleep(delay);
    delay = Math.min(delay * 1.3, 10_000);
  }
  throw new ProviderError(`${ref.endpoint}: timed out`, 504, false);
}

/** Download a provider result URL into memory. */
export async function download(url: string): Promise<{ buf: Buffer; mime: string }> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!m) throw new ProviderError("Bad data URI", 500);
    return { buf: Buffer.from(m[3], m[2] ? "base64" : "utf8"), mime: m[1] ?? "application/octet-stream" };
  }
  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(`Download failed (${res.status})`, res.status, res.status >= 500);
    return { buf: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream" };
  });
}

/** OpenRouter chat call that must return JSON. */
export async function visionJson<T>(model: string, prompt: string, images: string[]): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ProviderError("OPENROUTER_API_KEY is not configured", 500);
  return withRetry(async () => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://fashion.trycanopy.space",
        "X-Title": "Canopy Fashion Studio",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [...images.map((url) => ({ type: "image_url", image_url: { url } })), { type: "text", text: prompt }] }],
      }),
    });
    if (!res.ok) throw new ProviderError(`${model}: ${await readError(res)}`, res.status, res.status === 429 || res.status >= 500);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = j.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new ProviderError(`${model}: response was not JSON`, 502, true);
    }
  });
}
