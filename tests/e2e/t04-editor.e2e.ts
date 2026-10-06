// Editor operations that run in the browser: crop, adjustments, draw/shapes/text, lasso + square selections, zoom.
import { test } from "@e2e-dev/web";
import { api, expect, newProject, openStudio, setOnboarded, uploadPublic } from "./helpers";

async function stageBox(browser: any) {
  return (await browser.locator("[data-stage-image]").boundingBox())!;
}

async function feedCount(projectId: string) {
  const r = await api("GET", `/api/projects/${projectId}/feed`);
  return r.json.runs.length as number;
}

test("crop saves a new version", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("crop");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await browser.keyboard.press("c");
  await expect(screen.getByRole("heading", { name: "Crop" })).toBeVisible();
  await screen.getByRole("button", { name: "4:5" }).click();
  await screen.getByRole("button", { name: "Save" }).click();
  await expect(screen.getByText("Saved as a new version")).toBeVisible({ timeout: 30_000 });
  expect(await feedCount(p.id)).toBe(2);
  const feed = await api("GET", `/api/projects/${p.id}/feed`);
  const cropped = feed.json.runs[0].outputs[0];
  expect(cropped.name).toBe("Cropped");
  expect(Math.abs(cropped.width / cropped.height - 0.8)).toBeLessThan(0.02);
});

test("adjustments save a new version", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("adjust");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await screen.getByRole("button", { name: "Adjustments" }).click();
  await expect(screen.getByText("Adjust color, tone, and light")).toBeVisible();
  const warmth = screen.getByRole("slider", { name: "Warmth" });
  await warmth.click();
  for (let i = 0; i < 12; i++) await warmth.press("ArrowRight");
  await expect(warmth).toHaveAttribute("aria-valuenow", "12");
  await screen.getByRole("button", { name: "Save" }).click();
  await expect(screen.getByText("Saved as a new version")).toBeVisible({ timeout: 30_000 });
  expect(await feedCount(p.id)).toBe(2);
});

test("draw, shapes and text annotate the image", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("annotate");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await browser.keyboard.press("d");
  const b = await stageBox(browser);
  await browser.mouse.move(b.x + 100, b.y + 100);
  await browser.mouse.down();
  for (let i = 1; i <= 10; i++) await browser.mouse.move(b.x + 100 + i * 15, b.y + 100 + i * 8);
  await browser.mouse.up();
  await screen.getByRole("button", { name: "Annotate options" }).click();
  await screen.getByRole("button", { name: /Shapes/ }).click();
  await browser.mouse.move(b.x + 300, b.y + 300);
  await browser.mouse.down();
  await browser.mouse.move(b.x + 420, b.y + 380);
  await browser.mouse.up();
  await screen.getByRole("button", { name: "Save" }).click();
  await expect(screen.getByText("Saved as a new version")).toBeVisible({ timeout: 30_000 });
  const feed = await api("GET", `/api/projects/${p.id}/feed`);
  expect(feed.json.runs[0].outputs[0].name).toBe("Annotated");
});

test("lasso and square selections open the change bubble", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("select");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await browser.keyboard.press("l");
  const b = await stageBox(browser);
  await browser.mouse.move(b.x + 200, b.y + 200);
  await browser.mouse.down();
  for (const [dx, dy] of [[150, 0], [150, 150], [0, 150], [0, 10]]) await browser.mouse.move(b.x + 200 + dx, b.y + 200 + dy);
  await browser.mouse.up();
  await expect(browser.locator('input[placeholder="Make a change…"]')).toBeVisible();
  await screen.getByRole("button", { name: "Clear selection" }).click();
  await browser.keyboard.press("s");
  await browser.mouse.move(b.x + 150, b.y + 150);
  await browser.mouse.down();
  await browser.mouse.move(b.x + 350, b.y + 300);
  await browser.mouse.up();
  await expect(browser.locator('input[placeholder="Make a change…"]')).toBeVisible();
});

test("zoom menu changes the zoom level", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("zoom");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await screen.getByRole("button", { name: /100%/ }).click();
  await screen.getByRole("button", { name: "200%" }).click();
  await expect(screen.getByRole("button", { name: /200%/ })).toBeVisible();
});
