import { expect } from "e2e";

export { expect };
export const BASE = (process.env.E2E_BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
export const isLocal = /localhost|127\.0\.0\.1/.test(BASE);
export const REAL = process.env.E2E_REAL_MODELS === "1";
const COOKIE = process.env.E2E_COOKIE ?? "";

export type Json = Record<string, any>;

/** Server-side API call (Node fetch) with the test session. */
export async function api(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (COOKIE) headers.cookie = COOKIE;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, headers: res.headers, json: json as Json, text };
}

/** A fresh, isolated project for one test. */
export async function newProject(name = "e2e") {
  const r = await api("POST", "/api/projects", { name: `${name} ${Date.now().toString(36)}` });
  if (r.status !== 201) throw new Error(`create project ${r.status} ${r.text.slice(0, 200)}`);
  return r.json.project as { id: string; name: string };
}

/** Upload a bundled public image into a project. */
export async function uploadPublic(projectId: string, publicPath: string, name: string) {
  const img = await fetch(BASE + publicPath);
  const f = new FormData();
  f.append("file", new Blob([await img.arrayBuffer()], { type: img.headers.get("content-type") ?? "image/jpeg" }), name);
  const r = await api("POST", `/api/projects/${projectId}/uploads`, f);
  if (r.status !== 201) throw new Error(`upload ${r.status} ${r.text.slice(0, 200)}`);
  return r.json.asset as { id: string; url: string; runId: string; width: number; height: number };
}

export async function waitRun(id: string, timeoutMs = 280_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const r = await api("GET", `/api/runs/${id}`);
    const run = r.json?.run;
    if (run && (run.status === "succeeded" || run.status === "failed")) return run;
    if (Date.now() > end) return run;
    await new Promise((res) => setTimeout(res, 3000));
  }
}

/** Mark the dev user as onboarded so the welcome modal doesn't cover the UI (or not, for tour tests). */
export async function setOnboarded(v: boolean) {
  await api("PATCH", "/api/me", { onboarded: v });
}

type Browserish = { goto(u: string, o?: { waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeout?: number }): Promise<unknown>; locator(s: string): any; setCookies?(c: any[]): Promise<void> };

/** Open a project in the studio and wait for the shell. */
export async function openStudio(browser: Browserish, projectId: string, qs = "") {
  await browser.goto(`${BASE}/studio/${projectId}${qs}`, { waitUntil: "networkidle", timeout: 120_000 });
  await browser.locator('[data-tour="rail"]').waitFor({ timeout: 120_000 });
}
