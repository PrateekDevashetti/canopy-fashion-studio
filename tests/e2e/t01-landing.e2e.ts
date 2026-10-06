// Landing: every section in order, nav dropdowns, FAQ accordion, CTAs and tool deep links.
import { test } from "@e2e-dev/web";
import { BASE, expect } from "./helpers";

test("landing renders every section in the reference order", async ({ browser, screen }) => {
  await browser.goto(BASE + "/", { waitUntil: "networkidle" });
  await expect(screen.getByText("Introducing")).toBeVisible();
  await expect(screen.getByRole("heading", { name: "Fashion Studio" })).toBeVisible();
  const ids = await browser.evaluate(() => [...document.querySelectorAll("section[id]")].map((e) => e.id));
  expect(ids).toEqual(["concept", "refine", "showcase", "tools", "faq"]);
  for (const t of ["Start with just a sketch", "Precision where it counts", "Bring your garment to life", "Every tool you need to make it real.", "Frequently asked"]) {
    await expect(screen.getByText(t, { exact: false }).first()).toBeVisible();
  }
  // Rebrand: no FLORA anywhere on the page.
  const text = await browser.evaluate(() => document.body.innerText);
  expect(/flora/i.test(text)).toBe(false);
  expect(text.includes("Canopy is seamless.")).toBe(true);
});

test("FAQ accordion opens and closes", async ({ browser, screen }) => {
  await browser.goto(BASE + "/#faq", { waitUntil: "networkidle" });
  const q = screen.getByRole("button", { name: "Who is Fashion Studio for?" });
  await expect(q).toHaveAttribute("aria-expanded", "false");
  await q.click();
  await expect(q).toHaveAttribute("aria-expanded", "true");
  await expect(screen.getByText("solo founder", { exact: false })).toBeVisible();
  await q.click();
  await expect(q).toHaveAttribute("aria-expanded", "false");
});

test("nav dropdown lists the Canopy products", async ({ browser, screen }) => {
  await browser.goto(BASE + "/", { waitUntil: "networkidle" });
  await screen.getByRole("button", { name: "Product" }).click();
  await expect(screen.getByText("Canopy Canvas")).toBeVisible();
  await expect(screen.getByText("The brand layer for AI agents")).toBeVisible();
});

test("TRY IT NOW cards deep-link into the right tool", async ({ browser }) => {
  await browser.goto(BASE + "/", { waitUntil: "networkidle" });
  const hrefs = await browser.evaluate(() => [...document.querySelectorAll('a[href*="/studio?tool="]')].map((a) => a.getAttribute("href")));
  for (const t of ["sketch-to-render", "prompt", "flatlay", "ghostform", "garment-recolor", "fabric-swap", "model-maker", "photo-shoot", "model-try-on", "model-360"]) {
    expect(hrefs.some((h) => h?.endsWith(`tool=${t}`))).toBe(true);
  }
});

if (process.env.OPENROUTER_API_KEY)
  test("an agent finds the workflow strip and tool cards", async ({ browser, agent }) => {
    await browser.goto(BASE + "/", { waitUntil: "networkidle" });
    await agent.assert("the page introduces Fashion Studio by Canopy with a hero, a five-step workflow strip from Sketch to 360 Video, and cards for tools such as Sketch to Render and Prompt");
  });
