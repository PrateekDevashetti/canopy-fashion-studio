# Fashion Studio by Canopy Labs — PRD

_Owner: Canopy Labs · Status: building · Last updated: 2026-10-06_

## 1. Summary

Fashion Studio is a focused workspace for fashion teams: turn sketches into renders, recolor and re-fabric
garments, dress models, and shoot campaigns — then review everything in one feed. It is a Canopy Labs
product that sits next to the Canopy canvas (`app.trycanopy.space`), shares its sign-in (same Clerk
instance), and can hand any result to the canvas.

Reference: the FLORA Fashion Studio (43 product screenshots, 16 landing screenshots, onboarding recording,
docs page) — matched for layout and behavior, rebranded to Canopy Labs with original imagery.

## 2. Goals / non-goals

**Goals**
- ≥ 99% functional parity with the reference studio: every tool, editor operation, feed action and flow works for real (real models, real storage, real credits).
- Visual parity with the reference screenshots (measured by `qa/compare.py`).
- Production deployment: Vercel (web), Railway (worker), Neon (Postgres), Cloudflare R2 (files), Clerk (auth) — the same providers as the Canopy canvas.
- Nothing breaks: every generation path has retries, fallbacks, refunds, and recovery.

**Non-goals (v1)**
- Using FLORA's photos, video, logos, or customer logos. All imagery is generated for Canopy.
- Tech-pack export, Shopify export, Dropbox/Drive export (listed as "Soon").
- Real-time multiplayer cursors (collaboration = shared projects + polling feed).

## 3. Users
Apparel/textile designers, e-commerce & content teams, creative directors, solo founders.

## 4. Surfaces

### 4.1 Landing (`/`)
Clone of the reference marketing page with Canopy branding: sticky nav (Product, Solutions, Enterprise,
Pricing, Resources dropdowns; Contact sales; Get started for free), hero ("INTRODUCING / *Fashion Studio* /
Take your idea from sketch to finished campaign, all in one place." on a looping video backdrop, Go to
Fashion Studio + Contact sales), "Built for design teams" row (truthful — no third-party customer logos),
workflow strip (5 steps with arrows), three value props, 01 Concept / 02 Refine / 03 Showcase card grids
with "TRY IT NOW →" deep links into each tool, "Every tool you need to make it real." 3-column tool list
with SOON badges, FAQ accordion (6 questions), "Fashion is pain. Canopy is seamless." CTA, footer with
columns and the Canopy mark.

### 4.2 Studios dashboard (`/studios`)
Studios tab with the Fashion Studio card (click → most recent project or a new one; ⋯ → Open last edited /
New project), project grid with covers and a **Studio** badge, search, rename, delete.

### 4.3 Studio (`/studio/[projectId]`)
Three panels.
- **Top bar:** Canopy mark, project name + ⋯ menu (rename, new project, switch project, members, delete),
  "🔒 Private · {name}'s workspace". Center toolbar when an image is open: Select (V) · Selection ▾
  (Lasso L, Brush B, Auto detect A, Square S) · Annotate ▾ (Text, Draw, Shapes) · Crop · Adjustments ·
  Remove background · Open in Canvas · Download · Send/Share · Editor (E) / Feed (F). Right: info toggle,
  zoom % ▾.
- **Tool rail (left):** Library + Upload tiles; sections Concept (Prompt, Sketch, Extract, Concept), Refine
  (Ghost, Flat, Recolor, Fabric), Showcase (Model, Try-On, Swap, Photo, 360, Orbit, Angle); "new" dots;
  hover preview card (image + name + description); Soon tools dimmed.
- **Canvas (center):** zoom/pan, fit; selection overlays (lasso polygon, brush strokes w/ size + eraser,
  square w/ Shift 1:1, auto-detect: "Detecting garments… Segmenting the image into editable regions",
  hover-highlight regions, click to select); floating "Make a change…" bubble (drag handle, submit) →
  region edit; selection bar (re-detect, delete, close). Annotate bars (colors, stroke/size slider, shape
  type, Save). Crop overlay. Placeholder shimmer while generating. Empty state: collage + "Fashion Studio /
  Start with a sketch, reference, or prompt of your idea." + Sketch / Image tiles + prompt box.
- **Filmstrip (bottom):** runs as groups "LABEL time-ago" with thumbnails, selected outline, pin toggle.
- **Settings panel (right):** tool title/description/close; inputs (image pickers "Choose or upload /
  Applying to …", mask picker with detected regions + "Select on image", text with "Try an example", color
  collection, collections for batching); Resolution / Aspect Ratio; model-blocked warning with "Open model
  access settings"; credit cost; Generate; "N generating…".
- **Crop panel:** Center X/Y, Size X/Y, Lock ratio, Rotation (deg), Save.
- **Adjustments panel:** Warmth, Contrast, Saturation, Brightness, Highlights, Shadows, Tint, Hue; Save.
- **Feed view (F):** breadcrumb "Fashion Studio / Project ▾" (search/switch/rename/new), runs newest first
  with tool + time, grid ↔ ticker, thumbnail size slider; hover Download / Fullscreen / ⋮ (Show info, Open
  in Canvas, Delete); Shift/Cmd multi-select → selection panel (Mark, Open in Canvas, Share assets, Share
  for review, Download, Save to Assets, Export, Delete); run header download/delete; "Make something new".
- **Details panel:** type, resolution, file size, name, model, generation time, download.
- **Onboarding:** Welcome modal → guided tour (spotlight + step card with demo clip): sketch → render →
  select garment → recolor → try-on → review in feed → export & share → Finish. Works signed-out at
  `/studio/demo` with pre-baked results; actions that need an account open "Sign up to try out Fashion
  Studio!".
- **Help (?):** keyboard shortcuts, restart tour, docs.

### 4.4 Settings (`/settings`)
Workspace model access toggles, credits + ledger, account.

### 4.5 Share (`/s/[token]`)
Public read-only view of one result with download.

## 5. Tools → models

Model choice per tool (2026-10-06). "Pro" = Nano Banana Pro (Gemini 3 Pro Image), "NB2" = Nano Banana 2
(Gemini 3.1 Flash Image). Every image chain is fal first, then the same model via OpenRouter, then the next
tier down; providers that are out of balance are skipped for 5 minutes.

| Tool | Outputs | Primary model | Why | Fallbacks |
|---|---|---|---|---|
| Prompt | 1 | Pro | Best prompt adherence and garment realism from text | Pro (OR) → NB2 |
| Sketch to Render | 1 / sketch | Pro | Holds the sketch's silhouette and design lines while inventing believable fabric | Pro (OR) → NB2 |
| Garment Extractor | 1 | Gemini 3.6 Flash + SAM 3 → Pro | Precise garment selection, then reconstruction of hidden parts | NB2 |
| Concept | 4 | Seedream 4.5 | Strongest multi-reference blending for original design concepts | Pro → NB2 |
| Ghostform / Flatlay | 1 / garment | Pro | 3D volume (ghost) and true top-down flattening without losing construction | NB2 |
| Garment Recolor | 1 / color | NB2 (+ mask composite on parts) | Color-only edit; fast and faithful | NB1 |
| Fabric Swap | 1 / swatch | Pro | Understands weave/knit, sheen and drape of the swatch | NB2 |
| Model Maker | 3 | Pro | Identity stays consistent across headshot, headshot sheet, body sheet | NB2 |
| Model Try-On | 1 / garment | FASHN Try-On 1.6 | Purpose-built virtual try-on: keeps prints, logos, fit | Pro |
| Garment Swap | 1 | FASHN 1.6 (image) / Pro (description) | Same try-on model swaps the selected garment | Pro → NB2 |
| Photo Shoot | 4 | Pro | Same model + outfit in a new location across shots | NB2 |
| Multi-Angle Shoot | 4 | Pro | Most consistent subject across camera angles | NB2 |
| 360 Garment Video | 1 video | Veo 3.1 (Kling 3.0 Pro start→end frames with a backview) | Smooth, consistent turntable | Veo 3.1 Fast → Kling 3.0 |
| 360 Model Video | 1 video | Veo 3.1 Fast | Natural orbit around a standing model | Kling 3.0 Pro |
| Region edit | 1 | Pro + feathered mask composite | Instruction-following edit; pixels outside the selection untouched | NB2 |
| Remove background | 1 | BiRefNet v2 | Fine fabric edges | Gemini chroma-key |
| Auto detect | regions | Gemini 3.6 Flash (OpenRouter) → SAM 3 masks | Named parts ("Left sleeve", "Collar"…) with pixel masks | Gemini masks → box masks |

Other fallbacks: worker → inline engine; stale runs → retry once → refund unused credits.

## 6. Architecture
npm workspaces: `apps/web` (Next.js 16 on Vercel: UI + REST API + inline engine fallback),
`apps/worker` (Railway: claims queued runs with `FOR UPDATE SKIP LOCKED`, recovers stale runs, purges
deleted files), `packages/core` (Drizzle schema, data/ACL, credits ledger, storage (R2 SigV4), engine,
tool registry shared by UI + server). Files served via `/api/files/<unguessable key>`.

## 7. Data
users (credits, onboarded, settings.disabledModels) · projects · project_members (email invites,
editor/viewer) · runs (tool, inputs, settings, status, cost, expected, provider_ref) · assets (upload /
result / mask, media, storage key, poster, segments cache, share token) · credit_ledger.

## 8. Permissions
Owner: everything. Editor: generate, upload, edit, share. Viewer: view/download. Deleting runs/results is
owner-only (per reference docs).

## 9. Credits
200 on signup. Cost shown next to Generate; debited atomically at run creation; refunded per missing output
on failure. 4K doubles image cost.

## 10. Quality bar / acceptance
- `npm run verify` (typecheck + unit) green.
- `qa/flow.mts`: upload → every tool → region edit → crop/adjust/annotate → feed actions → share → delete.
- `qa/compare.py`: visual parity vs reference screenshots ≥ 96% layout similarity per screen.
- Production smoke after deploy; `/api/health` green on web and worker.
