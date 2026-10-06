// Hardening: health, file-key validation, project isolation, signed-out demo gating, upload limits, idempotent tour.
import { test } from "@e2e-dev/web";
import { api, BASE, expect, isLocal, newProject, uploadPublic } from "./helpers";

test("health reports db, storage and engine", async () => {
  const r = await api("GET", "/api/health");
  expect(r.status).toBe(200);
  expect(r.json.db).toBe("ok");
  expect(["s3", "local"]).toContain(r.json.storage);
});

test("file route rejects traversal and unknown keys", async () => {
  for (const bad of ["/api/files/..%2F..%2Fetc%2Fpasswd", "/api/files/p/prj_x/../../.env.local", "/api/files/random.png"]) {
    const r = await fetch(BASE + bad);
    expect(r.status).toBe(404);
  }
});

test("projects are isolated: unknown ids 404, foreign masks rejected", async () => {
  const r = await api("GET", "/api/projects/prj_doesnotexist000");
  expect(r.status).toBe(404);
  const p = await newProject("iso");
  const a = await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  const run = await api("POST", `/api/projects/${p.id}/runs`, { tool: "region-edit", inputs: { image: a.id, mask: "p/prj_someoneelse/masks/msk_1.png", prompt: "x" } });
  expect(run.status).toBe(400);
  const other = await newProject("iso2");
  const cross = await api("POST", `/api/projects/${other.id}/runs`, { tool: "flatlay", inputs: { garment: [a.id] } });
  expect(cross.status).toBe(400);
});

test("uploads reject non-images", async () => {
  const p = await newProject("upload");
  const f = new FormData();
  f.append("file", new Blob(["not an image"], { type: "text/plain" }), "notes.txt");
  const r = await api("POST", `/api/projects/${p.id}/uploads`, f);
  expect(r.status).toBe(415);
});

test("tour seeding is idempotent", async () => {
  const p = await newProject("tour-seed");
  const a = await api("POST", `/api/projects/${p.id}/tour`, { step: "start" });
  expect(a.status).toBe(201);
  const b = await api("POST", `/api/projects/${p.id}/tour`, { step: "start" });
  expect(b.json.seeded).toBe(true);
});

if (!isLocal || process.env.E2E_GUEST === "1")
  test("signed-out visitors get a demo workspace and real actions ask them to sign up", async ({ browser, screen }) => {
    await browser.goto(BASE + "/studio", { waitUntil: "networkidle" });
    await browser.waitForURL(/\/studio\/prj_/, { timeout: 60_000 });
    await expect(screen.getByText("Sign in")).toBeVisible();
    const status = await browser.evaluate(async () => (await fetch(location.pathname.replace("/studio/", "/api/projects/") + "/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: "prompt", inputs: { prompt: "x" } }) })).status);
    expect(status).toBe(403);
  });
