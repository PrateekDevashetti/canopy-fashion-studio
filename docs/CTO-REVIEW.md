# Fashion Studio — CTO review (2026-10-06)

Reviewed from two seats: **FLORA's CTO** (is this as good as the product it's modelled on?) and
**Canopy's CTO** (can we run it in production on our stack?). Sources: the codebase, the reference
screenshots/recording, FLORA's public Fashion Studio material, current virtual try-on research, Vercel
platform limits, and the `fullstack-guardian`, `secure-code-guardian` and `sre-engineer` checklists.

## 1. What we found and fixed

### Asset integrity ("what I upload is what I get")
| Finding | Severity | Fix |
| --- | --- | --- |
| Every upload was re-encoded to JPEG q92, capped at 4096 px and stripped of metadata | High | Uploads are stored **byte-for-byte**; sha256 recorded and shown in Details. HEIC/TIFF are converted losslessly only because browsers can't show them |
| Generated results were re-encoded to JPEG q93 | Medium | Masters stored exactly as the model/compositor produced them; the feed shows a WebP preview |
| Crop/adjust/annotate were rendered in the browser from the displayed image and re-uploaded | Medium | Rendered server-side from the full-resolution master; the adjust math is one shared module, so preview = result |
| Vercel caps request **and response** bodies at 4.5 MB: large uploads, lossless masters and videos would have failed in production | **Critical** | Chunked uploads (4 MB pieces, sha256-verified on reassembly); `/api/files` serves ≤4 MB windows for range requests and redirects whole-file requests for large objects to short-lived presigned R2 URLs; client zips fetch originals in ranges |

### Consistency (garments, colour, identity)
| Finding | Severity | Fix |
| --- | --- | --- |
| **Mask bug**: feathered/dilated masks were read as 3-channel, squashing them into the left third of the image, so region edits/recolors could be pasted in the wrong place | **Critical** | Masks stay single-channel raw; a test now checks placement, not just a corner |
| Recolor/fabric swap without a selection (or with a large one) were never composited — skin, face and background could drift | High | No selection → auto-detect the main garment and composite to it. Every in-place edit keeps all pixels outside the region identical |
| Odd aspect ratios were stretched to the nearest model aspect and back, ghosting edges | Medium | Mirror-pad to a supported aspect, then un-pad: no stretching |
| No check that the model kept the frame | Medium | Measure drift outside the region; retry once if the model reframed; store the score ("Outside edit: 99.7% unchanged") |
| Models under-shoot dye changes (navy came back mid-blue) | High for e-comm | Lab colour-accuracy pass: fabric pulled onto the exact hex, hardware/stitching excluded. Real run: ΔE 15.7 → 0.9 |
| New shots (Photo Shoot, Multi-Angle) only saw one image of the model | Medium | Face and outfit close-up references + explicit identity-lock prompts (verified on a real run) |

### Security and reliability
| Finding | Severity | Fix |
| --- | --- | --- |
| No rate limiting on paid model calls, uploads, guest creation or public review comments | High | Postgres-backed limits shared across instances; fail open so a limiter outage never takes the product down |
| No Origin check on cookie-authenticated mutations | Medium | Same-origin check (on top of SameSite=Lax cookies) + structured security-event logs |
| Missing HSTS / frame / COOP headers | Low | Added |
| `/api/health` exposed raw DB errors and had no saturation/error signals | Low | Reports queue depth, oldest queued age, 1h error rate; 503 when the queue is stuck |
| No SLOs or runbooks | Medium | `docs/SLO.md` |

## 2. What I'd do next (prioritised)

**P0 — before real customers**
1. Apply migration `0002` and run `scripts/ship.sh` (Neon terms → Vercel env → Railway worker → deploy → health).
2. Top up fal: video tools (360°) and the dedicated try-on model (FASHN) need it; images fall back to OpenRouter.
3. Move Clerk from the shared **dev** instance to a production instance before public launch (dev instances
   show a banner and have user caps).
4. Uptime check on `/api/health` + alerts from `docs/SLO.md`.

**P1 — FLORA parity and differentiation**
1. **Shopify / PDP export** — FLORA's showcase stage ends in Shopify. One-click export of a look's
   marked results (front/back/detail/on-model) with consistent naming and alt text.
2. **Colour-accurate catalogues** — expose the ΔE score in the feed and allow a Pantone/brand palette
   per workspace; flag any colourway with ΔE > 3 before it ships.
3. **Fidelity QA for try-on** — compare garment crops before/after (logo, print, length) with a vision
   check, the "dimension-wise garment fidelity" approach from recent try-on research; auto-retry failures.
4. **Model library** — save Model Maker results as reusable models; pass their headshot sheet as the identity
   reference in every later shot (today we derive it from the current image only).
5. The "Coming soon" tools in the rail (Sketch to Vector, Moodboard Maker, Print Pattern, Trim & Patches,
   PDP Shots) — Print Pattern and Trim & Patches can reuse the mask + composite + depth pipeline.

**P2 — scale and cost**
1. Cache vision/segmentation per asset sha256 (re-uploads of the same file skip detection).
2. Clean up abandoned chunked uploads (`p/*/incoming/`) — needs a list-capable R2 token or an R2 lifecycle rule.
3. Move video generation fully to the Railway worker and keep Vercel functions short.
4. Public share pages serve previews (metadata stripped); keep it that way, since originals can carry EXIF/GPS.

## 3. Verified
- Unit tests: 16/16 (byte-exact storage, previews, EXIF orientation, exact-pixel crop, mask placement,
  colour match, pad/unpad, drift).
- Real models: recolor drift 0.003 outside the garment; ΔE 15.7 → 0.9; identity held in a new location.
- Typecheck clean; production `next build` passes.
- Not yet re-run: full e2e suite (needs migration `0002` applied to the local database).
