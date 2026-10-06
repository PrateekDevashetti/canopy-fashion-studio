import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, SECTIONS, SOON, batchSize, runCost, toolById, validateInputs, bindsActive, MODELS } from "../tools/registry.ts";

test("every section has tools and every tool has unique id/short label", () => {
  for (const s of SECTIONS) assert.ok(TOOLS.some((t) => t.section === s.id), s.id);
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
  assert.equal(new Set(TOOLS.map((t) => t.short)).size, TOOLS.length);
  assert.equal(TOOLS.length, 15);
  for (const s of SOON) assert.ok(!toolById(s.id));
});

test("tools reference known models and assets", () => {
  for (const t of TOOLS) {
    for (const m of t.models) assert.ok(MODELS[m], `${t.id} → ${m}`);
    assert.match(t.icon, /^\/studio\/icons\/.+\.png$/);
    assert.match(t.preview, /^\/studio\/previews\/.+\.jpg$/);
    assert.ok(t.aspects.includes(t.defaultAspect), t.id);
  }
});

test("batching multiplies cost by collection size", () => {
  const recolor = toolById("garment-recolor")!;
  const inputs = { garment: "ast_a", colors: [{ hex: "#000000" }, { hex: "#ffffff" }, { hex: "#ff0000" }] };
  assert.equal(batchSize(recolor, inputs), 3);
  assert.equal(runCost(recolor, inputs, "1K"), 12);
  assert.equal(runCost(recolor, inputs, "4K"), 24);
  const maker = toolById("model-maker")!;
  assert.equal(runCost(maker, { description: "x" }), 18);
  // References are blended into each output, never a batch axis.
  const concept = toolById("concept")!;
  assert.equal(batchSize(concept, { references: ["ast_a", "ast_b", "ast_c"] }), 1);
  assert.equal(runCost(concept, { references: ["ast_a", "ast_b"], direction: "x" }), 16);
});

test("validation", () => {
  const swap = toolById("garment-swap")!;
  assert.equal(validateInputs(swap, {}), "Add base model photo first");
  assert.equal(validateInputs(swap, { base: "ast_a", mask: "p/x/masks/m.png" }), "Add the new garment or describe it");
  assert.equal(validateInputs(swap, { base: "ast_a", mask: "p/x/masks/m.png", description: "a sweater" }), null);
  const prompt = toolById("prompt")!;
  assert.equal(validateInputs(prompt, {}), "Add prompt first");
  assert.equal(validateInputs(prompt, { prompt: "a coat" }), null);
  const recolor = toolById("garment-recolor")!;
  assert.equal(validateInputs(recolor, { garment: "ast_a" }), "Choose a color");
});

test("active-image binding follows Flora's Optional semantics", () => {
  const swap = toolById("garment-swap")!;
  const base = swap.inputs.find((s) => s.key === "base")!;
  const garment = swap.inputs.find((s) => s.key === "garment")!;
  assert.equal(bindsActive(base), true);
  assert.equal(bindsActive(garment), false);
});
