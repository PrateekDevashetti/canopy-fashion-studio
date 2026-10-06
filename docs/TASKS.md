# Fashion Studio — task list

Loop for every task: **build → typecheck → test (unit/flow) → screenshot vs reference → fix → tick**.
Status: `[x]` done & verified · `[~]` built, needs re-verification · `[ ]` todo · `[!]` blocked on a human.

Verification sources: unit tests (`npm test`, 16 tests), e2e suite `tests/e2e` (29/29 green at `e2793cc`),
real-model scripts in `qa/`.

## M0 Foundations
- [x] Repo, npm workspaces, worktree `feat/studio`, remote `PrateekDevashetti/canopy-fashion-studio`
- [x] Keys from floraxfauna into `.env.local` (FAL, OpenRouter, Gemini, R2 `canopy-assets` + prefix `fashion-studio/`, Clerk dev instance shared with the canvas)
- [x] Provider probes: NB2 + NB2 edit, BiRefNet, SAM 3, Veo 3.1 / Kling schemas, OpenRouter Gemini 3.6 Flash detection
- [x] Core: schema, db client, storage (R2 SigV4 + local), ids
- [x] Core: tool registry (15 tools + 5 soon, per the screenshots), pricing, validation, active-image binding — unit tests
- [x] Core: data/ACL/credits ledger, service (createRun, uploads, edits, masks)
- [x] Engine: providers w/ retries + cross-provider fallback, imaging, prompts, run executor w/ partial refunds, video resume, stale recovery
- [x] Engine: garment detection (Gemini boxes → SAM masks → Gemini mask → box fallback)
- [x] Worker (Railway) loop + health + Dockerfile
- [x] API routes
- [x] Schema additions: assets.marked, assets.saved, review comments table
- [x] CLAUDE.md (kept current)

## M1 Studio shell — verified by e2e t02
- [x] Layout + top bar, tool rail (hover previews, Soon tools, Library, Upload), settings panel, filmstrip, empty state
- [x] Polling + optimistic placeholders + toasts + keyboard shortcuts

## M2 Canvas editor — verified by e2e t04 (before the server-side edit change)
- [x] Image stage: fit, zoom, pan, video playback
- [x] Lasso, Brush, Square, Auto detect → mask upload; "Make a change…" region edit
- [~] Draw / Text / Shapes save — now composited server-side from a transparent overlay; re-run t04
- [~] Crop save — now rendered server-side from the master (unit-tested exact pixels); re-run t04
- [~] Adjustments save — shared `@fashion/core/adjust` code, server-side; re-run t04
- [x] Remove background, Open in Canvas, Download, Share dialog

## M3 Feed — verified by e2e t06
- [x] Project switcher, grid/ticker + size, placeholders, failed runs, hover actions, lightbox
- [x] Multi-select + selection panel, run header actions, details panel
- [~] Zip/batch downloads now fetch originals in ≤4 MB ranges; re-run t06

## M4 Projects, team, settings — verified by e2e t02/t06
- [x] `/studio` → latest project; `/studios` dashboard; members; `/settings`; `/s/[token]` + reviews; Open in Canvas

## M5 Onboarding — verified by e2e t03
- [x] Welcome modal, guided tour with pre-baked assets, signed-out demo + sign-up gate, help menu

## M6 Assets / M7 Landing — verified by e2e t01
- [x] Tool icons, preview cards, collage, tour assets, landing imagery (original, Canopy-owned)
- [x] Landing page

## M8 QA loop
- [x] `tests/e2e` end-to-end suite (real models, edits, feed actions, hardening)
- [x] `qa/consistency.mts`, `qa/color-match.mts`, `qa/identity.mts` real-model consistency checks
- [~] Re-run full e2e after migration 0002 is applied locally

## M10 Production hardening (CTO review — docs/CTO-REVIEW.md)
- [x] Uploads stored byte-for-byte (sha256 recorded); results stored exactly as generated; WebP previews
- [x] Chunked uploads + windowed file serving + presigned redirects (Vercel 4.5 MB body limit)
- [x] Server-side crop/adjust/annotate from the full-res master
- [x] Fix mask channel bug that misplaced feathered composites
- [x] Pad-to-aspect in-place edits, drift check + retry, auto garment mask, Lab color-accuracy pass
- [x] Identity references (face/outfit close-ups) + identity-lock prompts
- [x] Rate limits, Origin check, security headers, security event logs, health golden signals, SLO doc
- [!] Apply `packages/core/migrations/0002_asset_previews_meta.sql` locally (`npm run db:push`) — needs approval

## M9 Ship
- [x] Push to GitHub
- [x] Production `next build` passes
- [!] Neon project — accept Neon Marketplace terms in the browser, then `bash scripts/ship.sh`
- [~] Vercel project created; env + deploy run by `scripts/ship.sh`
- [~] Railway worker project created; env + deploy run by `scripts/ship.sh`
- [!] fal account locked (`TOP_UP`) — image tools fall back to OpenRouter; video tools need fal
- [ ] Prod smoke test; domain `fashion.trycanopy.space` (DNS by user)
