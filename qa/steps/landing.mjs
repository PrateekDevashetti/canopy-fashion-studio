// Captures the landing page at the reference scroll positions into qa/out/landing-*.png.
export default async function landing(page) {
  await page.waitForSelector("h1", { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const sections = [
    ["hero", 0],
    ["workflow", "#concept", -760],
    ["concept", "#concept", 30],
    ["refine", "#refine", 30],
    ["showcase", "#showcase", 30],
    ["tools", "#tools", 20],
    ["faq", "#faq", -40],
    ["cta", "footer", -900],
    ["footer", "footer", -300],
  ];
  for (const [name, sel, off = 0] of sections) {
    if (typeof sel === "number") await page.evaluate((y) => window.scrollTo(0, y), sel);
    else await page.evaluate(([s, o]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + window.scrollY + o), [sel, off]);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `qa/out/landing-${name}.png` });
  }
}
