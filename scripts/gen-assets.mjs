/**
 * Generates every bundled image for the studio + landing page with fal (original, Canopy-owned).
 * Idempotent: skips files that already exist. Usage: node --env-file=.env.local scripts/gen-assets.mjs [filter]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../apps/web/public");
const FAL = process.env.FAL_KEY;
if (!FAL) throw new Error("FAL_KEY missing");
const filter = process.argv[2];

async function fal(endpoint, input, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://fal.run/${endpoint}`, { method: "POST", headers: { Authorization: `Key ${FAL}`, "content-type": "application/json" }, body: JSON.stringify(input) });
    if (r.ok) return r.json();
    const t = await r.text();
    console.warn(`  ${endpoint} ${r.status} ${t.slice(0, 160)}`);
    await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
  }
  throw new Error(`${endpoint} failed`);
}
const dl = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
const uri = async (file) => `data:image/jpeg;base64,${(await sharp(path.join(ROOT, file)).flatten({ background: "#fff" }).resize(1536, 1536, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer()).toString("base64")}`;

const PHOTO = "Photorealistic, high-end fashion photography, natural light, no text, no logos, no watermark.";
const ICON = (thing) => `A single ${thing}, studio product photograph, centered, small and fully in frame with generous margin, soft natural shadow, pure white seamless background, warm neutral tones, photorealistic, no text.`;

/** [file, prompt, opts] — opts: { aspect, res, refs: [files], cutout, size, quality } */
const JOBS = [
  // ---- rail icons (cut out, 192px) ----
  ["studio/icons/prompt.png", ICON("small stack of fashion mood-board photo prints and fabric swatches in tan, rust and cream, fanned out, top-down"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/sketch.png", ICON("cream paper sheet with a light pencil fashion sketch of a t-shirt, slightly curled corner"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/extract.png", ICON("pair of vintage tailor's scissors with brass finger loops, standing upright, slightly open"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/concept.png", ICON("collage of overlapping vintage fashion photos, fabric swatches and a pinned sketch, top-down"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/ghost.png", ICON("cream short-sleeve button-up linen shirt in ghost mannequin style with 3D worn volume"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/flat.png", ICON("cream crew-neck t-shirt laid perfectly flat, top-down flatlay"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/recolor.png", ICON("fanned paint color swatch deck in warm beige, tan, ochre and brown tones"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/fabric.png", ICON("folded stack of three draped fabric pieces in cream linen, taupe wool and grey satin"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/model.png", ICON("vintage wooden and linen tailor's dress form mannequin on a stand"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/tryon.png", ICON("dress form mannequin wearing a light blue cotton sundress"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/swap.png", ICON("rust leather jacket hanging on a wooden hanger"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/photo.png", ICON("vintage tan leather film camera with a brass lens, three-quarter view"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/360.png", ICON("flowing terracotta silk dress in mid twirl on an invisible body, ghost mannequin"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/orbit.png", ICON("slim beige mannequin torso and legs wearing a long camel trench coat"), { aspect: "1:1", cutout: true, size: 192 }],
  ["studio/icons/angle.png", ICON("row of three small framed photographs of the same garment from different angles, propped up"), { aspect: "1:1", cutout: true, size: 192 }],

  // ---- hover previews (640x640) ----
  ["studio/previews/prompt.jpg", `A model's hand lifting the hem of a champagne silk satin gown that billows in a dramatic flowing arc, soft studio light, warm beige background. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/sketch.jpg", "Pencil fashion illustration on cream paper: two elegant 1930s bias-cut evening gowns, front and back view, with handwritten design notes and fabric callouts, graphite shading. No color.", { aspect: "1:1", size: 640 }],
  ["studio/previews/extract.jpg", `Clean ghost-mannequin product photo of a dark indigo denim trucker jacket over khaki chinos, white background. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/concept.jpg", `Red satin kitten-heel pumps with small bows on a worn pale blue wooden floor by a sunny window, scattered rose petals. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/ghost.jpg", `Ghost mannequin product photo of a stone-colored hooded canvas utility jacket with chest pockets, light grey background. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/flat.jpg", `Top-down flatlay of a pleated khaki midi skirt and a blush leather crossbody bag on pale blue tiles. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/recolor.jpg", `A rack of identical quilted puffer vests on hangers in alternating orange and green colorways, shot from the side. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/fabric.jpg", `Stack of quilted diamond-stitched fabric squares in burnt orange, olive, navy and taupe, fanned out on white. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/model.jpg", `Casting portrait of a woman in her late 30s with voluminous curly dark hair and freckles, white tank top, light grey backdrop. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/tryon.jpg", `Young man wearing an off-white zip-front cotton jacket and light wash jeans, standing against a warm beige plaster wall. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/swap.jpg", `Fashion lookbook photo of a male model wearing a dark rinse denim trucker jacket over a plain grey tee, standing among green trees, waist-up. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/photo.jpg", `Young man in a faded red hoodie and a beige cap in a city park with trees, editorial street-style shot. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/360.jpg", `Ghost mannequin product photo of a forest green hooded canvas parka, three-quarter angle, white background. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/orbit.jpg", `Close crop of a model's hand and the flowing skirt of a champagne satin slip dress in motion, soft grey studio. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["studio/previews/angle.jpg", `A woman in a glossy hot-pink puffer jacket and baggy charcoal cargo pants, side profile, white studio. ${PHOTO}`, { aspect: "1:1", size: 640 }],

  // ---- empty-state collage ----
  ["studio/collage/c1.jpg", `Macro detail of a grey nylon technical jacket drawstring toggle and cord. ${PHOTO}`, { aspect: "3:4", size: 420 }],
  ["studio/collage/c2.jpg", `Macro of black and white bonded nylon fabric layers with a zipper edge. ${PHOTO}`, { aspect: "3:4", size: 420 }],
  ["studio/collage/c3.jpg", `Teal technical ripstop fabric with tiny dot perforations, close-up texture. ${PHOTO}`, { aspect: "16:9", size: 560 }],
  ["studio/collage/c4.jpg", `Neon yellow sticky note on a white surface, slight shadow. ${PHOTO}`, { aspect: "4:5", size: 420 }],
  ["studio/collage/c5.jpg", `Portrait of a man with tousled hair in a charcoal technical shell jacket with a neon green zipper pull, white background. ${PHOTO}`, { aspect: "4:5", size: 420 }],
  ["studio/collage/c6.jpg", `Salmon-orange chunky running sneaker, side view, white background. ${PHOTO}`, { aspect: "4:3", size: 420 }],
  ["studio/collage/c7.jpg", `Pencil sketch on cream paper of two long fitted mermaid gowns, front and back, with annotations.`, { aspect: "4:5", size: 420 }],
  ["studio/collage/c8.jpg", `Champagne silk satin gown billowing in a wide sweep, the model's arm visible, warm studio. ${PHOTO}`, { aspect: "16:9", size: 640 }],
  ["studio/collage/c9.jpg", `Back of a woman in a backless champagne satin dress, tall crop, warm light. ${PHOTO}`, { aspect: "9:16", size: 420 }],
  ["studio/collage/c10.jpg", `Gold metallic knit fabric macro, chunky texture. ${PHOTO}`, { aspect: "1:1", size: 360 }],
  ["studio/collage/c11.jpg", `Watercolor and pencil fashion illustration of a woman in a gold cowl-neck satin slip dress, with a pinned fabric swatch.`, { aspect: "3:4", size: 520 }],
  ["studio/collage/c12.jpg", `Male model with bright pink buzz cut in an oversized rust tie-dye tee and black speckled wide trousers, sitting on a stool, white studio. ${PHOTO}`, { aspect: "3:4", size: 520 }],
  ["studio/collage/c13.jpg", `Rust tie-dye oversized t-shirt laid flat, white background. ${PHOTO}`, { aspect: "1:1", size: 360 }],
  ["studio/collage/c14.jpg", `Rust tie-dye sleeveless top on a ghost mannequin, white background. ${PHOTO}`, { aspect: "1:1", size: 360 }],

  // ---- tour chain ----
  ["studio/tour/sketch.jpg", "Pencil sketch on slightly textured white paper of a cropped denim trucker jacket, front view, two chest flap pockets with buttons, button placket, point collar, graphite hatching, hand-drawn fashion design sketch. No color, no text.", { aspect: "1:1", size: 1280 }],
  ["studio/tour/render.jpg", "Turn this hand-drawn fashion sketch into a photorealistic garment render: the exact cropped jacket in mid-blue washed denim, ghost mannequin, centered, light grey seamless studio background, soft shadow. Keep every drawn detail.", { aspect: "1:1", size: 1280, refs: ["studio/tour/sketch.jpg"] }],
  ["studio/tour/recolor.jpg", "Recolor the denim jacket to a washed brown/taupe garment-dyed color. Keep the exact fabric texture, fading, stitching, buttons, shape and background identical.", { aspect: "1:1", size: 1280, refs: ["studio/tour/render.jpg"] }],
  ["studio/tour/model.jpg", `Full-body fashion model reference photo: a woman with curly dark hair, white tank top, fitted black leggings, barefoot, standing straight facing camera, light grey studio. ${PHOTO}`, { aspect: "3:4", size: 1280 }],
  ["studio/tour/tryon.jpg", "Dress the model from the first image in the jacket from the second image, worn open over the tank top. Keep her face, pose, leggings, background and lighting identical; realistic fit and drape.", { aspect: "3:4", size: 1280, refs: ["studio/tour/model.jpg", "studio/tour/recolor.jpg"] }],

  // ---- landing ----
  ["landing/hero.jpg", `Cinematic wide shot: a mustard-and-charcoal plaid flannel overshirt draped over a red molded plastic chair standing alone in a windswept dark green grass field at dusk, moody overcast light, editorial fashion campaign. ${PHOTO}`, { aspect: "16:9", size: 1920, res: "2K" }],
  ["landing/wf1.jpg", `Ghost mannequin product photo of a slate grey technical work jacket with zip chest pockets and flap pockets, white background. ${PHOTO}`, { aspect: "1:1", size: 640 }],
  ["landing/wf2.jpg", "Make this exact jacket in burgundy woven intrecciato leather, same cut, pockets and details, white background.", { aspect: "1:1", size: 640, refs: ["landing/wf1.jpg"] }],
  ["landing/wf3.jpg", "Recolor this woven leather jacket to deep black-green. Keep everything else identical.", { aspect: "1:1", size: 640, refs: ["landing/wf2.jpg"] }],
  ["landing/wf4.jpg", "Four side-by-side full-body views (front, three-quarter, side, back) of a silver-haired man in sunglasses wearing this exact jacket with black trousers and black sneakers, white studio.", { aspect: "1:1", size: 640, refs: ["landing/wf3.jpg"] }],
  ["landing/wf5.jpg", "The same woven leather jacket on an invisible mannequin, seen from the back three-quarter angle, floating, light grey studio.", { aspect: "1:1", size: 640, refs: ["landing/wf3.jpg"] }],
  ["landing/concept-sketch.jpg", `Off-white wool zip-front cardigan jacket, close crop on the collar and zipper, white background. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/concept-prompt.jpg", `Futuristic chunky running sneaker in translucent mint green and black with sculpted TPU cage and bungee laces, side view, white background. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/refine-flat.jpg", `Black technical utility vest laid flat, top-down flatlay with zip and cargo pockets, white background. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/refine-ghost.jpg", `Fluffy mohair crew-neck sweater fading from pale pink to raspberry, ghost mannequin, light grey background. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/refine-recolor.jpg", `Fashion lookbook photo: a forest green linen midi dress with a gathered skirt and square neckline, worn by a model walking through a sunlit concrete courtyard with a potted olive tree, full length. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/refine-fabric.jpg", `Model posing in a ruffled navy and cream ikat-print silk jumpsuit, white studio. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/show-model.jpg", `Model reference sheet: three full-body photos (side, front, back) of a woman with a black bob in an orange puffer vest, navy sweater and raw denim jeans, white studio. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/show-photo.jpg", `Close editorial crop of a seated man in a rust tie-dye tee and black speckled wide trousers, hands resting on knees. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/show-tryon.jpg", `Woman with a black bob in a grey technical shell jacket lacing neon yellow boots, sitting on a white plinth, pale pink studio. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/show-360.jpg", `Woman with long black hair in a brown pinstripe chore jacket and cream lace skirt walking past a white wall on a brick pavement. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
  ["landing/footer.jpg", "Dark moody macro photograph of lilac flowers and branches in low light, deep shadows, soft bokeh, dusky purple and amber tones, painterly.", { aspect: "16:9", size: 1920 }],
  ["landing/og.jpg", `Editorial fashion campaign image: a plaid overshirt on a red chair in a grass field at dusk. ${PHOTO}`, { aspect: "16:9", size: 1200 }],
];

async function job([file, prompt, o]) {
  const out = path.join(ROOT, file);
  if (fs.existsSync(out)) return;
  if (filter && !file.includes(filter)) return;
  for (const r of o.refs ?? []) {
    for (let i = 0; i < 120 && !fs.existsSync(path.join(ROOT, r)); i++) await new Promise((res) => setTimeout(res, 2000));
  }
  const base = { prompt, num_images: 1, aspect_ratio: o.aspect ?? "1:1", resolution: o.res ?? "1K", output_format: "png" };
  const res = o.refs?.length ? await fal("fal-ai/nano-banana-2/edit", { ...base, image_urls: await Promise.all(o.refs.map(uri)) }) : await fal("fal-ai/nano-banana-2", base);
  let buf = await dl(res.images[0].url);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (o.cutout) {
    const cut = await fal("fal-ai/birefnet/v2", { image_url: `data:image/png;base64,${buf.toString("base64")}`, output_format: "png" });
    buf = await dl(cut.image.url);
    await sharp(buf).trim({ threshold: 1 }).resize(o.size, o.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
  } else {
    await sharp(buf).resize(o.size, o.size, { fit: "inside" }).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
  }
  console.log("✓", file);
}

const queue = [...JOBS];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const j = queue.shift();
      try {
        await job(j);
      } catch (e) {
        console.error("✗", j[0], e.message);
      }
    }
  }),
);
console.log("done");
