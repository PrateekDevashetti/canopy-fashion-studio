export default async function ready(page) {
  await page.waitForSelector('[data-tour="rail"]', { timeout: 120_000 });
  await page.waitForTimeout(1500);
}
