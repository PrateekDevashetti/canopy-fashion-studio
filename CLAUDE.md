# Canopy Fashion Studio — agent guide

Fashion Studio by Canopy Labs: a focused workspace for fashion teams (sketch → render → recolor → swap →
shoot → review). Spec: `docs/PRD.md`. Work queue: `docs/TASKS.md` — **tick tasks only after verifying them.**

## Layout
- `apps/web` — Next.js 16 (App Router, `src/proxy.ts` not middleware). UI + REST API under `src/app/api`. Port 3200.
- `apps/worker` — Railway worker: claims queued runs (`claimNext`, SKIP LOCKED), `recoverStale`, `purgeDeleted`, `/health`.
- `packages/core` — Drizzle schema (`src/db/schema.ts`), data/ACL/credits (`data.ts`), `service.ts` (createRun/upload/edit/mask),
  engine (`engine/run.ts` tools, `engine/detect.ts`, `engine/imaging.ts` sharp ops, `engine/prompts.ts`, `engine/providers.ts`),
  `tools/registry.ts` (single source of truth for tools — imported by client components via `@fashion/core/tools`, keep it pure).
- `docs/` PRD + tasks. `qa/` verification scripts.

## Commands
- `npm run dev` (web, inline engine) · `npm run dev:worker` · `npm run verify` (typecheck + unit tests)
- E2E: start `npm run dev:e2e -w @fashion/web` (blanks Clerk keys → single-user dev auth; plain `dev` makes every
  signed-in test 401), then `npx e2e run` (bare `npx e2e` only prints help). `E2E_REAL_MODELS=1` adds paid model tests.
- Architecture + run-flow diagrams (archify, source-cited): `.archify/*/` — HTML is self-contained; regenerate with
  `node ~/.claude/skills/archify/bin/archify.mjs finalize <type> <candidate.json> <out.html> --repo-root . --quality showcase`
  (`ARCHIFY_CHROME` = Playwright's Chrome for Testing for the browser gate).
- DB: local `postgres://localhost:5432/fashion_studio`; `cd packages/core && npx drizzle-kit push --force`
- Env lives in `.env.local` at repo root (copied from floraxfauna; never print values). Web reads it via `apps/web/.env.local` symlink.

## Providers (verified 2026-10-06)
- Images: fal `fal-ai/nano-banana-2` / `/edit` (resolution 1K/2K/4K, aspect incl. auto) → fallback `fal-ai/nano-banana(/edit)`.
- Matting `fal-ai/birefnet/v2`; masks `fal-ai/sam-3/image` (box_prompts in pixels); video `fal-ai/veo3.1/fast/image-to-video`,
  `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (tail image). fal accepts data URIs as image inputs.
- Vision: OpenRouter `google/gemini-3.6-flash` (returns garment labels + box_2d 0–1000).
- The Gemini direct key is **free tier: image quota 0** — don't use it for generation.
- 2026-10-06: fal account **locked (TOP_UP)** — image tools fall back to OpenRouter (Gemini 3 Pro / 3.1 Flash Image);
  video falls back to OpenRouter (Veo 3.1 Fast → Kling v3.0 Pro → Seedance 2.5); FASHN try-on needs fal.
- OpenRouter refuses image/video output below $1.00 balance — `node qa/or-balance.mjs` checks it (2026-10-07: $0.52).

## Assets (don't regress these)
- **Masters are exact**: uploads stored byte-for-byte (`media.ts` `storeImage`, sha256 in `assets.meta`); results stored
  exactly as generated. Never re-encode a master. Display uses `previewKey` (WebP ≤2560px) → DTO `url`; downloads and
  hand-offs use `originalUrl`.
- **Vercel 4.5 MB body limit** (request + response): uploads >4 MB go in chunks (`uploadChunk`/`completeUpload`);
  `/api/files` serves ≤4 MB windows and 302s big whole-file requests to presigned R2 (`presignGet`). R2 token is
  object-scoped — no bucket CORS, so browsers can't read R2 pixels cross-origin; keep pixel work same-origin or server-side.
- Editor saves (crop/adjust/annotate) render server-side from the master (`edit.ts`); adjust math lives in
  `@fashion/core/adjust` and is shared with the live preview.
- Consistency engine (`engine/run.ts` `inPlaceEdit`): pad-to-aspect → model → unpad → drift check/retry → masked composite.
  Recolor adds a Lab colour-accuracy pass (`matchGarmentColor`). Photo Shoot / Multi-Angle add face + outfit close-ups.
- Masks must stay single-channel raw in `maskAlpha` (an encode round-trip turns them 3-channel and misplaces composites).

## Production (2026-10-06)
- Web: Vercel `canopy-fashion-studio` (team prateekdevashettis-projects, root `apps/web`) → https://canopy-fashion-studio.vercel.app.
  Deploy = `vercel deploy` (preview, behind Vercel auth — use `vercel curl`) → verify → `vercel promote <url>`.
- Worker: Railway project `canopy-fashion-studio`, service `fashion-worker` (root `Dockerfile`), `railway up --service fashion-worker`.
- DB: Neon project `canopy-fashion-studio` (`noisy-water-24376320`, aws-us-east-1, org `org-young-cell-99556107`), created
  with `neonctl` (Vercel's Neon integration needs browser terms). Web uses the `-pooler` host. Schema baseline:
  `packages/core/migrations/0000_baseline.sql` + later numbered files (apply with psql).
- Storage: R2 `canopy-assets` under `S3_PREFIX` (shared with floraxfauna). Auth: Clerk dev instance shared with the canvas.

## Ops
- Schema changes: edit `schema.ts` **and** add an idempotent SQL file in `packages/core/migrations/`.
- Rate limits (`ratelimit.ts`) via `route(handler, { limit })`; security events are JSON log lines `level: "security"`.
- Prod migrations applied: 0000 baseline, 0003 boards/explore/folders (2026-10-07). Prod DB changes need the user's go-ahead.
- Security headers: site CSP in `next.config.ts` excludes `/api/files/*` (that route sets its own; SVG gets `sandbox`).
  A config header would overwrite a route header — keep the exclusion.
- Analytics: PostHog `NEXT_PUBLIC_POSTHOG_KEY` (public `phc_` key → Vercel `--type config`) + `_HOST`; server events in
  `packages/core/src/analytics.ts`, client in `apps/web/src/lib/analytics.ts`.
- SLOs, alerts, runbooks: `docs/SLO.md`. CTO review + roadmap: `docs/CTO-REVIEW.md`.
- Core tests run with `tsx --test` (extensionless imports).

## Rules
- Match the reference screenshots (FLORA Fashion Studio) for layout/behavior; brand is Canopy (mark `public/brand/canopy-mark.svg`,
  DM Sans / DM Mono, Playfair italic for display). Never ship FLORA assets/logos or third-party customer logos.
- Every model path: retries → fallback → refund. Runs are claimed atomically; inline + worker can race safely.
- Deleting runs/results is owner-only. Masks live at `p/<project>/masks/*.png`; inputs reference them by key.
- Disk is tight (~2 GB free): no big caches, clean `.next` when needed.
- Worktree guard: Bash commands must be simple (no `cd … &&` chains into other dirs); use the Write tool for files.

## Status
See `docs/TASKS.md`. Update this file when conventions change.
