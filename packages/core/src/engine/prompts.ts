/** Production prompts for each tool. Kept in one place so they can be tuned and tested. */

const KEEP = "Preserve every construction detail exactly: seams, stitching, panels, pockets, closures, hardware, trims, labels, prints, fabric texture and drape.";

export const P = {
  prompt: (text: string, hasRefs: boolean) =>
    `${text.trim()}${hasRefs ? "\n\nUse the attached images as references for the garment, styling and mood." : ""}\n\nFashion photography quality, accurate fabric rendering, natural light falloff, no text or watermarks.`,

  sketchToRender: (direction?: string) =>
    [
      "Turn this hand-drawn fashion sketch into a photorealistic garment render.",
      "Match the sketch's silhouette, proportions, design lines and every drawn detail exactly — do not add or remove design elements.",
      "Render it as a premium e-commerce product photo: the garment on an invisible ghost mannequin, centered, on a seamless light grey studio background with soft diffused light and a subtle contact shadow.",
      "Choose realistic fabrics and finishes that fit the sketch.",
      direction?.trim() ? `Design direction: ${direction.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" "),

  extract: (label?: string) =>
    [
      `The second image highlights (magenta tint) the garment to extract${label ? `: the ${label}` : ""}.`,
      "Isolate exactly that garment from the outfit and render it alone as a clean ghostform product shot: worn 3D shape on an invisible mannequin, front view, centered, on a pure white seamless background with a soft shadow.",
      "Remove the person, other clothing, and the scene entirely. Reconstruct any parts hidden by arms, hair or other garments so the piece is complete.",
      KEEP,
    ].join(" "),

  concept: (direction: string, variant: number) =>
    [
      `Design a new garment concept: ${direction.trim()}.`,
      "Blend the colors, materials, textures, silhouettes and mood of the reference images into an original design — do not copy any single reference.",
      ["Present it as a ghostform product render on a light studio background.", "Present it on a model in a minimal editorial studio setting, full body.", "Present it as a flatlay on a neutral surface, top-down, with the fabric swatch beside it.", "Present it as a detail-rich three-quarter product render on a warm grey background."][variant % 4],
      "Photorealistic, high-end fashion design presentation, no text.",
    ].join(" "),

  ghostform: () =>
    [
      "Turn this garment into a ghostform (invisible mannequin) product photo: give it a natural worn 3D volume as if worn by an invisible body, front view, centered, on a seamless white studio background with a soft contact shadow.",
      "Show the inside back neck where appropriate. Do not add a person, mannequin or hanger.",
      KEEP,
      "Keep the exact colors.",
    ].join(" "),

  flatlay: () =>
    [
      "Turn this garment into a professional flatlay: laid perfectly flat and neatly arranged, shot straight top-down on a seamless white surface with soft even light and a faint shadow.",
      "Sleeves and legs arranged symmetrically. No person, hanger or mannequin.",
      KEEP,
      "Keep the exact colors.",
    ].join(" "),

  recolor: (color: { hex: string; name?: string }, masked: boolean, label?: string) =>
    [
      `Recolor ${masked ? `only the highlighted ${label ? label.toLowerCase() : "garment area"}` : "the main garment"} to ${color.name ? `${color.name} (${color.hex})` : color.hex}.`,
      "Change the dye color only: keep the exact fabric texture, weave, sheen, folds, shading, highlights, stitching, hardware and shape.",
      "Everything else in the image — skin, background, other garments, lighting, framing — must stay identical.",
    ].join(" "),

  fabric: (masked: boolean, label?: string) =>
    [
      `Re-make ${masked ? `only the highlighted ${label ? label.toLowerCase() : "area"} of the garment` : "the garment"} in the material shown in the swatch image (second image).`,
      "Match the swatch's fiber, weave or knit structure, pattern scale, color, sheen and weight, and let the fabric drape and crease the way that material would.",
      "Keep the garment's silhouette, construction, seams, closures and the rest of the image identical.",
    ].join(" "),

  modelHeadshot: (desc: string, hasRef: boolean) =>
    [
      `Create a fashion model casting headshot: ${desc.trim() || "a professional fashion model"}.`,
      hasRef ? "Base the person's likeness on the reference image." : "",
      "Front-facing, shoulders up, neutral expression, plain light grey studio backdrop, soft beauty lighting, natural skin texture, wearing a plain white tank top. Photorealistic, no retouching artifacts, no text.",
    ]
      .filter(Boolean)
      .join(" "),

  modelHeadshotSheet: () =>
    "Using the person in this image, create a headshot reference sheet: three photos side by side on a light grey studio backdrop — front, three-quarter and full profile — same person, same hair, same lighting, same plain white tank top. Identical identity across all three. Photorealistic, no text or labels.",

  modelBodySheet: () =>
    "Using the person in this image, create a full-body model reference sheet: three full-length photos side by side on a light grey studio backdrop — front, side and back — same person, standing in a neutral pose, wearing a plain white tank top and fitted grey shorts, barefoot. Identical identity and proportions across all three. Photorealistic, no text or labels.",

  tryOn: () =>
    [
      "Dress the model from the first image in the garment from the second image.",
      "Keep the model's face, identity, body, pose, hair, background and lighting exactly as they are.",
      "The garment must fit naturally on the body with realistic drape, tension and shadows, at the right scale.",
      KEEP,
    ].join(" "),

  garmentSwap: (label?: string, description?: string) =>
    [
      `In the first image, replace the highlighted ${label ? label.toLowerCase() : "garment"} (shown in the second image with a magenta tint) with ${description?.trim() ? `this new garment: ${description.trim()}` : "the new garment from the third image"}.`,
      "Keep the model's face, body, pose, hair, other clothing, background and lighting identical. The new garment must fit the body naturally with correct drape and shadows.",
      KEEP,
    ].join(" "),

  photoShoot: (location: string, shot: string) =>
    [
      `Stage an editorial fashion photo of the same model wearing the exact same outfit in a new location: ${location.trim()}.`,
      `Shot: ${shot}.`,
      "Keep the model's identity, hair and every detail of the outfit identical. Natural, believable light for the location, professional campaign photography, no text.",
    ].join(" "),

  angle: (angle: string) =>
    [
      `Reshoot this exact image from a new camera angle: ${angle}.`,
      "Same subject, same garment details, same lighting, same background and styling — only the camera position changes. Photorealistic, consistent identity, no text.",
    ].join(" "),

  regionEdit: (instruction: string) =>
    [
      `Edit only the region highlighted in magenta in the second image: ${instruction.trim()}.`,
      "Return the full first image with that change applied. Keep everything outside the highlighted region identical, and blend the edit seamlessly with matching lighting, perspective and texture. Do not include the magenta highlight in the result.",
    ].join(" "),

  garment360: (hasBack: boolean) =>
    `Turntable product video: the garment rotates a full 360 degrees on an invisible mannequin, smooth constant speed, ${hasBack ? "revealing the back exactly as in the end frame, " : ""}studio background and lighting unchanged, the garment's shape, fabric and every detail stay consistent. No people, no camera shake, no text.`,

  model360: () =>
    "The camera smoothly orbits a full 360 degrees around the model, who stands still in place holding the pose. The outfit, the model's identity and the background stay exactly consistent. Steady cinematic motion, natural light, no cuts, no text.",
};

export const SHOOT_SHOTS = [
  "wide full-body shot, model walking toward camera",
  "medium shot from the waist up, model looking off-camera",
  "full-body three-quarter angle, relaxed standing pose",
  "close detail shot of the garment's texture and construction",
];

export const ANGLES: { name: string; prompt: string }[] = [
  { name: "Front", prompt: "straight-on front view at eye level" },
  { name: "Three-quarter", prompt: "three-quarter view from the left, slightly above eye level" },
  { name: "Profile", prompt: "full side profile view" },
  { name: "Back", prompt: "view from directly behind" },
];

/** Friendly color names for the recolor picker. */
export const NAMED_COLORS: { hex: string; name: string }[] = [
  { hex: "#1f2a44", name: "Navy" },
  { hex: "#111111", name: "Black" },
  { hex: "#f4f1ea", name: "Ecru" },
  { hex: "#7a1f2b", name: "Burgundy" },
  { hex: "#556b2f", name: "Olive" },
  { hex: "#c8553d", name: "Rust" },
  { hex: "#d9a441", name: "Mustard" },
  { hex: "#2f6b4f", name: "Forest green" },
  { hex: "#8fb3d9", name: "Sky blue" },
  { hex: "#e8b4b8", name: "Blush pink" },
  { hex: "#6b4f3a", name: "Chocolate" },
  { hex: "#9a9a9a", name: "Heather grey" },
];
