// Feed: runs newest first, multi-select + selection panel, mark/save, share link + public review page, delete.
import { test } from "@e2e-dev/web";
import { api, BASE, expect, newProject, openStudio, setOnboarded, uploadPublic } from "./helpers";

test("feed groups runs and multi-select opens the action panel", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("feed");
  const a = await uploadPublic(p.id, "/studio/tour/render.jpg", "Blue jacket.jpg");
  const b = await uploadPublic(p.id, "/studio/tour/recolor.jpg", "Brown jacket.jpg");
  await openStudio(browser, p.id, "?view=feed");
  await expect(screen.getByRole("button", { name: "Make something new" })).toBeVisible();
  await browser.locator(`[data-asset="${a.id}"]`).click();
  await expect(screen.getByText("1 asset selected")).toBeVisible();
  await browser.locator(`[data-asset="${b.id}"]`).click({ modifiers: ["Meta"] });
  await expect(screen.getByText("2 assets selected")).toBeVisible();
  for (const label of ["Mark", "Open in Canvas", "Share assets", "Share for review", "Download", "Save to Assets", "Export", "Delete"]) {
    await expect(screen.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await screen.getByText("Mark", { exact: true }).first().click();
  await expect(screen.getByText("Marked")).toBeVisible();
  const feed = await api("GET", `/api/projects/${p.id}/feed`);
  expect(feed.json.runs.flatMap((r: any) => r.outputs).every((o: any) => o.marked)).toBe(true);
});

test("share link opens a public page that collects review comments", async ({ browser, screen }) => {
  const p = await newProject("share");
  const a = await uploadPublic(p.id, "/studio/tour/tryon.jpg", "Look 01.jpg");
  const s = await api("POST", `/api/assets/${a.id}/share`);
  expect(s.status).toBe(200);
  const token = s.json.url.split("/s/")[1];
  await browser.goto(`${BASE}/s/${token}?review=1`, { waitUntil: "networkidle" });
  await expect(screen.getByText("No feedback yet. Be the first.")).toBeVisible();
  await screen.getByPlaceholder("Your name").fill("Maya (CD)");
  await screen.getByPlaceholder("Leave a comment…").fill("Love the drape — try a darker wash.");
  await screen.getByRole("button", { name: "Changes" }).click();
  await expect(screen.getByText("Changes requested")).toBeVisible();
  await expect(screen.getByText("Love the drape — try a darker wash.")).toBeVisible();
  // Revoking the link takes the page down.
  await api("DELETE", `/api/assets/${a.id}/share`);
  const gone = await fetch(`${BASE}/s/${token}`);
  expect(gone.status).toBe(404);
});

test("deleting a result removes it from the feed", async () => {
  const p = await newProject("delete");
  const a = await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  expect((await api("DELETE", `/api/assets/${a.id}`)).status).toBe(200);
  const feed = await api("GET", `/api/projects/${p.id}/feed`);
  expect(feed.json.runs.length).toBe(0);
});
