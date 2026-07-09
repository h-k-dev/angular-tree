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

- **Current phase: Phase 8 — Hardening & Release, matrix complete** (browser integration matrix + 100k perf benchmark executed 2026-07-07 as a Playwright e2e suite — four real focus/menu bugs found and fixed same day; README + publish metadata done). Remaining before release: real-AT screen-reader pass, version bump + `npm publish` (user-side). 108 green specs: 88 lib + 5 app + 15 e2e. See ROADMAP.md.
- Library source lives in `projects/angular-tree/`; the test harness in `projects/angular-tree/testing/` (secondary entry point); the browser matrix in `e2e/`. `npm test` runs vitest for both projects, `npm run e2e` runs the Playwright matrix (boots `ng serve` itself), `npm run build` builds the lib via ng-packagr.
