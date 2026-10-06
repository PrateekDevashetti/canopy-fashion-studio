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

/* ---------- OpenRouter video (Veo 3.1 / Kling v3 / Seedance via one API) ---------- */

const orKey = () => {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new ProviderError("OPENROUTER_API_KEY is not configured", 500);
  return k;
};

export type OrVideoInput = {
  prompt: string;
  firstFrameUrl: string;
  lastFrameUrl?: string | null;
  duration: number;
  resolution: string;
  aspect?: string | null;
  audio?: boolean;
};

/** Submit an image-to-video job. Frame images must be public HTTPS URLs (presigned storage URLs work). */
export async function openrouterVideoSubmit(model: string, v: OrVideoInput): Promise<QueueRef> {
  return withRetry(async () => {
    const frame_images = [
      { type: "image_url", image_url: { url: v.firstFrameUrl }, frame_type: "first_frame" },
      ...(v.lastFrameUrl ? [{ type: "image_url", image_url: { url: v.lastFrameUrl }, frame_type: "last_frame" }] : []),
    ];
    const res = await fetch("https://openrouter.ai/api/v1/videos", {
      method: "POST",
      headers: { Authorization: `Bearer ${orKey()}`, "content-type": "application/json", "X-Title": "Canopy Fashion Studio" },
      body: JSON.stringify({
        model,
        prompt: v.prompt,
        frame_images,
        duration: v.duration,
        resolution: v.resolution,
        ...(v.aspect ? { aspect_ratio: v.aspect } : {}),
        generate_audio: v.audio ?? false,
      }),
    });
    if (!res.ok) throw new ProviderError(`openrouter ${model}: ${await readError(res)}`, res.status, res.status === 429 || res.status >= 500);
    const j = (await res.json()) as { id: string; polling_url?: string };
    const statusUrl = j.polling_url ?? `https://openrouter.ai/api/v1/videos/${j.id}`;
    return { endpoint: `openrouter:${model}`, requestId: j.id, statusUrl, responseUrl: `https://openrouter.ai/api/v1/videos/${j.id}/content?index=0` };
  });
}

/** Poll an OpenRouter video job and download the MP4. */
export async function openrouterVideoWait(ref: QueueRef, deadlineMs = 20 * 60_000): Promise<Buffer> {
  const until = Date.now() + deadlineMs;
  let delay = 5000;
  while (Date.now() < until) {
    const res = await fetch(ref.statusUrl, { headers: { Authorization: `Bearer ${orKey()}` } }).catch(() => null);
    if (res?.ok) {
      const s = (await res.json()) as { status: string; error?: unknown; unsigned_urls?: string[] };
      if (s.status === "completed") {
        const url = s.unsigned_urls?.[0] ?? ref.responseUrl;
        const out = await fetch(url, { headers: url.startsWith("https://openrouter.ai/") ? { Authorization: `Bearer ${orKey()}` } : {} });
        if (!out.ok) throw new ProviderError(`${ref.endpoint}: download ${out.status}`, out.status, out.status >= 500);
        return Buffer.from(await out.arrayBuffer());
      }
      if (["failed", "cancelled", "expired"].includes(s.status)) {
        const err = typeof s.error === "string" ? s.error : s.error ? JSON.stringify(s.error).slice(0, 200) : s.status;
        throw new ProviderError(`${ref.endpoint}: ${err}`, 500, false);
      }
    } else if (res && res.status !== 404 && res.status < 500) {
      throw new ProviderError(`${ref.endpoint}: ${await readError(res)}`, res.status, false);
    }
    await sleep(delay);
    delay = Math.min(delay * 1.3, 15_000);
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

/* ---------- circuit breaker: skip a provider that's out of balance / down for a while ---------- */

const tripped = new Map<string, number>();
export const providerDown = (name: string) => (tripped.get(name) ?? 0) > Date.now();
export function tripIfFatal(name: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/locked|exhausted balance|top.?up|insufficient (credits|funds)|payment required|401|unauthorized/i.test(msg) || (e instanceof ProviderError && (e.status === 401 || e.status === 402 || e.status === 403))) {
    tripped.set(name, Date.now() + 5 * 60_000);
    console.warn(`[providers] ${name} disabled for 5 min: ${msg.slice(0, 120)}`);
  }
}

/** Gemini image generation/editing through OpenRouter (Nano Banana 2). Returns PNG/JPEG buffers. */
export async function openrouterImage(prompt: string, images: string[], opts: { aspect?: string; size?: string; model?: string } = {}): Promise<Buffer[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new ProviderError("OPENROUTER_API_KEY is not configured", 500);
  const model = opts.model ?? process.env.FASHION_OR_IMAGE_MODEL ?? "google/gemini-3.1-flash-image";
  const image_config: Record<string, string> = {};
  if (opts.aspect && opts.aspect !== "auto") image_config.aspect_ratio = opts.aspect;
  if (opts.size) image_config.image_size = opts.size;
  return withRetry(async () => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", "X-Title": "Canopy Fashion Studio" },
      body: JSON.stringify({
        model,
        // Gemini / GPT-5 answer with image+text; dedicated image models (Seedream, FLUX, Recraft…) are image-only.
        modalities: /^(google|openai\/gpt-5)/.test(model) ? ["image", "text"] : ["image"],
        ...(Object.keys(image_config).length ? { image_config } : {}),
        messages: [{ role: "user", content: [...images.map((url) => ({ type: "image_url", image_url: { url } })), { type: "text", text: prompt }] }],
      }),
      signal: AbortSignal.timeout(180_000),
    }).catch((e) => {
      throw new ProviderError(`${model}: ${(e as Error).message}`, 0, true);
    });
    if (!res.ok) throw new ProviderError(`${model}: ${await readError(res)}`, res.status, res.status === 429 || res.status >= 500);
    const j = (await res.json()) as { choices?: { message?: { images?: { image_url?: { url?: string } }[]; content?: string } }[] };
    const urls = (j.choices?.[0]?.message?.images ?? []).map((i) => i.image_url?.url).filter((u): u is string => !!u);
    if (!urls.length) throw new ProviderError(`${model}: no image returned${j.choices?.[0]?.message?.content ? ` (${String(j.choices[0].message.content).slice(0, 120)})` : ""}`, 502, true);
    return Promise.all(urls.map(async (u) => (await download(u)).buf));
  }, 2);
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
