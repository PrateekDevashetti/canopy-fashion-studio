// Round 2: review boards, Share + Publish to Explore, Library sources, project menu + folders,
// credits pill, new tools, tour auto-advance, import SSRF guard, SVG sanitizing.
import { test } from "@e2e-dev/web";
import { api, BASE, expect, newProject, openStudio, setOnboarded, uploadPublic } from "./helpers";

/** A free generated result (a crop) so Explore/publish paths have a "result" asset. */
async function freeResult(projectId: string, parentId: string) {
  const r = await api("POST", `/api/projects/${projectId}/edits`, { op: "crop", parentId, crop: { cx: 0.5, cy: 0.5, w: 0.8, h: 0.8, rot: 0 } });
  expect(r.status).toBe(201);
  return r.json.asset;
}

test("review board: one link for several looks, comments per look, counts in Review Mode", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("board");
  const a = await uploadPublic(p.id, "/studio/tour/render.jpg", "Look A.jpg");
  const b = await uploadPublic(p.id, "/studio/tour/recolor.jpg", "Look B.jpg");
  const r = await api("POST", `/api/projects/${p.id}/reviews`, { assetIds: [a.id, b.id] });
  expect(r.status).toBe(201);
  const token = r.json.token as string;
  await browser.goto(`${BASE}/r/${token}`, { waitUntil: "networkidle" });
  await expect(screen.getByText("2 looks · Click a look to comment, approve or request changes")).toBeVisible();
  await browser.locator(`img[alt="Look B"]`).click();
  await screen.getByPlaceholder("Your name").fill("Maya (CD)");
  await screen.getByRole("button", { name: "Approve" }).click();
  await expect(screen.getByText("Approved")).toBeVisible();
  // A look that isn't on the board can't be commented through it.
  const outsider = await uploadPublic(p.id, "/studio/tour/tryon.jpg", "Not on board.jpg");
  const bad = await fetch(`${BASE}/api/board/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: outsider.id, author: "x", body: "y" }) });
  expect(bad.status).toBe(404);
  const boards = await api("GET", `/api/projects/${p.id}/reviews`);
  expect(boards.json.boards[0].approvals).toBe(1);
  // Review Mode panel shows it.
  await openStudio(browser, p.id, "?tool=review-mode");
  await expect(screen.getByText("Review links")).toBeVisible();
  await expect(screen.getByText("2 looks").first()).toBeVisible();
});

test("share dialog: copy link + Publish to Explore, Explore lists it", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("explore");
  const up = await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  const res = await freeResult(p.id, up.id);
  await openStudio(browser, p.id, "?view=feed");
  await browser.locator(`[data-asset="${res.id}"]`).click();
  await screen.getByText("Share assets", { exact: true }).first().click();
  await expect(screen.getByText("Share this asset")).toBeVisible();
  await expect(screen.getByRole("button", { name: "Copy share link" })).toBeVisible();
  await screen.getByRole("button", { name: "Publish to Explore" }).click();
  await expect(screen.getByRole("button", { name: "Unpublish" })).toBeVisible();
  const ex = await api("GET", "/api/explore");
  expect(ex.json.posts.some((x: any) => x.asset.id === res.id)).toBe(true);
  await api("DELETE", `/api/assets/${res.id}/explore`);
});

test("library modal lists every source and connector", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("library");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await screen.getByRole("button", { name: "Library" }).click();
  for (const label of ["Assets", "Elements", "History", "Explore", "Unsplash", "Savee", "Google Drive", "Dropbox", "Frame.io", "Figma"]) {
    await expect(screen.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await screen.getByText("Savee", { exact: true }).first().click();
  await expect(screen.getByRole("button", { name: "Log in with Savee" })).toBeVisible();
});

test("project menu: items, folders and preferences", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("menu");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await screen.getByRole("button", { name: "Project menu" }).click();
  for (const label of ["Back to home", "New project", "New Fashion Studio", "Rename project", "Move to folder", "Project preferences"]) {
    await expect(screen.getByRole("button", { name: label })).toBeVisible();
  }
  const f = await api("POST", "/api/folders", { name: "SS27 drops" });
  expect(f.status).toBe(201);
  const mv = await api("PUT", `/api/projects/${p.id}/folder`, { folderId: f.json.folder.id });
  expect(mv.status).toBe(200);
  const prefs = await api("PATCH", `/api/projects/${p.id}/preferences`, { imageResolution: "2K", aspect: "4:5" });
  expect(prefs.json.preferences.imageResolution).toBe("2K");
  await api("DELETE", `/api/folders/${f.json.folder.id}`);
});

test("signed-in header shows credits; new tools are in the rail", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("rail");
  await openStudio(browser, p.id);
  await expect(browser.locator('[data-testid="credits-pill"]')).toBeVisible();
  await expect(screen.getByText("Sign in", { exact: true })).toHaveCount(0);
  for (const short of ["Vector", "Flats", "Mood", "Review", "Print", "Trims", "Shopify", "PDP"]) {
    await expect(screen.getByText(short, { exact: true }).first()).toBeVisible();
  }
  await expect(screen.getByText("Soon", { exact: true })).toHaveCount(0);
});

test("tour advances on its own after 7 seconds", async ({ browser, screen }) => {
  const p = await newProject("autotour");
  await openStudio(browser, p.id, "?tour=1");
  await screen.getByRole("button", { name: "Get started" }).click();
  await expect(screen.getByText("Start with a sketch")).toBeVisible({ timeout: 60_000 });
  // No clicks: the tour generates the render itself, then picks the jacket itself.
  await expect(screen.getByText("Select your garment")).toBeVisible({ timeout: 20_000 });
  await expect(screen.getByText("Recolor your garment")).toBeVisible({ timeout: 25_000 });
});

test("import from link refuses internal addresses; SVG uploads are sanitized and sandboxed", async () => {
  const p = await newProject("guards");
  for (const url of ["http://example.com/a.png", "https://127.0.0.1/x.png", "https://localhost/x.png", "https://169.254.169.254/latest/meta-data"]) {
    const r = await api("POST", `/api/projects/${p.id}/import`, { url });
    expect(r.status).toBe(400);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" onload="alert(1)"><script>alert(2)</script><rect width="40" height="40" fill="red"/></svg>`;
  const f = new FormData();
  f.append("file", new Blob([svg], { type: "image/svg+xml" }), "evil.svg");
  const up = await fetch(`${BASE}/api/projects/${p.id}/uploads`, { method: "POST", body: f });
  expect(up.status).toBe(201);
  const asset = (await up.json()).asset;
  const served = await fetch(`${BASE}${asset.originalUrl}`);
  const body = await served.text();
  expect(body.includes("<script")).toBe(false);
  expect(body.includes("onload")).toBe(false);
  expect(served.headers.get("content-security-policy") ?? "").toContain("sandbox");
});
