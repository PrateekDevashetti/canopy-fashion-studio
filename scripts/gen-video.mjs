// Landing hero loop + tour demo clips via fal Veo 3.1 Fast. Usage: node --env-file=.env.local scripts/gen-video.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../apps/web/public");
const KEY = process.env.FAL_KEY;
const H = { Authorization: `Key ${KEY}`, "content-type": "application/json" };

async function veo(still, prompt, out, aspect = "16:9") {
  if (fs.existsSync(path.join(ROOT, out))) return;
  const img = `data:image/jpeg;base64,${(await sharp(path.join(ROOT, still)).resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer()).toString("base64")}`;
  const sub = await (await fetch("https://queue.fal.run/fal-ai/veo3.1/fast/image-to-video", { method: "POST", headers: H, body: JSON.stringify({ prompt, image_url: img, aspect_ratio: aspect, resolution: "720p", duration: "8s", generate_audio: false }) })).json();
  if (!sub.status_url) throw new Error(JSON.stringify(sub).slice(0, 300));
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await (await fetch(sub.status_url, { headers: H })).json();
    if (s.status === "COMPLETED") break;
    if (s.error) throw new Error(s.error);
  }
  const res = await (await fetch(sub.response_url, { headers: H })).json();
  const buf = Buffer.from(await (await fetch(res.video.url)).arrayBuffer());
  fs.writeFileSync(path.join(ROOT, out), buf);
  console.log("✓", out, (buf.length / 1e6).toFixed(1), "MB");
}

await Promise.all([
  veo("landing/hero.jpg", "Slow cinematic push-in. Wind moves through the long grass and gently ruffles the plaid overshirt draped on the red chair. Dusk light, moody, no people, no camera shake.", "landing/hero.mp4"),
  veo("studio/tour/recolor.jpg", "The jacket slowly rotates a full 360 degrees on an invisible mannequin, studio light, smooth turntable motion.", "studio/tour/360.mp4", "16:9"),
]).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
