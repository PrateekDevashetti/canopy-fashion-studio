// Walks the onboarding tour end to end, capturing every step into qa/out/tour-*.png.
import ready from "./ready.mjs";

export default async function tour(page) {
  await ready(page);
  const shot = (n) => page.screenshot({ path: `qa/out/tour-${n}.png` });
  await page.getByRole("button", { name: "Get started" }).click();
  await page.waitForSelector('[data-tour="generate"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot("1-sketch");
  await page.locator('[data-tour="generate"]').click({ force: true });
  await page.getByText("Select your garment").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot("2-select");
  // Click the middle of the garment on the stage.
  const box = await page.locator("[data-stage-image]").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByText("Recolor your garment").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot("3-recolor");
  await page.locator('[data-tour="generate"]').click({ force: true });
  await page.getByText("Try it on").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot("4-tryon");
  await page.locator('[data-tour="generate"]').click({ force: true });
  await page.getByText("Review your work").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
  await shot("5-review");
  await page.locator('[data-tour="feed-toggle"]').click({ force: true });
  await page.getByText("Export & share for review").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await shot("6-export");
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForTimeout(1200);
}
