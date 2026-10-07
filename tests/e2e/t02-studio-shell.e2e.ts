// Studio shell: rail sections/tools, hover previews, tool panel, view toggles, empty state, project rename.
import { test } from "@e2e-dev/web";
import { TOOLS } from "../../packages/core/src/tools/registry";
import { expect, newProject, openStudio, setOnboarded, uploadPublic } from "./helpers";

test("empty project shows the start screen and every tool", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("shell");
  await openStudio(browser, p.id);
  await expect(screen.getByText("Start with a sketch, reference, or prompt of your idea.")).toBeVisible();
  for (const s of ["Concept", "Refine", "Showcase"]) await expect(screen.getByText(s, { exact: true }).first()).toBeVisible();
  const tools = await browser.evaluate(() => [...document.querySelectorAll("[data-tool]")].map((e) => e.getAttribute("data-tool")));
  expect(tools.length).toBe(TOOLS.length);
});

test("hovering a tool shows its preview card; clicking opens its panel", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("hover");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await browser.locator('[data-tool="fabric-swap"]').hover();
  await expect(screen.getByText("Swap a garment's material for any fabric swatch you drop in.").first()).toBeVisible();
  await browser.locator('[data-tool="garment-recolor"]').click();
  await expect(screen.getByRole("heading", { name: "Garment Recolor" })).toBeVisible();
  await expect(screen.getByText("Applying to")).toBeVisible();
  await expect(screen.getByText("Choose a color")).toBeVisible();
  // Close and reopen.
  await screen.getByRole("button", { name: "Close tool" }).click();
  await expect(screen.getByRole("heading", { name: "Garment Recolor" })).not.toBeVisible();
});

test("E / F switch Editor and Feed", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("views");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await browser.keyboard.press("f");
  await expect(screen.getByText("Fashion Studio", { exact: true }).first()).toBeVisible();
  await expect(screen.getByRole("button", { name: "Make something new" })).toBeVisible();
  await browser.keyboard.press("e");
  await expect(browser.locator("[data-stage-image]")).toBeVisible();
});

test("project menu renames the project", async ({ browser, screen }) => {
  await setOnboarded(true);
  const p = await newProject("rename");
  await uploadPublic(p.id, "/studio/tour/render.jpg", "Jacket.jpg");
  await openStudio(browser, p.id);
  await screen.getByRole("button", { name: "Project menu" }).click();
  await screen.getByRole("button", { name: "Rename project" }).click();
  const input = browser.locator("header input, input.field").first();
  await input.fill("SS27 Outerwear");
  await input.press("Enter");
  await expect(screen.getByText("SS27 Outerwear").first()).toBeVisible();
});
