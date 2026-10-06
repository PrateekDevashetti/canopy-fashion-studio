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
- DB: local `postgres://localhost:5432/fashion_studio`; `cd packages/core && npx drizzle-kit push --force`
- Env lives in `.env.local` at repo root (copied from floraxfauna; never print values). Web reads it via `apps/web/.env.local` symlink.

## Providers (verified 2026-10-06)
- Images: fal `fal-ai/nano-banana-2` / `/edit` (resolution 1K/2K/4K, aspect incl. auto) → fallback `fal-ai/nano-banana(/edit)`.
- Matting `fal-ai/birefnet/v2`; masks `fal-ai/sam-3/image` (box_prompts in pixels); video `fal-ai/veo3.1/fast/image-to-video`,
  `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (tail image). fal accepts data URIs as image inputs.
- Vision: OpenRouter `google/gemini-3.6-flash` (returns garment labels + box_2d 0–1000).
- The Gemini direct key is **free tier: image quota 0** — don't use it for generation.

## Rules
- Match the reference screenshots (FLORA Fashion Studio) for layout/behavior; brand is Canopy (mark `public/brand/canopy-mark.svg`,
  DM Sans / DM Mono, Playfair italic for display). Never ship FLORA assets/logos or third-party customer logos.
- Every model path: retries → fallback → refund. Runs are claimed atomically; inline + worker can race safely.
- Deleting runs/results is owner-only. Masks live at `p/<project>/masks/*.png`; inputs reference them by key.
- Disk is tight (~2 GB free): no big caches, clean `.next` when needed.
- Worktree guard: Bash commands must be simple (no `cd … &&` chains into other dirs); use the Write tool for files.

## Status
See `docs/TASKS.md`. Update this file when conventions change.
