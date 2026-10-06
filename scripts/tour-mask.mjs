// Pre-computes the garment mask used by the onboarding tour's "Select your garment" step.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../apps/web/public/studio/tour");
const img = fs.readFileSync(path.join(ROOT, "render.jpg"));
const meta = await sharp(img).metadata();
const r = await fetch("https://fal.run/fal-ai/sam-3/image", {
  method: "POST",
  headers: { Authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ image_url: `data:image/jpeg;base64,${img.toString("base64")}`, prompt: "jacket", apply_mask: false, max_masks: 1, include_boxes: true, output_format: "png" }),
});
const j = await r.json();
if (!j.masks?.[0]) throw new Error(JSON.stringify(j).slice(0, 300));
const m = Buffer.from(await (await fetch(j.masks[0].url)).arrayBuffer());
const mm = await sharp(m).metadata();
let mask = sharp(m).resize(meta.width, meta.height, { fit: "fill" });
mask = mm.hasAlpha ? mask.extractChannel("alpha") : mask.removeAlpha().greyscale();
await mask.threshold(127).png().toFile(path.join(ROOT, "render-mask.png"));
console.log("box", JSON.stringify(j.boxes?.[0]), meta.width, meta.height);
