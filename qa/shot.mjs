/**
 * Screenshot helper for the QA loop. Usage:
 *   node qa/shot.mjs <path> <out.png> [steps.mjs]
 * steps.mjs default-exports async (page) => {} for interactions before the capture.
 * Prints console errors and failed requests so regressions surface immediately.
 */
import { chromium } from "playwright-core";
import path from "node:path";

const [, , urlPath = "/", out = "qa/out/shot.png", stepsFile] = process.argv;
const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
page.on("response", (r) => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(BASE + urlPath, { waitUntil: "networkidle", timeout: 90_000 }).catch((e) => errors.push(`goto: ${e.message}`));
if (stepsFile) {
  const steps = (await import(path.resolve(stepsFile))).default;
  try {
    await steps(page);
  } catch (e) {
    errors.push(`steps: ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
}
await page.waitForTimeout(600);
await page.screenshot({ path: out });
console.log("url:", page.url());
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
