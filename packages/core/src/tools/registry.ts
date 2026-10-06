/**
 * Fashion Studio tool registry — the single source of truth for the tool rail,
 * the settings panel, the generation engine and pricing. Pure data: safe to
 * import from client components.
 */

export type Section = "concept" | "refine" | "showcase";

export type ModelId =
  | "nano-banana-pro"
  | "nano-banana-2"
  | "seedream-4-5"
  | "fashn-tryon"
  | "gemini-flash-3-6"
  | "sam-3"
  | "birefnet"
  | "veo-3-1"
  | "veo-3-1-fast"
  | "kling-3"
  | "seedream-5-pro"
  | "seedance-2-5"
  | "canopy-vectorizer";

/** Every model the studio can call, with why it was picked (see docs/PRD.md §5). */
export const MODELS: Record<ModelId, { label: string; kind: "image" | "vision" | "video" | "matting" | "tryon"; why: string }> = {
  "nano-banana-pro": { label: "Nano Banana Pro", kind: "image", why: "Highest fidelity edits: keeps identity, construction and materials." },
  "nano-banana-2": { label: "Nano Banana 2", kind: "image", why: "Fast, faithful local edits such as recolors." },
  "seedream-4-5": { label: "Seedream 4.5", kind: "image", why: "Best multi-reference blending for new concepts." },
  "fashn-tryon": { label: "FASHN Try-On 1.6", kind: "tryon", why: "Purpose-built virtual try-on that keeps prints, logos and fit." },
  "gemini-flash-3-6": { label: "Gemini Flash 3.6", kind: "vision", why: "Finds and names every garment part." },
  "sam-3": { label: "SAM 3", kind: "vision", why: "Pixel-accurate garment masks." },
  birefnet: { label: "BiRefNet", kind: "matting", why: "Clean cut-outs with fine fabric edges." },
  "veo-3-1": { label: "Veo 3.1", kind: "video", why: "Smooth, consistent product turntables." },
  "veo-3-1-fast": { label: "Veo 3.1 Fast", kind: "video", why: "Quick on-model orbits." },
  "kling-3": { label: "Kling 3.0 Pro", kind: "video", why: "Start-to-end frame control for front-to-back spins." },
  "seedream-5-pro": { label: "Seedream 5.0 Pro", kind: "image", why: "Commercial-grade multi-reference composition for moodboards." },
  "seedance-2-5": { label: "Seedance 2.5", kind: "video", why: "Long, steady image-to-video fallback with first/last-frame control." },
  "canopy-vectorizer": { label: "Canopy Vectorizer", kind: "image", why: "Deterministic tracing to clean SVG paths — no invented detail." },
};

export type InputSpec =
  | {
      kind: "image";
      key: string;
      label: string;
      info?: string;
      /** Shows the "Optional" tag: left empty, the input falls back to the image open in the editor ("Applying to …"). */
      optional?: boolean;
      /** Required inputs still auto-bind to the open image when the tool opens. */
      bindActive?: boolean;
      /** May be submitted empty (no fallback to the open image). */
      allowEmpty?: boolean;
      /** Collection inputs batch one generation per item… */
      collection?: boolean;
      /** …unless they're blended together into each output (references). */
      blend?: boolean;
      max?: number;
    }
  | { kind: "mask"; key: string; label: string; info?: string; of: string; optional?: boolean }
  | { kind: "text"; key: string; label: string; placeholder: string; optional?: boolean; examples?: string[]; rows?: number }
  | { kind: "color"; key: string; label: string; collection?: boolean; optional?: boolean }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[]; default: string };

export type Tool = {
  id: string;
  name: string;
  short: string;
  section: Section;
  description: string;
  /** Longer copy used on the landing page tool list. */
  blurb: string;
  icon: string;
  preview: string;
  media: "image" | "video";
  models: ModelId[];
  /** Credits per output. */
  cost: number;
  /** Outputs per input item (Model Maker makes three sheets, Multi-Angle four angles…). */
  outputs: number;
  inputs: InputSpec[];
  resolutions: string[];
  aspects: string[];
  defaultAspect: string;
  isNew?: boolean;
  /** Non-generation tools render their own panel instead of inputs + Generate. */
  panel?: "review" | "shopify";
};

export type SoonTool = { id: string; name: string; short: string; section: Section; description: string };

const IMG_RES = ["1K", "2K", "4K"];
const VID_RES = ["720p", "1080p"];
const ASPECTS = ["Auto", "1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "3:2", "4:3", "5:4"];

const garment = (label = "Garment", info = "The garment image to work from."): InputSpec => ({
  kind: "image",
  key: "garment",
  label,
  info,
  bindActive: true,
});

export const TOOLS: Tool[] = [
  {
    id: "prompt",
    name: "Prompt",
    short: "Prompt",
    section: "concept",
    description: "Generate any image",
    blurb: "Start from a single text prompt and render your garment with no image needed.",
    icon: "/studio/icons/prompt.png",
    preview: "/studio/previews/prompt.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 1,
    inputs: [
      {
        kind: "text",
        key: "prompt",
        label: "Prompt",
        placeholder: 'Try "An editorial shoot for tailored denim on a brutalist rooftop, overcast light"',
        rows: 4,
      },
      { kind: "image", key: "references", label: "References", optional: true, allowEmpty: true, collection: true, blend: true, max: 6 },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS.filter((a) => a !== "Auto"),
    defaultAspect: "4:5",
  },
  {
    id: "sketch-to-render",
    name: "Sketch to Render",
    short: "Sketch",
    section: "concept",
    description: "Turns a hand-drawn fashion sketch into a photorealistic garment render.",
    blurb: "A hand sketch becomes a photoreal garment, fabric and drape intact.",
    icon: "/studio/icons/sketch.png",
    preview: "/studio/previews/sketch.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 1,
    isNew: true,
    inputs: [
      { kind: "image", key: "sketch", label: "Sketch", info: "A hand-drawn sketch or technical flat.", bindActive: true, collection: true, max: 8 },
      {
        kind: "text",
        key: "direction",
        label: "Design Direction",
        optional: true,
        rows: 4,
        placeholder: "Describe fabric, finish and details…",
        examples: [
          "Render any embellished details—beading, sequins, or jeweled accents—with dimensional depth and selective light reflection. The finish should read as couture.",
          "Heavyweight washed cotton canvas, tonal topstitching, matte horn buttons, softly lived-in.",
          "Technical nylon shell with a subtle sheen, bonded seams and matte black hardware.",
        ],
      },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "garment-extractor",
    name: "Garment Extractor",
    short: "Extract",
    section: "concept",
    description: "Isolate any garment from an outfit as a clean ghostform.",
    blurb: "Pull a garment out of any photo as a clean asset.",
    icon: "/studio/icons/extract.png",
    preview: "/studio/previews/extract.jpg",
    media: "image",
    models: ["gemini-flash-3-6", "sam-3", "nano-banana-pro"],
    cost: 6,
    outputs: 1,
    inputs: [
      { kind: "image", key: "outfit", label: "Outfit", optional: true },
      { kind: "mask", key: "mask", label: "Mask", of: "outfit", info: "Pick the garment to extract. Select on image or choose a detected region." },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "concept",
    name: "Concept",
    short: "Concept",
    section: "concept",
    description: "Blend reference images and a direction into new design concepts.",
    blurb: "Blend reference images and a direction into new design concepts.",
    icon: "/studio/icons/concept.png",
    preview: "/studio/previews/concept.jpg",
    media: "image",
    models: ["seedream-4-5", "nano-banana-pro"],
    cost: 4,
    outputs: 4,
    inputs: [
      { kind: "image", key: "references", label: "References", info: "Moodboard images, swatches, silhouettes.", collection: true, blend: true, max: 6, bindActive: true },
      {
        kind: "text",
        key: "direction",
        label: "Direction",
        placeholder: "What are you designing? e.g. a cropped utility jacket for SS27",
        rows: 3,
        examples: ["A cropped utility jacket for SS27 in washed olive canvas", "Evening slip dress inspired by these textures, bias cut"],
      },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "ghostform",
    name: "Ghostform",
    short: "Ghost",
    section: "refine",
    description: "Turn a flatlay into a ghostform with a worn 3D shape.",
    blurb: "Turn a flatlay into a ghostform with a worn 3D shape.",
    icon: "/studio/icons/ghost.png",
    preview: "/studio/previews/ghost.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 1,
    inputs: [{ ...garment(), collection: true, max: 12 } as InputSpec],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "flatlay",
    name: "Flatlay",
    short: "Flat",
    section: "refine",
    description: "Turn a ghostform garment into a flatlay, details intact.",
    blurb: "Turn a ghostform garment into a flatlay, details intact.",
    icon: "/studio/icons/flat.png",
    preview: "/studio/previews/flat.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 1,
    inputs: [{ ...garment(), collection: true, max: 12 } as InputSpec],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "garment-recolor",
    name: "Garment Recolor",
    short: "Recolor",
    section: "refine",
    description: "Change a garment's color — on-model, flatlay, or ghostform.",
    blurb: "Recolors a garment while keeping its shape, texture, and fit intact.",
    icon: "/studio/icons/recolor.png",
    preview: "/studio/previews/recolor.jpg",
    media: "image",
    models: ["nano-banana-2"],
    cost: 4,
    outputs: 1,
    isNew: true,
    inputs: [
      { kind: "image", key: "garment", label: "Garment", info: "On-model, flatlay or ghostform.", optional: true },
      { kind: "mask", key: "mask", label: "Mask", of: "garment", optional: true },
      { kind: "color", key: "colors", label: "Color", collection: true },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "fabric-swap",
    name: "Fabric Swap",
    short: "Fabric",
    section: "refine",
    description: "Swap a garment's material for any fabric swatch you drop in.",
    blurb: "Swaps a fabric and generates a new garment with chosen fabric.",
    icon: "/studio/icons/fabric.png",
    preview: "/studio/previews/fabric.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 1,
    inputs: [
      { kind: "image", key: "garment", label: "Garment", optional: true },
      { kind: "mask", key: "mask", label: "Mask", of: "garment", optional: true },
      { kind: "image", key: "fabric", label: "Fabric Swatch", info: "A photo of the fabric or swatch.", collection: true, max: 8 },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "model-maker",
    name: "Model Maker",
    short: "Model",
    section: "showcase",
    description: "Create a model with a headshot, headshot sheet, and body sheet.",
    blurb: "Generates variations of a model based on age, diversity, and style.",
    icon: "/studio/icons/model.png",
    preview: "/studio/previews/model.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 3,
    inputs: [
      {
        kind: "text",
        key: "description",
        label: "Model",
        placeholder: "Describe the model — age, look, hair, styling…",
        rows: 4,
        examples: ["Woman in her late 30s, curly dark hair, freckles, natural makeup", "Man in his 20s, buzz cut, East Asian, editorial and calm"],
      },
      { kind: "image", key: "reference", label: "Reference", optional: true, allowEmpty: true },
    ],
    resolutions: IMG_RES,
    aspects: ["Auto"],
    defaultAspect: "Auto",
  },
  {
    id: "model-try-on",
    name: "Model Try-On",
    short: "Try-On",
    section: "showcase",
    description: "Takes in a model and a garment — flatlay, or ghostform, and generates that garment on a model",
    blurb: "Generate production ready renderings of your garment on a model.",
    icon: "/studio/icons/tryon.png",
    preview: "/studio/previews/tryon.jpg",
    media: "image",
    models: ["fashn-tryon"],
    cost: 6,
    outputs: 1,
    inputs: [
      { kind: "image", key: "garment", label: "Garment", info: "Flatlay or ghostform.", bindActive: true, collection: true, max: 8 },
      { kind: "image", key: "model", label: "Model", info: "A photo or sheet of the model." },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "garment-swap",
    name: "Garment Swap",
    short: "Swap",
    section: "showcase",
    description: "Swap a garment on a model from one image to another.",
    blurb: "Replace the on-model garment with a new one, holding all else constant.",
    icon: "/studio/icons/swap.png",
    preview: "/studio/previews/swap.jpg",
    media: "image",
    models: ["fashn-tryon", "nano-banana-pro"],
    cost: 6,
    outputs: 1,
    inputs: [
      { kind: "image", key: "base", label: "Base Model Photo", optional: true },
      { kind: "mask", key: "mask", label: "Mask", of: "base", info: "The garment to replace." },
      { kind: "image", key: "garment", label: "New Garment", info: "The garment to put on the model.", optional: true, allowEmpty: true },
      { kind: "text", key: "description", label: "Or describe it", optional: true, rows: 2, placeholder: "e.g. an oversized cream cable-knit sweater" },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "photo-shoot",
    name: "Photo Shoot",
    short: "Photo",
    section: "showcase",
    description: "Stage a full shoot: same model, new location, matching angles.",
    blurb: "Creates editorial images from a model with your garment.",
    icon: "/studio/icons/photo.png",
    preview: "/studio/previews/photo.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 4,
    inputs: [
      { kind: "image", key: "look", label: "Look", info: "The model wearing the garment.", bindActive: true },
      {
        kind: "text",
        key: "location",
        label: "Location",
        placeholder: "Where is the shoot? e.g. a misty park at dawn",
        rows: 3,
        examples: ["A misty city park at dawn, soft overcast light", "Brutalist concrete rooftop, hard afternoon sun", "Minimal white cyclorama studio"],
      },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },
  {
    id: "garment-360",
    name: "360 Garment Video",
    short: "360",
    section: "showcase",
    description: "Takes in a garment — on-model, flatlay, or ghostform — and produces a 3D rendering of the garment in video form.",
    blurb: "Takes in a garment (on-model, flatlay, or ghostform) and produces a 3D rendering in video form.",
    icon: "/studio/icons/360.png",
    preview: "/studio/previews/360.jpg",
    media: "video",
    models: ["veo-3-1", "kling-3"],
    cost: 40,
    outputs: 1,
    isNew: true,
    inputs: [
      { kind: "image", key: "garment", label: "Base Garment", info: "Front view of the garment.", bindActive: true },
      { kind: "image", key: "back", label: "Backview", optional: true, allowEmpty: true },
    ],
    resolutions: VID_RES,
    aspects: ["Auto", "1:1", "9:16", "16:9"],
    defaultAspect: "Auto",
  },
  {
    id: "model-360",
    name: "360 Model Video",
    short: "Orbit",
    section: "showcase",
    description: "Rotate your model in a 360° video, outfit and background intact.",
    blurb: "Rotate your model in a 360° video, outfit and background intact.",
    icon: "/studio/icons/orbit.png",
    preview: "/studio/previews/orbit.jpg",
    media: "video",
    models: ["veo-3-1-fast", "kling-3"],
    cost: 30,
    outputs: 1,
    inputs: [{ kind: "image", key: "look", label: "Model", info: "A full-body photo of the model.", bindActive: true }],
    resolutions: VID_RES,
    aspects: ["Auto", "1:1", "9:16", "16:9"],
    defaultAspect: "Auto",
  },
  {
    id: "multi-angle",
    name: "Multi-Angle Shoot",
    short: "Angle",
    section: "showcase",
    description: "Generate alternate camera angles of the same shot.",
    blurb: "Generates multiple camera angles of the same garment or individual from a single input.",
    icon: "/studio/icons/angle.png",
    preview: "/studio/previews/angle.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 4,
    inputs: [{ kind: "image", key: "shot", label: "Shot", info: "The image to reshoot from new angles.", bindActive: true }],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },

  {
    id: "sketch-to-vector",
    name: "Sketch to Vector",
    short: "Vector",
    section: "concept",
    description: "Turn a sketch into a vector image.",
    blurb: "Turn a sketch into a clean, editable SVG — every line traced, nothing invented.",
    icon: "/studio/icons/vector.png",
    preview: "/studio/previews/vector.jpg",
    media: "image",
    models: ["nano-banana-pro", "canopy-vectorizer"],
    cost: 4,
    outputs: 1,
    isNew: true,
    inputs: [
      { kind: "image", key: "sketch", label: "Sketch", info: "A hand sketch, photo of a sketch or technical drawing.", bindActive: true, collection: true, max: 8 },
      {
        kind: "select",
        key: "style",
        label: "Style",
        options: [
          { value: "line", label: "Clean line art" },
          { value: "flat", label: "Flat colour" },
        ],
        default: "line",
      },
    ],
    resolutions: ["SVG"],
    aspects: ["Auto"],
    defaultAspect: "Auto",
  },
  {
    id: "garment-to-vector",
    name: "Garment to Vector",
    short: "Flats",
    section: "concept",
    description: "Turn a garment image into a vector image.",
    blurb: "Turn any garment photo into a vector technical flat, ready for tech packs.",
    icon: "/studio/icons/garment-vector.png",
    preview: "/studio/previews/garment-vector.jpg",
    media: "image",
    models: ["nano-banana-pro", "canopy-vectorizer"],
    cost: 4,
    outputs: 1,
    isNew: true,
    inputs: [
      { ...garment("Garment", "On-model, flatlay or ghostform photo."), collection: true, max: 8 } as InputSpec,
      {
        kind: "select",
        key: "style",
        label: "Style",
        options: [
          { value: "flat", label: "Colour flat" },
          { value: "line", label: "Line flat (tech pack)" },
        ],
        default: "flat",
      },
    ],
    resolutions: ["SVG"],
    aspects: ["Auto"],
    defaultAspect: "Auto",
  },
  {
    id: "moodboard-maker",
    name: "Moodboard Maker",
    short: "Mood",
    section: "concept",
    description: "Get a moodboard for your look based off references.",
    blurb: "Drop in references and get editorial moodboards with palette, materials and mood.",
    icon: "/studio/icons/mood.png",
    preview: "/studio/previews/mood.jpg",
    media: "image",
    models: ["seedream-5-pro", "nano-banana-pro"],
    cost: 6,
    outputs: 2,
    isNew: true,
    inputs: [
      { kind: "image", key: "references", label: "References", info: "Looks, fabrics, places, colours.", collection: true, blend: true, max: 10 },
      {
        kind: "text",
        key: "direction",
        label: "Direction",
        optional: true,
        rows: 3,
        placeholder: "e.g. Coastal workwear for SS27, salt-faded indigo, rope and canvas",
        examples: ["Coastal workwear for SS27, salt-faded indigo, rope and canvas", "90s minimalism, slip dresses, cool greys and silver", "Desert utility, sand and olive, washed nylon"],
      },
    ],
    resolutions: IMG_RES,
    aspects: ["16:9", "3:2", "4:3", "1:1"],
    defaultAspect: "16:9",
  },

  {
    id: "review-mode",
    name: "Review Mode",
    short: "Review",
    section: "refine",
    description: "Collect comments and feedback on selected looks.",
    blurb: "Share looks for review and collect comments and approvals in one place.",
    icon: "/studio/icons/review.png",
    preview: "/studio/previews/review.jpg",
    media: "image",
    models: [],
    cost: 0,
    outputs: 0,
    panel: "review",
    inputs: [],
    resolutions: ["1K"],
    aspects: ["Auto"],
    defaultAspect: "Auto",
  },
  {
    id: "print-pattern",
    name: "Print Pattern",
    short: "Print",
    section: "refine",
    description: "Generate a pattern with an object and theme.",
    blurb: "Generate seamless, tileable prints from an object and a theme.",
    icon: "/studio/icons/print.png",
    preview: "/studio/previews/print.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 2,
    isNew: true,
    inputs: [
      { kind: "text", key: "object", label: "Object", placeholder: "e.g. lemons with leaves", rows: 2, examples: ["Lemons with leaves", "Tiny anchors and rope knots", "Wild poppies"] },
      { kind: "text", key: "theme", label: "Theme", placeholder: "e.g. 70s Riviera, faded, two-colour", rows: 2, examples: ["70s Riviera, faded, two-colour", "Japanese block print, indigo on ecru", "Bold Memphis, primary colours"] },
      { kind: "image", key: "reference", label: "Reference", optional: true, allowEmpty: true },
    ],
    resolutions: IMG_RES,
    aspects: ["1:1"],
    defaultAspect: "1:1",
  },
  {
    id: "trim-patches",
    name: "Trim & Patches",
    short: "Trims",
    section: "refine",
    description: "Add hardware, patches and embellishments.",
    blurb: "Add hardware, patches and embellishments exactly where you want them.",
    icon: "/studio/icons/trims.png",
    preview: "/studio/previews/trims.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 6,
    outputs: 1,
    isNew: true,
    inputs: [
      { kind: "image", key: "garment", label: "Garment", optional: true },
      { kind: "mask", key: "mask", label: "Placement", of: "garment", optional: true, info: "Where the trim goes. Leave empty to let the model place it." },
      {
        kind: "text",
        key: "trim",
        label: "Trim",
        placeholder: "e.g. a round embroidered patch with a sun, gold metal snap buttons",
        rows: 3,
        examples: ["Round embroidered sun patch on the left chest", "Antique brass snap buttons", "Pearl embellishment along the collar"],
      },
      { kind: "image", key: "reference", label: "Patch / logo", optional: true, allowEmpty: true, info: "Artwork for the patch, logo or hardware." },
    ],
    resolutions: IMG_RES,
    aspects: ASPECTS,
    defaultAspect: "Auto",
  },

  {
    id: "connect-shopify",
    name: "Connect to Shopify",
    short: "Shopify",
    section: "showcase",
    description: "Export to Shopify as product-ready assets.",
    blurb: "Send looks straight to a Shopify product as product-ready images.",
    icon: "/studio/icons/shopify.png",
    preview: "/studio/previews/shopify.jpg",
    media: "image",
    models: [],
    cost: 0,
    outputs: 0,
    panel: "shopify",
    inputs: [],
    resolutions: ["1K"],
    aspects: ["Auto"],
    defaultAspect: "Auto",
  },
  {
    id: "pdp-shots",
    name: "PDP Shots",
    short: "PDP",
    section: "showcase",
    description: "Product-page shots for every SKU.",
    blurb: "A full product-page set — packshot, angle, detail and on-model — on one consistent background.",
    icon: "/studio/icons/pdp.png",
    preview: "/studio/previews/pdp.jpg",
    media: "image",
    models: ["nano-banana-pro"],
    cost: 5,
    outputs: 4,
    isNew: true,
    inputs: [
      { kind: "image", key: "garment", label: "Garment", info: "Flatlay, ghostform or on-model.", bindActive: true, collection: true, max: 6 },
      { kind: "image", key: "model", label: "Model", optional: true, allowEmpty: true, info: "Optional: the model for the on-model shot." },
      {
        kind: "select",
        key: "background",
        label: "Background",
        options: [
          { value: "white", label: "Pure white" },
          { value: "grey", label: "Light grey" },
          { value: "warm", label: "Warm stone" },
        ],
        default: "white",
      },
    ],
    resolutions: IMG_RES,
    aspects: ["4:5", "3:4", "1:1"],
    defaultAspect: "4:5",
  },
];

/** Rail order (matches the product's tool list). */
const ORDER = [
  "prompt", "sketch-to-render", "garment-extractor", "concept", "sketch-to-vector", "garment-to-vector", "moodboard-maker",
  "garment-recolor", "fabric-swap", "ghostform", "flatlay", "review-mode", "print-pattern", "trim-patches",
  "model-maker", "garment-360", "garment-swap", "photo-shoot", "model-try-on", "multi-angle", "model-360", "connect-shopify", "pdp-shots",
];
TOOLS.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

/** Everything that was "coming soon" has shipped; kept for future roadmap entries. */
export const SOON: SoonTool[] = [];

/** Built-in editor operations that also land in the feed as runs. */
export const EDITOR_OPS = {
  "region-edit": { name: "Region Edit", label: "Region edited", cost: 6, models: ["nano-banana-pro"] as ModelId[] },
  "remove-background": { name: "Remove Background", label: "Background removed", cost: 1, models: ["birefnet"] as ModelId[] },
  crop: { name: "Crop", label: "Cropped", cost: 0, models: [] as ModelId[] },
  adjust: { name: "Adjustments", label: "Adjusted", cost: 0, models: [] as ModelId[] },
  annotate: { name: "Annotate", label: "Annotated", cost: 0, models: [] as ModelId[] },
  upload: { name: "Upload", label: "Upload", cost: 0, models: [] as ModelId[] },
} as const;

export type EditorOp = keyof typeof EDITOR_OPS;

export const SECTIONS: { id: Section; label: string }[] = [
  { id: "concept", label: "Concept" },
  { id: "refine", label: "Refine" },
  { id: "showcase", label: "Showcase" },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

export function runLabel(tool: string): string {
  const t = toolById(tool);
  if (t) return t.name;
  return (EDITOR_OPS as Record<string, { label: string }>)[tool]?.label ?? tool;
}

/** How many items a run batches over: the largest collection input (≥1). */
export function batchSize(tool: Tool, inputs: Record<string, unknown>): number {
  let n = 1;
  for (const spec of tool.inputs) {
    if ((spec.kind === "image" || spec.kind === "color") && spec.collection && !(spec.kind === "image" && spec.blend)) {
      const v = inputs[spec.key];
      if (Array.isArray(v) && v.length > 0) n = Math.max(n, v.length);
    }
  }
  return n;
}

export function runCost(tool: Tool, inputs: Record<string, unknown>, resolution?: string): number {
  const res = resolution === "4K" ? 2 : 1;
  return tool.cost * tool.outputs * batchSize(tool, inputs) * res;
}

/** Does this image input take the open editor image when left empty? */
export const bindsActive = (spec: InputSpec) => spec.kind === "image" && !spec.allowEmpty && Boolean(spec.optional || spec.bindActive);

/** Whole-run validation shared by the API and the settings panel. Returns the first problem, or null. */
export function validateInputs(tool: Tool, inputs: Record<string, unknown>): string | null {
  const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  for (const spec of tool.inputs) {
    const v = inputs[spec.key];
    const empty = isEmpty(v);
    if (spec.kind === "image") {
      if (empty && !spec.allowEmpty) return `Add ${spec.label.toLowerCase()} first`;
      if (spec.max && Array.isArray(v) && v.length > spec.max) return `Up to ${spec.max} ${spec.label.toLowerCase()} per run`;
    } else if (spec.kind === "text") {
      if (empty && !spec.optional) return `Add ${spec.label.toLowerCase()} first`;
    } else if (spec.kind === "color") {
      if (empty && !spec.optional) return "Choose a color";
    } else if (spec.kind === "mask") {
      if (empty && !spec.optional) return "Select the garment on the image";
    }
  }
  if (tool.id === "garment-swap" && isEmpty(inputs.garment) && isEmpty(inputs.description)) return "Add the new garment or describe it";
  if (tool.id === "garment-recolor" && Array.isArray(inputs.colors) && inputs.colors.length > 12) return "Up to 12 colors per run";
  return null;
}
