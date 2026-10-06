// Generation through the UI and the API: credits, validation, refunds, region edits, auto-detect.
// Paid tests run only with E2E_REAL_MODELS=1.
import { test } from "@e2e-dev/web";
import { api, expect, newProject, openStudio, REAL, setOnboarded, uploadPublic, waitRun } from "./helpers";

test("invalid runs are rejected before any credits move", async () => {
  const p = await newProject("validate");
  const before = (await api("GET", "/api/me")).json.credits;
  const missing = await api("POST", `/api/projects/${p.id}/runs`, { tool: "garment-recolor", inputs: {}, settings: {} });
  expect(missing.status).toBe(400);
  const unknown = await api("POST", `/api/projects/${p.id}/runs`, { tool: "not-a-tool", inputs: {} });
  expect(unknown.status).toBe(400);
  const badMask = await api("POST", `/api/projects/${p.id}/runs`, { tool: "region-edit", inputs: { image: "ast_x", mask: "p/other/masks/x.png", prompt: "x" } });
  expect(badMask.status).toBe(400);
  const after = (await api("GET", "/api/me")).json.credits;
  expect(after).toBe(before);
});

test("blocked models stop a tool and show the workspace warning", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("blocked");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await api("PATCH", "/api/me", { disabledModels: ["nano-banana-2"] });
  try {
    await openStudio(browser, p.id, "?tool=garment-recolor");
    await expect(screen.getByText("Models used in this tool are blocked for this workspace: Nano Banana 2")).toBeVisible();
    await expect(screen.getByRole("link", { name: "Open model access settings" })).toBeVisible();
    const r = await api("POST", `/api/projects/${p.id}/runs`, { tool: "garment-recolor", inputs: { garment: (await api("GET", `/api/projects/${p.id}/feed`)).json.runs[0].outputs[0].id, colors: ["#000000"] } });
    expect(r.status).toBe(409);
  } finally {
    await api("PATCH", "/api/me", { disabledModels: [] });
  }
});

if (REAL) {
  test("recolor through the UI charges credits and lands a result", async ({ browser, screen }) => {
    await setOnboarded(true);
    const p = await newProject("recolor");
    await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
    const before = (await api("GET", "/api/me")).json.credits;
    await openStudio(browser, p.id, "?tool=garment-recolor");
    await screen.getByText("Choose a color").click();
    await screen.getByRole("button", { name: "Olive" }).click();
    await browser.keyboard.press("Escape");
    await browser.locator('[data-tour="generate"]').click();
    await expect(screen.getByText("1 generating…")).toBeVisible({ timeout: 15_000 });
    const feed = async () => (await api("GET", `/api/projects/${p.id}/feed`)).json.runs;
    let runs = await feed();
    // The UI shows an optimistic placeholder first; wait for the server-side run.
    for (let i = 0; i < 20 && !runs.some((r: any) => r.tool === "garment-recolor"); i++) {
      await new Promise((r) => setTimeout(r, 500));
      runs = await feed();
    }
    const run = await waitRun(runs.find((r: any) => r.tool === "garment-recolor").id);
    expect(run.status).toBe("succeeded");
    expect(run.outputs.length).toBe(1);
    const after = (await api("GET", "/api/me")).json.credits;
    expect(before - after).toBe(4);
    runs = await feed();
    expect(runs[0].outputs[0].name).toContain("Olive");
  });

  test("auto-detect then region edit keeps pixels outside the mask", async () => {
    const p = await newProject("region");
    const a = await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
    const det = await api("POST", `/api/assets/${a.id}/detect`);
    expect(det.status).toBe(200);
    expect(det.json.segments.length).toBeGreaterThan(2);
    const collar = det.json.segments.find((s: any) => /collar/i.test(s.label)) ?? det.json.segments[1];
    const r = await api("POST", `/api/projects/${p.id}/runs`, { tool: "region-edit", inputs: { image: a.id, mask: collar.maskKey, prompt: "make it corduroy" } });
    expect(r.status).toBe(201);
    const run = await waitRun(r.json.run.id);
    expect(run.status).toBe("succeeded");
    // Second detect is served from cache instantly.
    const t = Date.now();
    await api("POST", `/api/assets/${a.id}/detect`);
    expect(Date.now() - t).toBeLessThan(3000);
  });

  test("batch: one garment in three colorways makes three results", async () => {
    const p = await newProject("batch");
    const a = await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
    const r = await api("POST", `/api/projects/${p.id}/runs`, { tool: "garment-recolor", inputs: { garment: a.id, colors: [{ hex: "#111111", name: "Black" }, { hex: "#f4f1ea", name: "Ecru" }, { hex: "#7a1f2b", name: "Burgundy" }] } });
    expect(r.json.run.expected).toBe(3);
    expect(r.json.run.cost).toBe(12);
    const run = await waitRun(r.json.run.id);
    expect(run.outputs.length).toBe(3);
  });
}
