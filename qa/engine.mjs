/**
 * Real-model engine test: every tool + editor op against a running server.
 *   node qa/engine.mjs [only-tool-ids,comma-separated]
 * Uses dev auth locally; set QA_BASE + QA_COOKIE for a deployed env.
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
const H = process.env.QA_COOKIE ? { cookie: process.env.QA_COOKIE } : {};
const only = process.argv[2]?.split(",");
const PUB = path.resolve(import.meta.dirname, "../apps/web/public");

async function api(p, init = {}) {
  const res = await fetch(BASE + p, { ...init, headers: { ...H, ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...init.headers } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p} ${res.status}: ${j.error ?? JSON.stringify(j).slice(0, 200)}`);
  return j;
}
async function upload(pid, file, name) {
  const f = new FormData();
  f.append("file", new Blob([fs.readFileSync(path.join(PUB, file))], { type: "image/jpeg" }), name);
  return (await api(`/api/projects/${pid}/uploads`, { method: "POST", body: f })).asset;
}
async function waitRun(id, timeoutMs = 12 * 60_000) {
  const t = Date.now();
  for (;;) {
    const { run } = await api(`/api/runs/${id}`);
    if (run.status === "succeeded" || run.status === "failed") return { run, secs: (Date.now() - t) / 1000 };
    if (Date.now() - t > timeoutMs) return { run, secs: (Date.now() - t) / 1000, timeout: true };
    await new Promise((r) => setTimeout(r, 2500));
  }
}

const { project } = await api("/api/projects", { method: "POST", body: JSON.stringify({ name: `Engine QA ${new Date().toISOString().slice(11, 16)}` }) });
const pid = project.id;
console.log("project", pid);
const [sketch, render, recolor, model, tryon, swatch] = await Promise.all([
  upload(pid, "studio/tour/sketch.jpg", "QA sketch.jpg"),
  upload(pid, "studio/tour/render.jpg", "QA render.jpg"),
  upload(pid, "studio/tour/recolor.jpg", "QA recolor.jpg"),
  upload(pid, "studio/tour/model.jpg", "QA model.jpg"),
  upload(pid, "studio/tour/tryon.jpg", "QA tryon.jpg"),
  upload(pid, "studio/collage/c3.jpg", "Teal ripstop.jpg"),
]);
console.log("uploads ok");

const t0 = Date.now();
const det = await api(`/api/assets/${render.id}/detect`, { method: "POST" });
console.log(`detect render: ${det.segments.length} regions in ${((Date.now() - t0) / 1000).toFixed(1)}s →`, det.segments.map((s) => `${s.label}(${(s.area * 100).toFixed(0)}%)`).join(", "));
const t1 = Date.now();
const det2 = await api(`/api/assets/${tryon.id}/detect`, { method: "POST" });
console.log(`detect tryon: ${det2.segments.length} regions in ${((Date.now() - t1) / 1000).toFixed(1)}s →`, det2.segments.map((s) => s.label).join(", "));
const jacket = det.segments[0];
const tryJacket = det2.segments.find((s) => /jacket/i.test(s.label)) ?? det2.segments[0];

const S = { resolution: "1K", aspect: "Auto" };
const JOBS = [
  ["prompt", { prompt: "An editorial shoot for tailored denim on a brutalist rooftop, overcast light" }, { resolution: "1K", aspect: "4:5" }],
  ["sketch-to-render", { sketch: [sketch.id], direction: "Washed indigo denim with copper buttons" }, S],
  ["garment-extractor", { outfit: tryon.id, mask: tryJacket?.maskKey, maskLabel: tryJacket?.label }, S],
  ["concept", { references: [render.id, swatch.id], direction: "A cropped utility jacket for SS27 in teal technical ripstop" }, S],
  ["ghostform", { garment: [recolor.id] }, S],
  ["flatlay", { garment: [render.id] }, S],
  ["garment-recolor", { garment: render.id, mask: jacket?.maskKey, maskLabel: jacket?.label, colors: [{ hex: "#556b2f", name: "Olive" }, { hex: "#7a1f2b", name: "Burgundy" }] }, S],
  ["fabric-swap", { garment: render.id, fabric: [swatch.id] }, S],
  ["model-maker", { description: "Man in his 20s, buzz cut, East Asian, editorial and calm" }, S],
  ["model-try-on", { garment: [render.id], model: model.id }, S],
  ["garment-swap", { base: tryon.id, mask: tryJacket?.maskKey, maskLabel: tryJacket?.label, garment: render.id }, S],
  ["photo-shoot", { look: tryon.id, location: "A misty city park at dawn, soft overcast light" }, S],
  ["multi-angle", { shot: render.id }, S],
  ["region-edit", { image: render.id, mask: jacket?.maskKey, prompt: "make the buttons polished gold" }, S],
  ["remove-background", { image: render.id }, {}],
  ["garment-360", { garment: render.id }, { resolution: "720p", aspect: "Auto" }],
  ["model-360", { look: tryon.id }, { resolution: "720p", aspect: "Auto" }],
].filter(([t]) => !only || only.includes(t));

const results = [];
await Promise.all(
  JOBS.map(async ([tool, inputs, settings]) => {
    try {
      const { run } = await api(`/api/projects/${pid}/runs`, { method: "POST", body: JSON.stringify({ tool, inputs, settings }) });
      const r = await waitRun(run.id);
      results.push([tool, r.run.status, `${r.run.outputs.length}/${r.run.expected}`, `${r.secs.toFixed(0)}s`, r.run.error ?? "", r.run.outputs.map((o) => o.url).join(" ")]);
      console.log(`${r.run.status === "succeeded" && r.run.outputs.length === r.run.expected ? "✓" : "✗"} ${tool} ${r.run.status} ${r.run.outputs.length}/${r.run.expected} ${r.secs.toFixed(0)}s ${r.run.error ?? ""}`);
    } catch (e) {
      results.push([tool, "error", "", "", e.message, ""]);
      console.log(`✗ ${tool} ${e.message}`);
    }
  }),
);
const me = await api("/api/me");
console.log("credits left:", me.credits);
fs.writeFileSync("qa/out/engine.json", JSON.stringify({ pid, results }, null, 2));
const bad = results.filter((r) => r[1] !== "succeeded");
console.log(bad.length ? `FAILED ${bad.length}/${results.length}` : `ALL ${results.length} PASSED`);
process.exitCode = bad.length ? 1 : 0;
