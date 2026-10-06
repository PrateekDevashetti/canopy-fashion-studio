// Onboarding: welcome → guided tour (sketch → render → select → recolor → try-on → feed → export) → finish.
import { test } from "@e2e-dev/web";
import { expect, newProject, openStudio, setOnboarded } from "./helpers";

test("the guided tour runs end to end", async ({ browser, screen }) => {
  const p = await newProject("tour");
  await openStudio(browser, p.id, "?tour=1");
  await expect(screen.getByText("Welcome to Fashion Studio")).toBeVisible();
  await screen.getByRole("button", { name: "Get started" }).click();
  await expect(screen.getByText("Start with a sketch")).toBeVisible({ timeout: 60_000 });
  await browser.locator('[data-tour="generate"]').click();
  await expect(screen.getByText("Select your garment")).toBeVisible({ timeout: 60_000 });
  // The garment regions load asynchronously (slow on a cold dev server): click until the jacket is picked.
  const box = await browser.locator("[data-stage-image]").boundingBox();
  for (let attempt = 0; attempt < 8; attempt++) {
    await browser.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    await browser.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await browser.mouse.down();
    await browser.mouse.up();
    try {
      await expect(screen.getByText("Recolor your garment")).toBeVisible({ timeout: 3_000 });
      break;
    } catch (e) {
      if (attempt === 7) throw e;
    }
  }
  await browser.locator('[data-tour="generate"]').click();
  await expect(screen.getByText("Try it on").first()).toBeVisible({ timeout: 60_000 });
  await browser.locator('[data-tour="generate"]').click();
  await expect(screen.getByText("Review your work")).toBeVisible({ timeout: 60_000 });
  await browser.locator('[data-tour="feed-toggle"]').click();
  await expect(screen.getByText("Export & share for review")).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByText("1 asset selected")).toBeVisible();
  await screen.getByRole("button", { name: "Finish" }).click();
  await expect(screen.getByText("Export & share for review")).not.toBeVisible();
  // Four tool runs landed in the feed (sketch + model uploads, render, recolor, try-on).
  for (const t of ["Model Try-On", "Garment Recolor", "Sketch to Render"]) await expect(screen.getByText(t).first()).toBeVisible();
});

test("skip onboarding dismisses for good", async ({ browser, screen }) => {
  const p = await newProject("skip");
  await openStudio(browser, p.id, "?tour=1");
  await screen.getByRole("button", { name: "Skip onboarding" }).click();
  await expect(screen.getByText("Welcome to Fashion Studio")).not.toBeVisible();
  await browser.reload();
  await browser.locator('[data-tour="rail"]').waitFor({ timeout: 60_000 });
  await expect(screen.getByText("Welcome to Fashion Studio")).not.toBeVisible();
});
