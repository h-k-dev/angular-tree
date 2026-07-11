# angular-tree

High-performance standalone Angular tree component (react-arborist internals, Angular Material DX). Angular ≥ 21, zoneless, signals-only, CDK as the only runtime dependency.

## Session protocol — do this first, every session

1. Read **ROADMAP.md** — the single source of truth for phases, locked decisions, settled brainstorming, and open questions. Resume work from the current phase noted there. Post-v1 planning lives in **ROADMAP2.md** (nothing there starts before Phase 8 completes).
2. Read **STYLE.md** — mandatory coding style. All code (including stubs and specs) must pass its Review Checklist.

## Rules

- **Locked decisions in ROADMAP.md are not renegotiated silently.** If implementation reveals a problem with one, raise it explicitly before deviating.
- **When a decision gets settled in discussion, write it into ROADMAP.md immediately** (settled list, decisions table, or non-goals) — the roadmap must never lag the conversation.
- Public API changes go through the "Public API Sketch" section of ROADMAP.md before code.
- DX and Material familiarity outrank micro-optimization at the API boundary; performance work stays internal (flat model, virtualization).
- The tree ships no UI it doesn't own: no built-in menu, editor, or checkbox — directives + template contracts instead.
- **Scaffold with the Angular CLI** (`ng generate service|directive|component …`), never by hand — current Angular defaults apply (no `.service.ts`/`.directive.ts` file suffixes).
- **Modern Angular naming: no `Service`/`Directive`/`Component` class suffixes.** Names describe what the thing _does_ (`TreeController`, `TreeNodeToggle`, `AngularTree`) — see STYLE.md § Naming.

## Status

- **Current phase: Phase 8 — Hardening & Release, matrix complete** (browser integration matrix + 100k perf benchmark executed 2026-07-07 as a Playwright e2e suite — seven real library bugs found and fixed since: four focus/menu 2026-07-07, a zoneless load-state repaint and a drop-zone/indicator mismatch 2026-07-10, a menu-close focus reclaim that killed menu-triggered inline rename 2026-07-11; README + publish metadata done; demo restructured 2026-07-10 into feature-tour roots incl. a drag & drop rules showcase and a flaky-retry root). CI/CD added 2026-07-10 (bun build/test on push; semantic-release → npm OIDC + GitHub Packages on `beta`/`main`; demo → GitHub Pages on `main`; lib renamed `@h-k-dev/angular-tree`). Demo shows both rename patterns side by side 2026-07-11: context menu "Rename" (inline `tree.edit` → `treeNodeEditInput`) + "Rename in dialog…" (prefilled MatDialog `RenameDialog`) on files and folders. Internal refactor 2026-07-11: `angular-tree.ts` split by feature (1701 → 1100 lines) into pure cores (`tree-keyboard`, `tree-guides`, `tree-dom`) + `@Service()` engines (`TreeFocusEngine`, `TreeMenuHost`, `TreeDragSession`) under the STYLE.md § Feature Engines rule ("functions for derivation, classes only for lifecycle"); demo same day: `FILE_ICONS` record + `fileSize` pipe replace template function calls, page capped at 1200px, tree card fills the first viewport via a definite flex chain (`block-size: 100%`, not `min-block-size` — indefinite for % resolution). Demo pages restructured same day: playground = layout with a flush-left examples aside ("All-In-1" front page + "Resource API" + "Static"), examples as lazy child routes; the Resource example fetches GitHub git-trees via `resource()` with a previous-preserving `linkedSignal` (STYLE.md § State & Signals amended accordingly); the Static example shows Figma-/Framer-style layer panels themed purely via `--tree-*` tokens with `clickAction: 'select'`. Icon font switched to Material Symbols Outlined (non-blocking load + `MAT_ICON_DEFAULT_OPTIONS`) — the demo's Symbols-only ligatures rendered as literal text under the classic font. Remaining before release: real-AT screen-reader pass, one-time npm Trusted Publisher + Pages-source setup (user-side). 168 green specs: 128 lib + 16 app + 24 e2e. See ROADMAP.md.
- Library source lives in `projects/angular-tree/`; the test harness in `projects/angular-tree/testing/` (secondary entry point); the browser matrix in `e2e/`. `npm test` runs vitest for both projects, `npm run e2e` runs the Playwright matrix (boots `ng serve` itself), `npm run build` builds the lib via ng-packagr.
