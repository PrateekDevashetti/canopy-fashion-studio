/** Probe Recraft vector via OpenRouter on the tour sketch. node --env-file=.env.local --import tsx qa/vector-probe.mts */
import fs from "node:fs/promises";
import { toDataUri } from "../packages/core/src/engine/imaging";

const sketch = await fs.readFile("apps/web/public/studio/tour/sketch.jpg");
const t0 = Date.now();
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({
    model: process.argv[2] ?? "recraft/recraft-v4.1-vector",
    modalities: ["image"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Convert this fashion sketch into a clean vector illustration: crisp black line art on a white background, same garment, same design lines and proportions, no shading." },
          { type: "image_url", image_url: { url: await toDataUri(sketch, 1536) } },
        ],
      },
    ],
  }),
});
const j = await res.json();
const msg = j.choices?.[0]?.message;
const url: string | undefined = msg?.images?.[0]?.image_url?.url;
console.log(JSON.stringify({ status: res.status, ms: Date.now() - t0, err: j.error?.message?.slice(0, 200), mime: url?.slice(0, 40), text: msg?.content?.slice?.(0, 120) }));
if (url) {
  const b64 = url.split(",")[1];
  const buf = url.includes(";base64,") ? Buffer.from(b64, "base64") : Buffer.from(decodeURIComponent(b64));
  await fs.mkdir("qa/out", { recursive: true });
  await fs.writeFile("qa/out/vector-probe" + (url.includes("svg") ? ".svg" : ".png"), buf);
  console.log("bytes", buf.length, buf.subarray(0, 120).toString());
}
