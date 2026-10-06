# Fashion Studio — task list

Loop for every task: **build → typecheck → test (unit/flow) → screenshot vs reference → fix → tick**.
Status: `[x]` done & verified · `[~]` in progress · `[ ]` todo.

## M0 Foundations
- [x] Repo, npm workspaces, worktree `feat/studio`, remote `PrateekDevashetti/canopy-fashion-studio`
- [x] Keys from floraxfauna into `.env.local` (FAL, OpenRouter, Gemini, R2 `canopy-assets` + prefix `fashion-studio/`, Clerk dev instance shared with the canvas)
- [x] Provider probes: NB2 + NB2 edit, BiRefNet, SAM 3, Veo 3.1 / Kling 2.5 schemas, OpenRouter Gemini 3.6 Flash detection
- [x] Core: schema, db client, storage (R2 SigV4 + local), ids
- [x] Core: tool registry (15 tools + 5 soon), pricing, validation, active-image binding — unit tests
- [x] Core: data/ACL/credits ledger, service (createRun, uploads, edits, masks)
- [x] Engine: providers w/ retries, imaging (mask composite, highlight, crop), prompts, run executor w/ partial refunds, video resume, stale recovery
- [x] Engine: garment detection (Gemini boxes → SAM masks → box fallback)
- [x] Worker (Railway) loop + health + Dockerfile
- [x] API routes: health, me, projects, feed, uploads, runs, edits, masks, members, runs/:id, assets/:id, detect, share, files, cron
- [ ] Schema additions: assets.marked, assets.saved, review comments table
- [ ] CLAUDE.md (kept current)

## M1 Studio shell
- [ ] Layout + top bar (logo, project menu, privacy line, toolbar, Editor/Feed toggle, zoom ▾)
- [ ] Tool rail (sections, icons, labels, selected/new states, hover preview cards, Soon tools, Library, Upload)
- [ ] Settings panel (all input kinds, Applying to, mask picker, examples, colors, resolution/aspect, model-blocked warning, cost, Generate, generating count)
- [ ] Filmstrip (run groups, labels, time-ago, selection, pin)
- [ ] Empty state (collage + Sketch/Image tiles + prompt box)
- [ ] Polling + optimistic placeholders + toasts + keyboard shortcuts (V L B A S E F, ⌘Z? Esc, Delete)

## M2 Canvas editor
- [ ] Image stage: fit, zoom %, ctrl/⌘+wheel zoom, pan (space / middle drag), video playback
- [ ] Lasso, Brush (+size, eraser), Square (Shift 1:1), Auto detect (overlay, hover, click) → mask upload
- [ ] "Make a change…" bubble (drag) → region edit run; selection bar (re-detect, delete, close)
- [ ] Draw / Text / Shapes (colors, stroke/size, rect/ellipse/arrow, Save → new version)
- [ ] Crop (overlay, center/size, lock ratio, rotation, Save)
- [ ] Adjustments (8 sliders w/ gradient tracks, live preview, Save)
- [ ] Remove background, Open in Canvas, Download, Share dialog

## M3 Feed
- [ ] Breadcrumb project switcher (search, rename, new)
- [ ] Runs grid / ticker, size slider, generating placeholders, failed runs
- [ ] Hover actions (download, fullscreen, ⋮ info/canvas/delete), lightbox
- [ ] Multi-select (shift/cmd) + selection panel (Mark, Open in Canvas, Share assets, Share for review, Download, Save to Assets, Export, Delete)
- [ ] Run header actions (download zip, delete), "Make something new"
- [ ] Details panel

## M4 Projects, team, settings
- [ ] `/studio` → latest project; `/studios` dashboard (Studio card ⋯, project grid, Studio badge)
- [ ] Members dialog (invite by email, roles, owner-only delete)
- [ ] `/settings` (model access, credits ledger, account)
- [ ] `/s/[token]` share page + review comments
- [ ] Open in Canvas via canopy-api `POST /api/projects/import` (fallback: download + open app.trycanopy.space)

## M5 Onboarding
- [ ] Welcome modal (Get started / Skip / ✕)
- [ ] Guided tour w/ spotlight + step cards + demo clips (sketch → render → select → recolor → try-on → feed → export) using pre-baked tour assets
- [ ] Signed-out demo `/studio/demo` + "Sign up to try out Fashion Studio!" gate
- [ ] Help menu (shortcuts, restart tour)

## M6 Assets
- [ ] Generate tool icons (15) + preview cards (15) + empty-state collage + tour assets + landing imagery via fal (original, Canopy-owned)

## M7 Landing
- [ ] Nav w/ dropdowns, hero video, built-for row, workflow strip, value props, 3 card sections, tool list, FAQ accordion, CTA, footer

## M8 QA loop
- [ ] `qa/flow.mts` Playwright end-to-end (all tools on real models, edits, feed actions)
- [ ] `qa/capture.mts` + `qa/compare.py` screenshot parity vs `qa/ref/*`
- [ ] Fix until parity ≥ target; code review pass

## M9 Ship
- [ ] Push to GitHub
- [ ] Neon project + schema push
- [ ] Vercel project + env + deploy (preview → verify → promote)
- [ ] Railway worker + env + deploy, health green
- [ ] Prod smoke test; domain `fashion.trycanopy.space` (DNS by user)
