/** Landing page copy — FLORA's structure, rewritten for Canopy Labs (no third-party customer claims). */

export const NAV = [
  {
    label: "Product",
    items: [
      { label: "Canopy Canvas", desc: "The open creative canvas for any workflow", href: "https://app.trycanopy.space" },
      { label: "Fashion Studio", desc: "Sketch to campaign for fashion teams", href: "/" },
      { label: "OnBrand API", desc: "The brand layer for AI agents", href: "https://brand.trycanopy.space" },
    ],
  },
  {
    label: "Solutions",
    items: [
      { label: "Fashion, Retail & Apparel", desc: "Design, recolor and shoot every SKU", href: "#concept" },
      { label: "E-Commerce", desc: "On-model imagery for every colorway", href: "#showcase" },
      { label: "Creative Agencies", desc: "Pressure-test a season before the shoot", href: "#refine" },
    ],
  },
  { label: "Enterprise", href: "mailto:hello@trycanopy.space?subject=Fashion%20Studio%20Enterprise" },
  { label: "Pricing", href: "#faq" },
  {
    label: "Resources",
    items: [
      { label: "FAQ", desc: "Everything you need to know", href: "#faq" },
      { label: "All tools", desc: "What each tool does", href: "#tools" },
      { label: "Support", desc: "Talk to the Canopy team", href: "mailto:hello@trycanopy.space" },
    ],
  },
] as const;

export const WORKFLOW = [
  { n: "01", label: "Sketch", img: "/landing/wf1.jpg" },
  { n: "02", label: "Fabric", img: "/landing/wf2.jpg" },
  { n: "03", label: "Garment Recolor", img: "/landing/wf3.jpg" },
  { n: "04", label: "Model Try-on", img: "/landing/wf4.jpg" },
  { n: "05", label: "360 Video", img: "/landing/wf5.jpg" },
];

export const VALUES = [
  { n: "01", title: "Faster from first sketch", body: "Sketch, render, recolor, and shoot without leaving the Studio. Each tool is connected, so nothing gets exported, re-uploaded, or lost between steps." },
  { n: "02", title: "Get it right before it's real", body: "Set the color, the fabric, and the cut exactly, before anything becomes a sample. The full Canopy canvas is one click away when a piece needs more." },
  { n: "03", title: "Every SKU gets its shot", body: "Built for real fashion work, so a seam stays where you put it and a region edit only touches what you select. Shoot an entire drop without the week-long shoot." },
];

export type Card = { title: string; desc: string; img: string; tool: string; video?: string; mock?: boolean };

export const SECTIONS_COPY: { id: string; n: string; kicker: string; title: string; body: string; cards: Card[] }[] = [
  {
    id: "concept",
    n: "01",
    kicker: "Concept",
    title: "Start with just a sketch",
    body: "Upload a sketch or a photo and see the garment as if it already exists, with the fabric, drape, and fit you envisioned.",
    cards: [
      { title: "Sketch to Render", desc: "A hand sketch becomes a photoreal garment, down to the drape.", img: "/landing/concept-sketch.jpg", tool: "sketch-to-render", mock: true },
      { title: "Prompt", desc: "Write out your idea and start from scratch, no image required.", img: "/landing/concept-prompt.jpg", tool: "prompt" },
    ],
  },
  {
    id: "refine",
    n: "02",
    kicker: "Refine",
    title: "Precision where it counts",
    body: "Recolor a panel, swap the material, or alter the piece. Every change holds the shape and the construction, and the canvas is there when you want to work a seam by hand.",
    cards: [
      { title: "Flatlay", desc: "Turn a ghostform garment into a flatlay, details intact.", img: "/landing/refine-flat.jpg", tool: "flatlay" },
      { title: "Ghostform", desc: "Turn a flatlay into a ghostform with a worn 3D shape.", img: "/landing/refine-ghost.jpg", tool: "ghostform" },
      { title: "Garment Recolor", desc: "Recolors a garment while keeping its shape, texture, and fit unchanged.", img: "/landing/refine-recolor.jpg", tool: "garment-recolor" },
      { title: "Fabric Swap", desc: "Swaps a fabric and generates a new garment with chosen fabric.", img: "/landing/refine-fabric.jpg", tool: "fabric-swap" },
    ],
  },
  {
    id: "showcase",
    n: "03",
    kicker: "Showcase",
    title: "Bring your garment to life",
    body: "Choose a model and the garment, and shoot from as many angles as your campaign needs, without booking a studio day or waiting on a reshoot.",
    cards: [
      { title: "Model Maker", desc: "Generates variations of a model based on age, diversity, and style.", img: "/landing/show-model.jpg", tool: "model-maker" },
      { title: "Photo Shoot", desc: "Creates editorial images from a model with your garment.", img: "/landing/show-photo.jpg", tool: "photo-shoot" },
      { title: "Model Try-on", desc: "Generate production ready renderings of your garment on a model.", img: "/landing/show-tryon.jpg", tool: "model-try-on" },
      { title: "360 Model Video", desc: "Rotate your model in a 360° video, outfit and background intact.", img: "/landing/show-360.jpg", tool: "model-360", video: "/studio/tour/360.mp4" },
    ],
  },
];

export const TOOL_LIST: { col: string; items: { name: string; desc: string; soon?: boolean; tool?: string }[] }[] = [
  {
    col: "Concept",
    items: [
      { name: "Sketch to Render", desc: "A hand sketch becomes a photoreal garment, fabric and drape intact.", tool: "sketch-to-render" },
      { name: "Prompt", desc: "Start from a single text prompt and render your garment with no image needed.", tool: "prompt" },
      { name: "Concept", desc: "Blend reference images and a direction into new design concepts.", tool: "concept" },
      { name: "Garment Extractor", desc: "Pull a garment out of any photo as a clean asset.", tool: "garment-extractor" },
      { name: "Sketch to Vector", desc: "Turn a sketch into a vector image.", soon: true },
      { name: "Garment to Vector", desc: "Turn a garment image into a vector image.", soon: true },
      { name: "Moodboard Maker", desc: "Get a moodboard for your look based off references.", soon: true },
    ],
  },
  {
    col: "Refine",
    items: [
      { name: "Garment Recolor", desc: "Recolors a garment while keeping its shape, texture, and fit intact.", tool: "garment-recolor" },
      { name: "Fabric Swap", desc: "Swaps a fabric and generates a new garment with chosen fabric.", tool: "fabric-swap" },
      { name: "Ghostform", desc: "Turn a flatlay into a ghostform with a worn 3D shape.", tool: "ghostform" },
      { name: "Flatlay", desc: "Turn a ghostform garment into a flatlay, details intact.", tool: "flatlay" },
      { name: "Review Mode", desc: "Collect comments and feedback on selected looks." },
      { name: "Print Pattern", desc: "Generate a pattern with an object and theme.", soon: true },
      { name: "Trim & Patches", desc: "Add hardware, patches and embellishments.", soon: true },
    ],
  },
  {
    col: "Showcase",
    items: [
      { name: "Model Maker", desc: "Generates variations of a model based on age, diversity, and style.", tool: "model-maker" },
      { name: "360 Garment Video", desc: "Takes in a garment (on-model, flatlay, or ghostform) and produces a 3D rendering in video form.", tool: "garment-360" },
      { name: "Garment Swap", desc: "Replace the on-model garment with a new one, holding all else constant.", tool: "garment-swap" },
      { name: "Photo Shoot", desc: "Creates editorial images from a model with your garment.", tool: "photo-shoot" },
      { name: "Model Try-On", desc: "Generate production ready renderings of your garment on a model.", tool: "model-try-on" },
      { name: "Multi-Angle Shoot", desc: "Generates multiple camera angles of the same garment or individual from a single input.", tool: "multi-angle" },
      { name: "360 Model Video", desc: "Rotate your model in a 360° video, outfit and background intact.", tool: "model-360" },
      { name: "Connect to Shopify", desc: "Export to Shopify as product-ready assets.", soon: true },
      { name: "PDP Shots", desc: "Product-page shots for every SKU.", soon: true },
    ],
  },
];

export const FAQ: { q: string; a: string[] }[] = [
  {
    q: "What is Fashion Studio?",
    a: [
      "Fashion Studio is a purpose-built set of AI tools for apparel design and production, covering the whole path from a sketch to a finished campaign image. It sits on top of the Canopy canvas, so anything you make in the studio can be taken into the wider canvas when you want to go deeper, and anything you build on the canvas can feed back in.",
    ],
  },
  {
    q: "What tools are included in Fashion Studio?",
    a: [
      "Fashion Studio currently includes fifteen tools, grouped roughly by where they sit in the creative process. For concepting there is Prompt, Sketch to Render, Concept and Garment Extractor. For refining a garment there is Ghostform, Flatlay, Garment Recolor and Fabric Swap. For campaign work there is Model Maker, Model Try-On, Garment Swap, Photo Shoot, Multi-Angle Shoot, 360 Garment Video and 360 Model Video.",
      "The tools are designed to hand off to each other, so a sketch becomes a render, the render gets recolored and re-fabricated, and the finished garment goes onto a model and into a campaign without leaving the studio. Vector export and tech packs are coming next.",
    ],
  },
  {
    q: "How is Fashion Studio different from the Canopy canvas?",
    a: [
      "The canvas is an open workspace where you wire up any workflow you can imagine, and Fashion Studio is a focused product built on that same engine with the vocabulary and sequence of fashion already baked in. You do not need to build anything or understand nodes to use the studio, because each tool already knows what a flat lay, a ghost form and a colorway are.",
      "Everything you make in the studio stays connected to the canvas, so when a project needs exploration the studio cannot give you, you can open it up there and keep going.",
    ],
  },
  {
    q: "Who is Fashion Studio for?",
    a: [
      "Fashion Studio is built for anyone making apparel, from a solo founder running a Shopify brand to a design team inside a mid-market or luxury label. The tools are shaped around the jobs that repeat regardless of company size.",
      "In practice that means apparel and textile designers who want to see an idea before committing to a sample, ecommerce and content teams who need on-model imagery for every colorway, and creative directors who want to pressure-test a season before a shoot is booked.",
    ],
  },
  {
    q: "Do I own what I create, and can I use it commercially?",
    a: ["Yes. What you make in Fashion Studio is yours to use commercially, including on product pages, in lookbooks, in wholesale decks, in paid advertising and in print."],
  },
  {
    q: "How is Fashion Studio priced, and is it available in all plans?",
    a: [
      "Fashion Studio runs on Canopy credits. Every new account starts with 20 free credits, and every tool shows its credit cost next to the Generate button before you run it — a quick recolor uses far fewer credits than a full campaign video. Failed generations are refunded automatically. For team plans and higher volumes, talk to us.",
    ],
  },
];

export const FOOTER = [
  { title: "Company", links: [["About Canopy", "https://trycanopy.space"], ["Careers", "mailto:hello@trycanopy.space?subject=Careers"], ["Manifesto", "https://trycanopy.space"]] },
  { title: "Product", links: [["Canvas", "https://app.trycanopy.space"], ["Fashion Studio", "/"], ["OnBrand API", "https://brand.trycanopy.space"], ["Pricing", "#faq"]] },
  { title: "Solutions", links: [["Fashion, Retail & Apparel", "#concept"], ["E-Commerce", "#showcase"], ["Creative Agencies", "#refine"]] },
  { title: "Use Cases", links: [["Concepting & moodboards", "#concept"], ["Product visualization", "#refine"], ["Ad & campaign creative", "#showcase"], ["Video & 360 spins", "#showcase"]] },
  { title: "Resources", links: [["FAQ", "#faq"], ["All tools", "#tools"], ["Support", "mailto:hello@trycanopy.space"], ["Status", "/api/health"]] },
] as const;
