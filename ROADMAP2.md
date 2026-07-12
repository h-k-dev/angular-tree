# angular-tree — Roadmap 2 (post-v1)

Planning for everything **after** v1 ships. [ROADMAP.md](./ROADMAP.md) stays the source of truth until Phase 8 (Hardening & Release) is complete — nothing here starts before v1 is out the door, and nothing here renegotiates a v1 locked decision without an explicit entry in the decisions discussion.

> **v2 start (2026-07-07, explicit user call):** implementation began with Phase 8's user-side release steps (real-AT pass, `npm publish`) still pending — the "nothing before Phase 8 completes" gate was lifted deliberately, not silently. First workstream: the migration-critical API set (accessor `AbortSignal`, `invalidateChildren` + `collapseBehavior`, `defaultFocusedKey`, focus retention across data replacement, `key` in the template context).

Conventions are inherited from ROADMAP.md: locked decisions are not silently renegotiated, settled discussions get written here immediately, public API changes go through the v1 Public API Sketch process, all scaffolding via `ng generate`, STYLE.md applies.

## Guiding priorities for v2

| Priority                                                              | Rationale                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Fix known v1 paper cuts first                                         | Cheapest wins; several are one-liners against existing architecture         |
| SSR before new features                                               | It was a v1 cross-cutting concern that never landed — closest thing to debt |
| Performance work stays invisible                                      | Same rule as v1: internals may change radically, the public API may not     |
| Every new capability keeps the "tree ships no UI it doesn't own" rule | Adapters and handles, never built-in widgets                                |

## Phase 9 — v1 Paper Cuts & Known Gaps ✅ COMPLETE 2026-07-07

Small items discovered during v1 implementation. **All shipped 2026-07-07** (139 specs total: 116 lib + 5 app + 18 e2e):

- ~~**Shift+checkbox range selection**~~ ✅ — `TreeNodeHandle.toggleSelection(range?: boolean)`; `treeNodeCheckbox` passes `shiftKey`. Additive range from the anchor over visible order; the anchor survives so further shift-clicks re-range from the same spot
- ~~**`expandAll()` over lazy subtrees**~~ ✅ — `expandAll({ loadLazy: true })` (settled: opt-in, decision 4): batched `ensureChildren` frontier waves, each wave expands and is re-scanned; stops on frontier exhaustion _or_ a wave with zero progress (all errors — `retryChildren` stays the recovery path). Default unchanged: skip
- ~~**Escape cancels an in-flight pointer drag**~~ ✅ — document-level keydown during drag: drop flagged dead, CDK sequence ended via synthetic mouseup (no public cancel exists); `stopPropagation` so a hosting dialog doesn't close on the same press. Mouse drags only — a fabricated TouchEvent can't carry the coordinates DragRef reads; touch cancels by lifting. e2e-verified incl. the trailing physical mouseup
- ~~**Wheel-scroll mid-drag**~~ ✅ — the existing `elementScrolled` subscription re-runs drop targeting from the last pointer position while a drag is live
- ~~**Touch drag via opt-in handle**~~ ✅ — `treeNodeDragHandle` (hosts CDK's `CdkDragHandle`): row drags only from the handle, start delay drops to 0 including touch — a dedicated handle makes long-press unambiguous, so the context-menu conflict the delay guarded is gone
- ~~**`mat-checkbox` adapter**~~ ✅ — resolved as a documented pattern, not an adapter (decision 5, amends the v1 JSDoc promise): bind `[checked]`/`[indeterminate]` from `checkState`, drive selection from `(click)` for `shiftKey` access — docs/RECIPES.md; zero Material coupling
- ~~**`aria-live` announcements**~~ ✅ — CDK `LiveAnnouncer` (no DOM shipped): moves/copies, lazy-load outcomes (named via `typeaheadText` when present), search result counts (true matches via new `searchMatchCount`, not ancestor chains). `announcements` input: partial overrides merge with English defaults, `null` silences
- ~~**PageUp/PageDown**~~ ✅ — viewport-height jumps (`getViewportSize() / itemSize`, clamped to ≥1 row for layoutless environments)
- ~~**`AbortSignal` in `TreeChildrenAccessor`**~~ ✅ **2026-07-07** — optional second argument, opt-in by declaring it (`Function.length >= 2`; single-arg accessors skip the `AbortController` allocation entirely — zero cost across a 100k flatten). Aborts on destroy (`abortAll`), invalidate-while-in-flight, and collapse under `collapseBehavior: 'invalidate'`; plain collapse lets the resolve finish (v1 unmount-survival precedent). A generation guard makes stale resolves (consumer ignored the abort) write nothing
- ~~**Focus retention across data replacement**~~ ✅ **2026-07-07** — an effect over `visibleNodes` snapshots the visible order; when the tree owns focus (focusin/focusout/document-pointerdown bookkeeping — clicking a non-focusable outside area fires no focus event, only the pointer-down marks departure) and the focused row's DOM dies, focus re-attaches by key; a vanished key falls back to the nearest survivor in the previous visible order (following first, then preceding — ends at the parent naturally). Never steals focus the user moved elsewhere. Dialog round-trips repair for free
- ~~**`defaultFocusedKey` input**~~ ✅ **2026-07-07** — seeds `focusedId` (linkedSignal) until the first focus write; unknown/hidden keys fall back to the first visible row so the Tab target is never lost (also fixes the pre-existing collapsed-away-focus gap)
- ~~**Interactive elements inside rows — a11y contract**~~ ✅ **2026-07-07** (decision 6) — tree-shipped row directives (`treeNodeToggle`, `treeNodeCheckbox`, `treeNodeDragHandle`) leave the tab order via host `tabindex="-1"`; arbitrary consumer elements follow the same documented rule (docs/ACCESSIBILITY.md) with the context menu as the keyboard path; the rename input stays the deliberate exception. No template-walking enforcement — free-form templates, one rule

## Phase 10 — SSR & Hydration

The v1 cross-cutting concern that never landed. Design sketch from ROADMAP.md still applies:

- Server render: viewport has no size → render the first `ssrRowCount` rows statically (input, default ~20)
- Hydration: reconcile static rows with the virtual viewport without flicker; no `afterNextRender` on the server
- Zoneless + incremental hydration verification (`@defer` interaction with the viewport)
- Exit criteria: SSR demo route, hydration mismatch-free under `ngSkipHydration`-free rendering, CI check

## Phase 11 — Performance & Internals

v1 is O(n)-per-change over 100k nodes with per-row reactive reads — already fast. v2 targets 1M nodes and mutation-heavy workloads:

- **Incremental re-flatten**: today any `dataSource`/overlay change rebuilds the full flat model; keyed subtree memoization can rebuild only changed branches (node-object identity already memoizes accessor calls — extend the same idea to flatten results)
- **In-place `Set` mutation + version bump** for `expandedIds`/`selectedIds` (the v1 escape hatch explicitly kept open by private state)
- **`checkStates` delta pass**: fold only the ancestor chain of changed keys instead of full reverse pass (O(depth·changes) vs O(n))
- **Dynamic row heights, first-class**: v1 documents the experimental autosize escape hatch; evaluate owning a measured-heights strategy (prefix-sum index) so `scrollTo`/aria positions stay exact with variable heights
- **1M-node benchmark** added to the perf suite with budget gates in CI
- Rule unchanged: all of this is invisible at the API boundary

## Phase 12 — Deferred v1 Non-Goals (capabilities)

Each was an explicit v1 non-goal with a contract designed not to preclude it:

- **Sparse selection over unloaded subtrees** — "selected-roots + exclusions" model so checking a lazy parent means _everything under it, loaded or not_; `checkboxSelection` semantics were chosen to allow this. Needs: wire-format for persistence, `SelectEvent` extension (additive), cascade rules on later load
- **Cross-tree & external drag and drop** — drag between two `angular-tree` instances (shared drag registry service) and OS file drops (`DataTransfer` → a new `externalDropped` intent). `MoveEvent` contract already plural and doesn't preclude it
- **Flat input data (`levelAccessor`)** — accept pre-flattened arrays (the other modern `CdkTree` pattern); internal model is already flat, so this is mostly an ingestion adapter + expansion semantics for unknown parents
- ~~**Lazy invalidation**~~ ✅ **2026-07-07** — `TreeApi.invalidateChildren(node?)`: drops the keyed overlay + accessor memo, aborts in flight, bumps the stale-result generation; expanded nodes re-run the accessor immediately (per-row `isLoading`), collapsed ones on next expand; no argument = tree-wide (single overlay write for the batch). `collapseBehavior: 'keep' | 'invalidate'` input shipped (default `keep`). The headless line held: the tree never fetches or caches — refresh policy, batching, and stale-while-revalidate stay consumer-side behind the accessor (TanStack Query's invalidate-vs-fetch split). Overlays survive `dataSource` replacement (settled 2026-07-06; immutable-update consumers replace array identity constantly — clearing would refetch the world per rename); nothing re-fires implicitly
- **Server-driven search & reveal (design open)** — v1 search (`searchMatch`/`searchTerm`) is client-side over the loaded flat model; a lazy tree can't match what isn't loaded. Headless split: the _consumer_ resolves the term server-side into matched keys + ancestor paths (the tree never queries); the _tree_ owns reveal — load/expand ancestor chains via `ensureChildren`, highlight matches, next/prev navigation, `scrollTo` first hit — and announces result counts through the Phase 9 `aria-live` region. Candidate surface: `reveal(paths): Promise<void>` + a match-set input composing with client `searchMatch`. No settled design yet — open question below, spike before committing

## Phase 14 — `iusta-core` migration (PrimeNG `p-tree` + jsTree parity)

The concrete driver for this library: replace **two** engines in `iusta-core-frontend` — jsTree (`core-dnd-tree`, the CRUD/drag tree) and PrimeNG `p-tree` (`document-tree`). Audit 2026-07-06 (against the real usage, not generic parity) found most of the surface already covered — multi-select + meta/ctrl/shift, per-type node templates (their `category`/`trash`/`document` `pTemplate`s → `treeNodeDef` `when`), context menu, DnD move + per-target drop guards, lazy-load-on-expand, freed double-click, expand/collapse persistence, inline rename, icons/colors, thread-line, search — **plus** virtualization, which neither engine has. What's left:

**Library gaps (real code):**

- ~~**Copy-on-drag**~~ ✅ **implemented 2026-07-07** (settled 2026-07-06) — **`MoveEvent.dropEffect: 'move' | 'copy'`** (native DnD vocabulary, extensible — not a closed boolean); modifier sampled continuously mid-drag and read at drop time, **platform-native: ⌥ on macOS, Ctrl elsewhere** (touch has no modifiers → always move). Keyboard path: `Ctrl/Cmd+C` arms copy-paste vs `Ctrl/Cmd+X` move-paste, same guards and validation. Demo ships `applyCopy` (fresh ids per clone); pointer path e2e-verified with a real held modifier (jsdom can't produce one)
- ~~**`key` in the template context**~~ ✅ **2026-07-07** — `key: string` on `TreeNodeContext`, template parity with PrimeNG/jsTree node templates
- **Empty & loading templates** — already promoted to v1 Phase 8 (`treeEmptyDef`/`treeLoadingDef`); listed here only as the migration dependency it is
- **General capabilities this migration depends on, tracked in their own phases** — lazy invalidation (Phase 12); accessor `AbortSignal`, focus retention across data replacement, `defaultFocusedKey` (Phase 9). `document-tree` is the motivating _example_ (sync-refresh menu item, per-node `AbortController`s, dialog-driven immutable rebuilds that drop focus), not the design target — each lands as a general, decoupled capability or not at all

**Interaction decision (v1 lock explicitly reopened and settled 2026-07-06 — see decisions table):**

- ✅ **`clickAction: 'activate' | 'select'` input, default `'activate'`** — **implemented 2026-07-07**. v1 behavior unchanged unless opted in; `'select'` = plain click replace-selects (respects `isSelectable`, sets the range anchor), double-click activates (the tree's dblclick handler is inert under `'activate'`, so v1's double-click-stays-consumer decision holds there). Ctrl/Shift shortcuts identical in both modes. `document-tree` migrates behavior-preserving via `clickAction="select"`

**Migration ergonomics** ✅ **all delivered 2026-07-07** — [docs/MIGRATION.md](./docs/MIGRATION.md) (accessor adapter tables for PrimeNG `TreeNode`/jsTree/wrapper shapes, full p-tree input/event mapping, jsTree CRUD → intents table, create-node recipe, drop-on-trash = delete + trash-to-category = restore patterns, synthetic grouping nodes incl. the category-null "Uncategorized" case, typed-node-actions union guide) and [docs/RECIPES.md](./docs/RECIPES.md) (loading mask over existing content, dialog round-trip refocus — largely automatic since Phase 9 focus retention, `mat-checkbox` binding pattern). README links all of it; ships in the npm package

Exit criteria: `document-tree` and `core-dnd-tree` reimplemented on angular-tree in a branch, feature-matched (incl. the trash/category/document drop rules and lazy document loading), passing their existing specs.

## Phase 15 — Consumer feedback round 1 (iusta `document-tree` in production, 2026-07-12)

First real-consumer feedback: the Phase 14 driver migrated `document-tree` off PrimeNG `p-tree` and filed six requests, ranked. Common theme of 1–3: they are the only reasons the consumer still carries `effect()` + `viewChild` plumbing — a signals-first library should own that sync. All six accepted 2026-07-12 (user call) with two design corrections (#5, #6 below); everything is additive, every default preserves current behavior. Implementation order = the consumer's priority order.

1. **Controlled selection — `selectedKeys` model input** (decision 7) ✅ **implemented 2026-07-12, amended same day (user call): the `SelectionModel` input is REMOVED, not kept for back-compat** — pre-release with zero published consumers, back-compat protected nobody, and keeping it meant dual write paths in every selection funnel plus a bridge effect for a model that isn't signal-reactive (and emits `changed` twice per replace-select, and duplicates `multi` in its constructor flag). Final shape: `model<readonly string[] | undefined>()`, default `undefined` = tree-owned state; `selectedIds` in the controller is a `linkedSignal` over the input — external writes are synchronous, echoes (the consumer writing our emission back) return the previous Set identity so the controlled round-trip is churn-free by construction; interaction writes go `.update()` + model sync → `(selectedKeysChange)`. `selectionChange` (ids + nodes) unchanged. Consumers who want a `SelectionModel` bridge it consumer-side (docs/RECIPES.md). ROADMAP.md v1 settled entry annotated. All five SelectionModel spec hosts migrated; 132 lib + 41 app specs green
2. **Controlled expansion — live `expandedKeys` model input** (decision 8 — explicitly reopens the v1 lock "expansion state internal + methods") ✅ **implemented 2026-07-12**. The lock's perf rationale (private state permits Phase 11's O(1) in-place Set mutation; a public model contract forces O(expanded) copies per toggle) is preserved for unbound consumers — only consumers who bind pay the copies, knowingly. Covers server-side-search auto-expand and state restore, whose write half was imperative-only (`setExpanded`). Implementation notes: `expandedIds` is a `linkedSignal` over the input — while UNBOUND it derives from `defaultExpandedKeys` (read only in that branch, so a later default change still resets an unbound tree — the v1 behavior the demo's scale switch relies on — while a bound tree ignores it entirely); echoes are identity-preserved (same as `selectedIds`). **The `expandedKeys()` snapshot METHOD is removed** (input/method name collision; binding the model IS the reactive snapshot); `setExpanded(keys)` stays as the unbound bulk write. Every mutating TreeApi path (toggle, expandAll incl. lazy frontier waves, collapseAll, expandDescendants, setExpanded) syncs the model → `(expandedKeysChange)`; `(toggled)` unchanged. All-In-1 demo: consumer-side `linkedSignal` bound `[(expandedKeys)]` replaces `defaultExpandedKeys` (scale switch re-derives, toggles write back). 138 lib + 41 app specs green
3. **Declarative children-cache invalidation — `childrenDeps` input** (decision 9) ✅ **implemented 2026-07-12**. `input<unknown>()`; a reference-unequal change behaves exactly like `invalidateChildren()` tree-wide (abort in-flight, expanded reload now, collapsed on next expand). Mirrors `resource({ params })`. Accessor signal auto-tracking rejected: the accessor is probed inside the `flat()` computed behind the WeakMap memo — consumer signal reads there would entangle the flatten graph. Headless line holds: the tree still never fetches, it only re-asks. Implementation notes: an effect (invalidation is a process, not a derivation) that skips its first run — the initial value is not a change; `invalidateChildren()` runs untracked so the effect's dep set stays `childrenDeps` alone. Spec caveat pinned: with a PROMISE accessor, invalidation's memo eviction means the next flatten probe re-fetches even collapsed branches — the cold-Observable contract (existing accessor JSDoc) is what makes "collapsed reloads on next expand, not eagerly" true, and the spec models it with `defer`. Demo (Lazy Load Only): a `nodejs/node@{main,v22.x,v20.x}` ref switcher — `[childrenDeps]="githubRef()"` handles the tree half; `switchGithubRef` handles the CONSUMER half its write-back architecture requires (drop the grafted GitHub subtree from `roots`, deregister in-flight GitHub tasks so a late old-ref resolve can't graft stale children — write-backs are now guarded by task registration). Browser-verified: an expanded root refetches pinned to the new ref, the other four sources untouched. 141 lib + 41 app specs green
4. **`SelectEvent.trigger` + `added`/`removed`** (decision 10, additive). The issue's "re-click emits nothing" is factually wrong (under `clickAction='select'` a re-click emits unconditionally) but the real gap stands: a set-shaped event can't identify the interacted row, so "active row / preview pane" consumers guess with `nodes.at(-1)`. Both write funnels know their row — thread `trigger?: T` through, derive `added`/`removed` against the previous set. Follow-up candidate (not settled): a public `focusedNode` output — preview-follows-focus would also cover keyboard navigation, which `trigger` alone doesn't
5. **Key-addressed API — `tree.byKey` facade** (decision 11 — the proposed `T | string` union rejected: `T` may itself be `string`, and the union weakens every signature). `tree.byKey.expand/collapse/toggle/isExpanded/edit/focus/scrollTo/openContextMenu/retryChildren/invalidateChildren(key)`; unknown key = no-op (`isExpanded` = false). Keys are the tree's identity currency (consumers naturally store `parentKey`); today they rebuild a key→node map the controller already owns
6. **Per-node row styling — `rowClass` / `rowStyle` accessors** (decision 12 — mechanism corrected). Accessor-shaped like `disableDrag`; applied to the tree-owned row element where the `--tree-*` chains resolve at point of use. Correction: the consumer's headline use case (per-node guide tint) is unreachable by row-applied variables — guides are per-group overlay divs, *siblings* of the rows, so nothing set on a row inherits into them. Therefore the **group parent's** accessor result is additionally applied to that group's guide overlay: one accessor, both surfaces, documented. Ships-no-UI preserved

**Demo example mapping** (each lands where it reads as a real-world pattern):

| Fix | Example | Showcase |
| --- | --- | --- |
| 1 `selectedKeys` | All-In-1 (`/`) | Front page teaches the signal-first `[(selectedKeys)]` pattern; `SelectionModel` stays spec- and docs-covered |
| 2 `expandedKeys` | All-In-1 | Search auto-expands folders with matches; clearing restores the previous expansion |
| 3 `childrenDeps` | Lazy Load Only (`/lazy`) | A real fetch parameter (e.g. GitHub ref switcher) bound to `[childrenDeps]` — flip it, caches drop, expanded branches reload |
| 4 `trigger` | Static (`/static`) | Layer-panel inspector driven by the last-clicked layer, incl. re-click of the already-selected row |
| 5 `byKey` | Lazy Load Only | Post-move refresh via `tree.byKey.invalidateChildren(parentKey)` — the stored-parent-key scenario from the feedback |
| 6 `rowStyle` | Static | Figma-faithful: component subtrees tinted (row + that group's guide) via one accessor |

Status: #1–#3 shipped 2026-07-12 (incl. the same-day `SelectionModel` removal and the `expandedKeys()` method removal; All-In-1 migrated to both controlled bindings, Static shows live `[(expandedKeys)]` status bars, Lazy Load Only gained the `[childrenDeps]` ref switcher); 4–6 pending.

## Phase 13 — DX & Ecosystem

- Documentation site (analog/ng-doc) with live StackBlitz examples per feature: lazy loading, DnD, checkbox trees, menus, theming, SSR
- Generated API reference from source JSDoc (already written in that style)
- `ng add angular-tree` schematic: peer deps + starter template
- Harness improvements beyond v1 `TreeHarness`: `dragTo` gesture simulation, menu-open helpers
- Recipes: "migrate from `mat-tree`", "migrate from `cdk-tree`", "migrate from PrimeNG `p-tree`", "migrate from jsTree" (Phase 14 adapter guide, generalized), react-arborist comparison table
- Versioning/release automation: changelogs, canary channel, Angular major-version support policy (peer range currently `^21.2 || ^22`)

## Public API Sketch — v2 additions

Satisfies the sketch-before-code rule for the settled v2 surface. Everything is **additive**; every default preserves v1 behavior. Server-search (`reveal`) is deliberately absent until the open-question-5 spike.

```ts
// Inputs:
clickAction:       'activate' | 'select';  // default 'activate' (v1 lock intact); 'select' = file-manager
                                           // semantics: plain click selects (single), dblclick activates,
                                           // Ctrl/Shift selection shortcuts unchanged in both modes
collapseBehavior:  'keep' | 'invalidate';  // default 'keep'; 'invalidate' drops the node's lazy overlay on
                                           // collapse → next expand re-runs the accessor
defaultFocusedKey: string;                 // initial roving-tabindex target (parallel to defaultExpandedKeys);
                                           // unknown key falls back to first row

// Accessor contract — additive second parameter, existing accessors stay valid:
childrenAccessor: (node: T, signal?: AbortSignal) => T[] | Promise<T[]> | Observable<T[]>;
// Aborted on: destroy, invalidate-while-in-flight, and collapse only under
// collapseBehavior: 'invalidate'. Plain collapse ('keep') lets the resolve finish
// (v1 unmount-survival precedent). Observables: abort = unsubscribe.

// TreeApi additions (CdkTree-compatible naming, nodes not keys):
interface TreeApi<T> {
  // …v1 surface unchanged
  /** Drop the keyed children overlay and re-enter loading. Expanded node → accessor
   *  re-runs immediately (spinner via loadStates); collapsed → cleared, re-runs on next
   *  expand. No argument = tree-wide. The tree still never fetches — it only re-asks. */
  invalidateChildren(node?: T): void;
}

// MoveEvent extension (additive):
interface MoveEvent<T> {
  dragIds: string[];
  parentId: string | null;
  index: number;
  dropEffect: 'move' | 'copy';  // 'copy' when the platform modifier is held at drop time
                                // (⌥ macOS, Ctrl elsewhere); keyboard path: Ctrl/Cmd+C
                                // arms copy-paste, Ctrl/Cmd+X arms move-paste
}

// Behavior, no API: focus retention across data replacement — the focused key re-attaches
// to its fresh DOM element after re-flatten; if the key vanished, fallback is nearest
// following sibling → preceding sibling → parent. Makes consumer-dialog round-trips
// refocus correctly with zero consumer code.

// --- Phase 9 sweep additions (sketched 2026-07-07) ---

// TreeApi:
expandAll(options?: { loadLazy?: boolean }): void;
// default: skip unloaded lazy subtrees (v1 behavior). loadLazy: batched
// ensureChildren over lazy nodes as they surface; each resolved batch expands
// and is scanned for further lazy nodes until the frontier is exhausted.

// TreeNodeHandle:
toggleSelection(range?: boolean): void;
// range = true → additive range from the selection anchor over visible order
// (Shift+checkbox, settled in v1 brainstorming). treeNodeCheckbox reads
// shiftKey from its click and passes it — existing callers unchanged.

// New opt-in directive (touch drag without long-press conflicts):
//   treeNodeDragHandle — wraps CDK's drag handle: the row drags only from the
//   handle, start delay drops to 0 (incl. touch — the handle IS the intent),
//   long-press elsewhere stays the context menu's.

// New input (polite live region via CDK LiveAnnouncer — no DOM shipped):
announcements: TreeAnnouncements<T> | null; // null = silent; omitted = English defaults
interface TreeAnnouncements<T> {
  moved?: (event: MoveEvent<T>) => string;
  childrenLoaded?: (event: LoadChildrenEvent<T>) => string;
  searchResults?: (count: number, term: string) => string;
}

// Keyboard map: PageUp / PageDown — viewport-height jumps (APG optional keys).
// Escape during a pointer drag cancels it: drag state resets, no `moved`.

// --- Phase 15 additions (sketched 2026-07-12, all additive) ---

// Controlled state — model() two-way; undefined = unbound (tree-owned state).
// [(selectedKeys)] / [(expandedKeys)] for shared state; one-way [x] + (xChange)
// write-back is the strictly controlled shape. The [selection] SelectionModel
// input is REMOVED (decision 7 amendment) — consumer-side bridge in RECIPES.md.
selectedKeys: model<readonly string[] | undefined>();  // #1 ✅ 2026-07-12
expandedKeys: model<readonly string[] | undefined>();  // #2 ✅ 2026-07-12 (decision 8; replaces the
                                                       //   expandedKeys() snapshot method — name collision;
                                                       //   defaultExpandedKeys stays, inert while bound)

// Declarative lazy invalidation, mirroring resource({ params }) — a
// reference-unequal change ≙ invalidateChildren() tree-wide:
childrenDeps: input<unknown>();                        // #3 ✅ 2026-07-12

// SelectEvent — additive; `trigger` identifies the interacted row even when
// the resulting set is unchanged (re-click of the selected row):
interface SelectEvent<T> {
  ids: readonly string[];
  nodes: readonly T[];
  trigger?: T;               // the row whose interaction caused this write
  added?: readonly string[]; // vs the previous set
  removed?: readonly string[];
}

// Key-addressed facade (decision 11) — unknown key = no-op:
interface TreeApi<T> {
  // …surface unchanged
  readonly byKey: {
    expand(key: string): void;    collapse(key: string): void;
    toggle(key: string): void;    isExpanded(key: string): boolean;
    edit(key: string): void;      focus(key: string): void;
    scrollTo(key: string): void;  openContextMenu(key: string): void;
    retryChildren(key: string): void;
    invalidateChildren(key?: string): void;
  };
}

// Per-node row styling (decision 12) — accessor-shaped like disableDrag;
// applied to the row element AND (the group parent's result) to that group's
// indent-guide overlay, since overlays are siblings of rows, not children:
rowClass: input<((node: T) => string | readonly string[] | undefined) | undefined>();
rowStyle: input<((node: T) => Record<string, string> | undefined) | undefined>();
```

## Settled decisions (v2)

| #   | Decision                                                                   | Outcome                                                                                                                                                                                                              | Date       |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Plain-click selection (reopened the v1 `rowClickSelects` lock, explicitly) | `clickAction: 'activate' \| 'select'` input, default `'activate'` — v1 unchanged; click-select is the file-manager norm and belongs in a general-purpose tree as an opt-in                                           | 2026-07-06 |
| 2   | Copy-on-drag surface & modifier                                            | `MoveEvent.dropEffect: 'move' \| 'copy'` (native DnD vocabulary, extensible); modifier platform-native: ⌥ macOS / Ctrl elsewhere; keyboard via `Ctrl/Cmd+C`/`X` + paste                                              | 2026-07-06 |
| 3   | Lazy overlays across `dataSource` replacement                              | Overlays survive, keyed (like expansion/selection); nothing re-fires implicitly — refresh only via explicit `invalidateChildren(key?)` or `collapseBehavior: 'invalidate'`                                           | 2026-07-06 |
| 4   | `expandAll` over lazy subtrees                                             | Opt-in `expandAll({ loadLazy: true })`: batched `ensureChildren`, expanding batches as they resolve; default stays skip — a 100k lazy tree must never fetch-storm by accident                                        | 2026-07-07 |
| 5   | `mat-checkbox` with `treeNodeCheckbox`                                     | Documented binding pattern (`[checked]`/`[indeterminate]` from `checkState`, `toggleSelection()` on change) — no Material coupling in the lib; the JSDoc "Phase 5 adapter" promise is amended                        | 2026-07-07 |
| 6   | Row-internal interactive elements (a11y)                                   | Tree-shipped row directives leave the tab order (`tabindex="-1"` — keyboard equivalents exist: arrows, Space, F2, menu); arbitrary consumer buttons follow the same documented rule. No template-walking enforcement | 2026-07-07 |
| 7   | Controlled selection surface (Phase 15) — amended same day                 | `selectedKeys` as `model<readonly string[] \| undefined>`; unbound = tree-owned state. **`[selection]` (`SelectionModel`) removed outright** (pre-release, zero consumers): one write path, no bridge effect — `selectedIds` is a `linkedSignal` over the input (echoes identity-preserved). Consumer-side bridge recipe in docs/RECIPES.md | 2026-07-12 |
| 8   | Live `expandedKeys` (reopens the v1 "expansion internal + methods" lock)   | Opt-in model input; unbound consumers keep private state (and Phase 11's O(1) in-place-mutation option); bound consumers pay O(expanded) copies per toggle knowingly. Amended on implementation: the `expandedKeys()` snapshot METHOD is removed (name collision; the bound model is the snapshot); `defaultExpandedKeys` inert while bound | 2026-07-12 |
| 9   | Declarative lazy invalidation                                              | `childrenDeps: input<unknown>()` — reference change = `invalidateChildren()` tree-wide; accessor signal auto-tracking rejected (flatten-time probe must not track consumer signals)                                  | 2026-07-12 |
| 10  | `SelectEvent` identifies the interaction                                   | Additive `trigger?: T` + `added`/`removed` threaded through the two existing write funnels; event shape otherwise unchanged                                                                                          | 2026-07-12 |
| 11  | Key-addressed imperative API                                               | `tree.byKey.*` facade, unknown key = no-op; `T \| string` unions rejected (`T` may be `string`; weakens signatures)                                                                                                  | 2026-07-12 |
| 12  | Per-node row styling                                                       | `rowClass`/`rowStyle` accessors on the row element **and** the group parent's result on that group's guide overlay (row-applied variables can't reach the sibling overlays)                                          | 2026-07-12 |

## Open questions (v2)

1. Dynamic heights: own a measured strategy (Phase 11) or double down on fixed-height + document limitations? Decides Phase 11 scope
2. Sparse selection wire format: expose `{ roots, exclusions }` publicly or keep it internal behind `expandedKeys()`-style snapshots?
3. External drops: one generic `externalDropped` intent vs typed adapters (files, text, custom)?
4. Docs site framework: analog, ng-doc, or hand-rolled? (Phase 13)
5. **Server-side search surface (Phase 12):** what's the minimal tree-side API — imperative `reveal(paths)` + a match-set input, or a pluggable async search resolver the tree drives? Does reveal auto-`ensureChildren` down ancestor paths (and what does progress/cancel look like)? How do matches in _unloaded_ subtrees interact with sparse selection and `aria-live` result counts? Unsolved — design spike required before anything lands

## Non-goals (v2)

- **Built-in menu/editor/checkbox UI** — permanent non-goal, inherited from v1
- **Zone.js support guarantees** — still zoneless-first, untested under Zone.js
- **Tree-shaking the tree into standalone sub-features** — one entry point stays
- **Row grouping / table-tree hybrid columns** — that's a data grid; out of scope
