# angular-tree — Roadmap

A high-performance, standalone Angular tree component inspired by [react-arborist](https://github.com/brimdata/react-arborist): flat virtualized rendering, full keyboard navigation, hierarchical drag & drop, inline renaming, and M3 theming — built on Signals, zoneless, OnPush.

## Design Decisions (locked)

| Decision         | Choice                                                                                                                                 | Rationale                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Data ownership   | **Controlled** — consumer owns data via `input()`; tree emits intents (`moved`, `renamed`, `deleted`, …) and the consumer applies them | Single source of truth stays with the consumer; fits signal dataflow; no state divergence    |
| Data shape       | **No forced shape** — generic `T` + `childrenAccessor` + `expansionKey` (modern `CdkTree` pattern)                                     | Material-familiar DX; consumer never reshapes data; the accessor is a natural misuse barrier |
| Node rendering   | **`ng-template` contextual template** (`treeNodeDef` + `when` predicates) + behavior directives (`treeNodeToggle`)                     | Idiomatic Angular (CDK Table/Tree pattern); Material muscle memory                           |
| Imperative API   | **`exportAs: 'angularTree'` + `viewChild()`**, `CdkTree`-compatible method names                                                       | Zero-setup access to `TreeApi` in template or class                                          |
| Change detection | Zoneless-compatible, `OnPush`, signal-only state                                                                                       | OS-level responsiveness                                                                      |
| DX priority      | **DX > micro-performance** at the API boundary; performance work stays internal (flat model, virtualization)                           | Familiar surface lowers misuse; internals remain arborist-fast                               |

## Phase 0 — Public API Design ✅ complete 2026-07-05

Freeze the consumer-facing contract **before** building the internal model, so internals can be optimized freely without breaking consumers.

Deliverables:

- `TreeNode<T>` consumer data shape (id + children + payload)
- ~~Component inputs/outputs~~ ✅ **2026-07-05**: all sketch inputs stubbed (`selection`, `multi`, `checkboxSelection`, `searchTerm`, per-type predicates `disableDrag`/`disableDrop`/`disableEdit`/`isSelectable`) + outputs (`moved`, `renamed`, `activated`, `selectionChange`, `toggled`, `childrenLoaded`, `contextRequested`). `selectionActive()` signal stubbed for the Gmail icon↔checkbox swap. Caveat noted in code: `SelectionModel` isn't signal-reactive yet — Phase 1 bridges it
- ~~`TreeApi<T>` imperative surface~~ ✅ **2026-07-05**: expansion suite live (`expand`/`collapse`/`toggle`/`expandAll`/`collapseAll`/`expandDescendants`/`isExpanded`/`expandedKeys`/`setExpanded`) — single write path emits the `toggled` intent; `edit()` live (respects `disableEdit`); `focus()`/`scrollTo()`/`retryChildren()` stubbed as throwing `notImplemented` per STYLE.md (Phase 3)
- ~~Template context contract~~ ✅ **2026-07-05**: `$implicit`, `level`, `expandable`, `index`, `isExpanded`, `isSelected`, `isEditing`, `isLoading`, `hasError` (lazy-failure state, Phase 3 wires it)
- ~~Intent event payloads~~ ✅ **2026-07-05** (`events.ts`): `MoveEvent`, `RenameEvent`, `SelectEvent`, `ToggleEvent`, `LoadChildrenEvent`, plus `ContextRequestedEvent` (Phase 7 contract). `LoadChildrenEvent` is a _notification_ of accessor resolution (`'loaded' | 'error'`), not a load request — reconciles with the settled "no separate `loadChildren` output". `TreeChildrenAccessor` now types async returns (`Promise`/`Observable`) for lazy loading

- ~~Directive contract stubs~~ ✅ **2026-07-05**: `treeNodeToggle`, `treeNodeCheckbox`, `treeNodeEditInput` — selectors + `TREE_NODE` DI seam frozen; checkbox state wiring lands Phase 1, edit commit/cancel keys Phase 3
- ~~Demo consumer template~~ ✅ **2026-07-05**: demo app exercises the full sketch — structural `*treeNodeDef="let n; when: isFolder"` (canonical) for the folder def, explicit `<ng-template treeNodeDef>` for the file fallback, Gmail icon↔checkbox swap via `tree.selectionActive()`, inline-rename via `isEditing` + `tree.edit()`, all inputs/outputs bound
- ~~Type-narrowing spike~~ ✅ **VERIFIED 2026-07-05**: `strictTemplates` infers `TreeNodeDef<T, S>` from a type-guard `when` binding; the def's context narrows to the union member (probe: `node.size` inside an `isFolder` def produces TS2339). Living evidence: `projects/app/src/app/narrowing-spike.ts`. Caveats: `S` defaults to `any` (CDK Table trade-off) so fallback defs are untyped; boolean (non-guard) `when` predicates need a cast

Exit criteria: ✅ **met 2026-07-05** — demo app compiles against the stubs under `strictTemplates` with a discriminated-union node type and per-type defs (narrowing re-verified in _structural_ syntax: `node.size` in the folder def produces TS2339); library + app build green; 8 vitest specs pass (incl. `toggled` intent emission); stubs reviewed against the STYLE.md checklist (no side-effect computeds, no `console.log` placeholders — unimplemented API throws `notImplemented`, no new `any` — the demo's `$any($event.target)` was replaced with a typed handler).

## Phase 1 — Data Architecture & Centralized API ✅ complete 2026-07-05

The react-arborist `TreeApi` equivalent: one source of truth, no event bubbling through nested components.

Exit note: lib + app builds green, 23 vitest specs pass, STYLE.md checklist reviewed. Selection _interaction_ semantics (ctrl/shift range, keyboard) are deliberately Phase 3 — Phase 1 delivers the state model and cascade math.

- ~~`TreeController`~~ ✅ **2026-07-05** (CLI-generated, `@Service()`) — provided on the host component, internal-only (not in `public-api.ts`)
- ~~Ingest nested input → flatten~~ ✅ **2026-07-05**: `flat = computed(...)` → `{ list, map, rootKeys }` in DFS pre-order (expansion-independent); `FlatTreeNode` carries `parentKey`/`childKeys`/`loaded`/aria positions
- ~~Core signals~~ ✅ **2026-07-05**: `expandedIds` (linkedSignal from `defaultExpandedKeys`), `selectedIds`, `editingId`, `focusedId`; `searchTerm` stays a component input handed over via `connect()`
- ~~`visibleNodes` computed~~ ✅ **2026-07-05**: DFS walk over `rootKeys`, collapsed subtrees skipped, returns `{ flat, isExpanded }` rows
- ~~Search~~ ✅ **2026-07-05**: `searchVisibleIds` computed — match keeps ancestor chain visible, ancestors render force-expanded, `expandedIds` never mutated (term cleared = expansion intact); inert without `searchMatch`
- ~~`checkStates` computed~~ ✅ **2026-07-05**: single reverse pass over the DFS pre-order list (children before parents), O(n) per selection change; leaves/lazy-pending carry own selection (cascade covers loaded nodes only); rows read via per-row `computed` handles (component side)
- ~~Component delegation~~ ✅ **2026-07-05**: `AngularTree` provides `TreeController` and hands its input signals over via `connect()`; `TreeApi` delegates; row contexts expose `isSelected`/`isEditing` as getters over per-row computeds → a selection change re-renders only rows whose state flipped, and `visibleRows` no longer depends on selection/editing at all
- ~~SelectionModel bridge~~ ✅ **2026-07-05**: effect subscribes `model.changed` → mirrors into `selectedIds` (model stays the consumer's source of truth); tree-side toggles write through the model when present; model-less mode falls back to the internal Set. `selectionActive()` is now truly reactive (Phase 0 caveat resolved)
- ~~`treeNodeCheckbox` wiring~~ ✅ **2026-07-05**: directive drives native `checked`/`indeterminate` via effect (host binding can't target input properties from a directive — NG8002; `indeterminate` has no attribute form) and stops click propagation (Gmail: checkbox ≠ activate). Demo: files show an always-on checkbox, folders Gmail-swap — checking files rolls parents to `indeterminate`/`checked`
- ~~Unit tests~~ ✅ **2026-07-05**: 12 controller specs (flatten/DFS invariant, aria positions, lazy-pending, visibility, search inert/ancestor-chain/expansion-restore, tri-state fold, toggle deltas) + 9 component specs (SelectionModel bridge, cascade via row handle, search filter/restore, toggled intent) — 21 green

## Phase 2 — Virtualized Rendering & Zoneless Setup ✅ complete 2026-07-05

Head start from Phases 0/1 meant Phase 2 was verification + documentation: zoneless confirmed (no zone.js in the dependency graph), ≈110k-node demo mode, 102k-node perf smoke specs (all sub-2s bounds passed with 1–2 orders of magnitude headroom), and [docs/VIRTUALIZATION.md](./docs/VIRTUALIZATION.md).

- ~~`ChangeDetectionStrategy.OnPush`, signal inputs only~~ ✅ (Phase 0) — and **zoneless verified 2026-07-05**: no `zone.js` dependency anywhere; app runs Angular 22 zoneless defaults (`Eager` CD in app components), lib is OnPush + signal-only
- ~~`<cdk-virtual-scroll-viewport>` + `cdkVirtualFor`~~ ✅ (Phase 0), smoke-tested at scale 2026-07-05: demo toolbar "100k mode" toggle switches to a ≈110k-node dataset (`generateExampleTree('xl')`), fully expanded by default
- ~~Perf smoke spec~~ ✅ **2026-07-05** (`tree-controller.perf.spec.ts`, 102,550 nodes): flatten, expand-all visibility, per-toggle recompute, checkStates fold, and full-model search each complete in single-digit-to-low-double-digit ms locally (entire 5-spec file: 189ms); loose CI bounds guard against O(n²) regressions only — the Phase 8 benchmark does real measurement
- ~~`itemSize` input + autosize documentation~~ ✅ **2026-07-05**: [docs/VIRTUALIZATION.md](./docs/VIRTUALIZATION.md) — fixed-height rationale, `@angular/cdk-experimental` autosize as the documented (not wrapped/re-exported) escape hatch with its trade-offs, lazy-load + DnD + SSR interactions
- ~~Indentation via `--tree-level` CSS variable~~ ✅ (Phase 0)

## Phase 3 — Keyboard Interaction & Lazy Loading ✅ complete 2026-07-05

Exit note: 43 vitest specs green (keyboard map incl. RTL + type-ahead, lazy resolve/error/retry/dedupe/unmount-survival), lib + app builds clean, STYLE.md checklist reviewed (one documented computed-purity exception: accessor memoization). `focus()`/`scrollTo()`/`retryChildren()` are live — no `notImplemented` stubs remain in the public API.

- ~~CDK `FocusKeyManager`~~ → **Controller-driven focus (decision revised 2026-07-05, raised explicitly)**: `FocusKeyManager` manages _rendered_ item directives, but under virtualization the target of Home/End/type-ahead — or the focused row itself — often has no DOM. Instead: `focusedId` signal over the flat model, one `keydown` handler on the viewport, roving `tabindex` on rows, scroll-into-view + `afterNextRender` focus for offscreen targets. Same behavior contract as `@angular/aria/tree`
- ~~ArrowRight/ArrowLeft semantics~~ ✅ **2026-07-05**: expand / into-first-child, collapse / up-to-parent; horizontal arrows normalized against `Directionality` before the switch, so RTL flips for free
- ~~Enter / Space / Home / End / type-ahead~~ ✅ **2026-07-05**: `enterAction` input (`'activate'` default, `'edit'`); Space toggles selection (Gmail keyboard mirror); Home/End jump the full flat array (works because focus is controller-driven, not DOM-driven); type-ahead prefix-matches `typeaheadText` from the focused row, wrapping, 500ms buffer. Keys inside `treeNodeEditInput` are left to the input; `treeNodeEditInput` now implements Enter-commit / Escape-cancel / blur-commit + autofocus-select (its Phase 3 promise)
- ~~Focus engine~~ ✅ **2026-07-05**: roving `tabindex` via per-row computed, one `keydown` + `focusin` handler pair on the viewport, `focus()`/`scrollTo()` implemented (`notImplemented` stubs gone) — offscreen targets scroll into range, then `afterNextRender` + `data-node-id` query focuses the fresh DOM
- ~~Lazy loading core~~ ✅ **2026-07-05**: `TreeController.ensureChildren(key)` — async accessor resolution (Promise + Observable via `firstValueFrom`), resolved children overlaid by key into `flat` (lazy children flatten identically to sync ones afterward), `loadStates` signal drives `isLoading`/`hasError`, `retryChildren` clears error + re-runs. Lib peer deps corrected: `@angular/cdk` + `rxjs` were missing (both real runtime deps), Angular ranges now `^21.2 || ^22`
- ~~**Lazy loading must be virtualization-proof (settled 2026-07-05, raised as risk)**~~ ✅ **2026-07-05**: loads keyed to the expand _intent_; in-flight registry dedupes and survives unmount/remount (tested: expand → row destroyed mid-flight → resolve → children intact, no stuck `isLoading`)
- **Accessor calls are memoized per node object (settled 2026-07-05, found via test)**: `flat()` must probe `childrenAccessor` to know a node is expandable, but a Promise-returning accessor _starts a fetch per call_ — so results are cached in a `WeakMap` keyed by node identity (invalidated on accessor change; `retryChildren` evicts its node for a fresh call; probe-time rejections are guard-caught so they never surface as global unhandled rejections). Documented STYLE.md computed-purity exception: the memo exists to keep the accessor idempotent. Consumer contract: same node object ⇒ at most one accessor call
- ~~Lazy-load **failure** states~~ ✅ **2026-07-05**: rejection → `hasError` context + `tree.retryChildren(node)` (evicts the memoized rejection, re-runs, emits `childrenLoaded`); demo shows spinner while loading and an inline Retry button on error (lazy "Remote Archive" root, 1.2s simulated fetch)
- ~~Focus restoration after virtual-list recalculation~~ ✅ **2026-07-05**: `afterNextRender` + `data-node-id` query + `.focus()` in `#focusKey`
- ~~RTL arrow flip~~ ✅ **2026-07-05**: horizontal arrows normalized via `Directionality` before dispatch; RTL spec asserts ArrowLeft expands

## Phase 4 — Drag & Drop in a Flat Virtual List ✅ complete 2026-07-05

The hard part react-arborist solved: flat list drag, hierarchical drop.

Exit note: full multi-drag shipped in v1 per decision; 54 specs green (zone math, pruning, guards, keyboard move end-to-end incl. guard/Escape paths, consumer-side `applyMove` index contract); demo applies `moved` mutations for real. Pointer-path drag verified in the demo app (jsdom can't exercise `cdkDrag` — the Phase 8 harness adds `dragTo`).

- ~~`cdkDrag` per node; **no** standard CDK list sorting~~ ✅ **2026-07-05**: `cdkDropList` + `sortingDisabled`, per-row `cdkDrag`
- ~~Three-zone drop math~~ ✅ **2026-07-05** (controller, pure + spec'd): `dropZoneAt` (25/50/25, computed from fixed `itemSize` — no `elementFromPoint`), `dragKeysFor` (selection-if-pressed-row-selected, ancestor pruning, DFS order), `dropTargetFor` (before/after against sibling group, inside appends, leaf-inside degrades to after, every dragged id guarded against target chain)
- ~~Purely visual drop indicator~~ ✅ **2026-07-05**: absolutely-positioned overlay on the host (logical `inset-inline-*` → RTL-correct), line for before/after, outline box for inside; `cdkDropList` with `sortingDisabled` — zero mid-drag DOM reordering; drop-return animation suppressed (the consumer applies the move, an animation to the old spot lies)
- ~~`moved` intent~~ ✅ **2026-07-05**: emitted on release with the validated pending target; hovered row + zone are pure arithmetic from fixed `itemSize` (no `elementFromPoint`)
- ~~Guards~~ ✅ **2026-07-05**: descendant/self guards in `dropTargetFor` (every dragged id), `disableDrop` predicate consulted per hover, `disableDrag` per row via `cdkDragDisabled`
- ~~Multi-drag preview~~ ✅ **2026-07-05**: one representative row (`typeaheadText` label when available) + count badge via `cdkDragPreview`
- ~~Auto-expand on hover~~ ✅ **2026-07-05**: make-child zone expands after 600ms (also fires lazy loads — intent-keyed as required)
- ~~Auto-scroll near viewport edges~~ ✅ **2026-07-05**: manual rAF loop drives `scrollToOffset` (32px band, ±8px/frame) and re-runs drop targeting so rows virtualized in mid-drag pick up tracking without pointer movement

### Multi-node drag & drop — **DECIDED 2026-07-05: full multi-drag ships in v1**

Dragging a selected node drags the _entire selection_ (react-arborist behavior); dragging an unselected node drags only that node (selection untouched — Gmail semantics):

- `MoveEvent.dragIds: string[]` plural contract confirmed
- Redundancy pruning: if an ancestor and its descendant are both selected, drag only the ancestor
- Drag preview: one representative row + count badge — never render N `cdkDrag` previews
- Drop validation checks _every_ dragged id against the target (no drop into any dragged subtree, no drop onto a dragged row)
- CDK complication: `cdkDrag` is single-element by design; multi-drag means custom preview + manual drop math (which we do anyway for the three-zone logic)
- **`MoveEvent.index` semantics (settled 2026-07-05)**: insertion index into the target parent's children _as they currently are_ (dragged nodes still present); the consumer removes dragged nodes first and adjusts — react-arborist convention, documented on the type

### DnD completeness

- **Auto-scroll near viewport edges** while dragging — must drive `CdkVirtualScrollViewport.scrollToOffset()` manually (standard `cdkDropList` auto-scroll doesn't know our viewport); newly-virtualized rows must pick up drop-zone tracking mid-drag
- ~~**Keyboard move alternative (WCAG 2.5.7)**~~ ✅ **2026-07-05**: `Ctrl/Cmd+X` marks (`dragKeysFor` — full pruned selection), `Ctrl+V` drops inside, `Ctrl+Shift+V` drops after, `Escape` clears; identical `dropTargetFor` + `disableDrop` validation and identical `MoveEvent`; marked rows get a `data-move-source` cut affordance
- **Touch (DECIDED 2026-07-05): context menu wins** — long-press stays reserved for the consumer's context menu (OS convention); touch drags require an opt-in drag handle in the node template; keyboard move covers the non-pointer path regardless. Documented in docs/VIRTUALIZATION.md's future DnD section
- ~~**RTL**~~ ✅ **2026-07-05**: three-zone math is Y-axis only (safe); drop indicator uses `inset-inline-*` logical properties throughout

## Phase 5 — Material 3 Theming ✅ complete 2026-07-06

Exit note: token chain restructured to point-of-use (fixing a real override bug from the Phase 0 stub), 10 documented tokens, CDK-only verified by import audit (`bidi`/`collections`/`drag-drop`/`scrolling` only — zero `@angular/material`), 54 specs + both builds green.

- ~~Token chain~~ ✅ **2026-07-06**: `--tree-*` → `--mat-sys-*` → hex, with chains at **point of use** — the Phase 0 stub declared tokens on `:host`, which silently defeated any consumer override set on an ancestor (element-level custom-property declarations beat inherited ones). Real bug, fixed and documented in the styles header
- ~~Tokens~~ ✅ **2026-07-06**: `bg`, `node-hover`, `node-selected`, `text`, `font` (full M3 `body-medium` shorthand now, not just family), `focus-ring`, `drop-indicator`, `drag-shadow` (→ `--mat-sys-level3`), `badge-text` (→ `on-primary`), `indent` (no system equivalent, 1.5rem default)
- ~~Indentation~~ ✅ (Phase 0): `padding-inline-start: calc(var(--tree-level) * var(--tree-indent, 1.5rem))`
- ~~Docs~~ ✅ **2026-07-06**: [docs/THEMING.md](./docs/THEMING.md) — token table, brand/dark/no-Material recipes, `data-*` state hooks
- ~~No Material component dependency — CDK only~~ ✅ **2026-07-06**: import audit clean; `--mat-sys-*` names appear only as CSS fallbacks (strings, not dependencies)

## Phase 6 — Accessibility ✅ complete 2026-07-06

Exit note: 61 specs green incl. 7 DOM-level ARIA specs + axe (zero violations); both interaction modes shipped (`selectionMode`, `focusMode`); screen-reader pass deferred to the Phase 8 browser matrix by design.

- ~~`role="tree"` / `role="treeitem"`~~ ✅ (Phase 0), now DOM-asserted
- ~~`aria-level` / `aria-expanded` on parents only~~ ✅ (Phase 0), now DOM-asserted
- ~~**`aria-setsize` + `aria-posinset`**~~ ✅ (Phase 0/1, from the flat model), now DOM-asserted — the DOM holds only rendered rows, so without these a screen reader announces "3 of 28" instead of "3 of 100,000"
- ~~`aria-selected` / `aria-checked`~~ ✅ **2026-07-06**: `aria-selected` bound to selection state when `checkboxSelection` is off; tri-state `aria-checked` (`true`/`false`/`mixed`) when it's on — mutually exclusive per the ARIA checkbox-tree pattern; `aria-multiselectable` on the tree under `multi`
- ~~`@angular/aria/tree` alignment~~ ✅ **2026-07-06**: `selectionMode: 'explicit' | 'follow'` (follow = arrow/click focus replaces selection), `focusMode: 'roving' | 'activedescendant'` (activedescendant keeps DOM focus on the tree — the virtualization-friendly mode: no focus loss when a focused row's DOM is recycled; row ids minted per tree instance via `encodeURIComponent(key)`), Shift+Arrow extends selection (APG), Ctrl/Cmd+click toggles, Shift+click additive range over visible order (anchor = last explicit selection). All selection writes funnel through one `#writeSelection` → single `selectionChange` shape
- ~~axe audit~~ ✅ **2026-07-06**: axe-core 4.12 runs in vitest against _rendered rows_ (jsdom viewport force-sized via `clientHeight`/`getBoundingClientRect` fakes so `cdkVirtualFor` materializes DOM) — zero violations in checkbox-tree mode (`color-contrast` excluded: paint-dependent). Structure specs assert level/setsize/posinset/expanded-on-parents-only from the DOM. jsdom quirk: `Element.scrollTo` polyfilled via explicit helper call (bare side-effect spec imports don't survive the test bundler)
- **Screen-reader pass stays a Phase 8 exit criterion** — real AT needs a real browser (already in the Phase 8 integration matrix)

## Phase 7 — Context Menu & Overlay Integration ✅ complete 2026-07-06

Exit note: tree-side contract DOM-spec'd (64 specs green total), CDK Menu hosted live in the demo with real intent-driven actions, last open design question (scroll behavior) settled, docs/CONTEXT-MENUS.md written. Browser-only verifications (MatMenu/Aria hosting, drag-preview-over-dialog, close-on-scroll behavior) remain Phase 8 matrix items as planned.

We don't ship a menu — the tree must be a _good host_ for all three Angular menu systems:

| Menu system       | Trigger                       | Notes                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MatMenu           | `matContextMenuTriggerFor`    | Official since recent Material; no backdrop by default (re-right-click works) — **live in the demo 2026-07-06**: upload dialog hosts a tree inside `MatDialog` with MatMenu context menus on folder rows (`matContextMenuTriggerData` carries the node) |
| CDK Menu          | `cdkContextMenuTriggerFor`    | Headless, `@angular/cdk/menu` — **live in the demo 2026-07-06**: rename (`tree.edit`), expand-subtree, delete (real `applyDelete` mutation), acting on the post-reconciliation `contextRequested.ids`                                                   |
| Angular Aria Menu | `ngMenuTrigger` + CDK Overlay | Uses native Popover API (`usePopover: 'inline'`) → top layer                                                                                                                                                                                            |

MatMenu + Aria Menu hosting is exercised in the Phase 8 integration matrix (three-system requirement unchanged).

Tree-side contract:

- ~~Right-click selection reconciliation~~ ✅ **2026-07-06**: unselected row → replace selection; row inside multi-selection → keep intact (OS convention); native `contextmenu` is _not_ suppressed — that's the consumer trigger's call. DOM-spec'd
- ~~Keyboard menu access~~ ✅ **2026-07-06**: `ContextMenu` key + `Shift+F10`, position anchored to the focused row's rendered rect (bottom-start); `preventDefault` on the keydown suppresses the browser's synthetic `contextmenu` → no double emission
- ~~Per-row trigger hosting~~ ✅ (by design since Phase 0): any trigger directive works inside `treeNodeDef` via the template context; the tree never assumes a menu exists — see docs/CONTEXT-MENUS.md
- ~~`(contextRequested)` intent~~ ✅ **2026-07-06**: `{ ids, node, position }` — `ids` is the post-reconciliation selection. jsdom note: `CSS.escape` is absent there; key-attribute queries use a local escape helper

Docs: ✅ [docs/CONTEXT-MENUS.md](./docs/CONTEXT-MENUS.md) (2026-07-06) — contract, three-system hosting recipes, close-on-scroll rationale, stacking rules.

### Stacking context — no joke, tested explicitly

Three transform-creating layers stack up: `cdk-virtual-scroll-viewport` (transformed content wrapper) × `cdkDrag` previews (transforms) × overlay containers. Rules:

- Menus/dialogs must render in the **CDK overlay container or native top layer** — never inside the viewport DOM (clipped + transformed ancestor breaks `position: fixed`)
- Drop indicator stays _inside_ the scroll content (it must scroll with rows), so it needs no global z-index
- Drag preview renders in CDK's body-level container — verify it stacks above an open MatDialog when the tree lives in one

## Phase 8 — Hardening & Release (current)

Pre-release scope additions ✅ **2026-07-06** (user-requested, settled above): indent guides with click-to-collapse (`indentGuides`, `--tree-guide` token) and `checkState` in the template context; demo uses the icon-as-checkbox pattern on all nodes. (`rowClickSelects` was implemented and withdrawn same day — Gmail click semantics stay locked.) Also added 2026-07-06: **consumer-template token convention** — `--tree-checkbox-touch-target` (32px) and `--tree-checkbox-radius` (4px), _consumed by consumer templates, never applied by the tree_ (no-checkbox-UI stays locked); documented in docs/THEMING.md, exercised by the demo's `.node-check`.

- Vitest unit coverage: flattening, visibility computation, drop-zone math, keyboard map
- ~~**Integration test matrix (required)**~~ ✅ **2026-07-07** — executed as a **Playwright e2e suite** (`e2e/`, `npm run e2e`, headless Chromium against the demo; config note: URLs use `127.0.0.1`, not `localhost` — Node resolves `localhost` to `::1` first, and an IPv4-only server makes `webServer` spawn a duplicate). **15 specs green. The matrix earned its keep — four real library bugs jsdom could not see, all fixed 2026-07-07:**
  1. **Menu never received focus** — CDK's context trigger leaves focus on the row; Escape and arrows went nowhere until the user clicked. Now: mouse-open focuses the menu shell (Escape + arrow entry, no item pre-highlight — OS menu behavior), keyboard/API-open focuses the first item (APG menu pattern)
  2. **Escape in a dialog-hosted menu closed both layers** — `CdkMenu` handles Escape on its own element, but the event bubbles on to the overlay keyboard dispatcher, which hands it to the hosting `MatDialog`. Now contained at the menu shell: one Escape, one layer
  3. **Menu close stranded focus** — CDK restores to its trigger (the tree host, not the row); inside a dialog the focus trap re-anchored to the container, stranding keyboard users. Now: orphaned focus (body / tabindex−1 containers) is reclaimed to the focused row; an outside-pointer close keeps the user's click target; scroll-dismiss never reclaims (it would scroll straight back)
  4. **Far focus jumps (End / Home / `focus()`) silently lost focus** — `#focusKey`'s single next-render `data-node-id` query races CDK's async row materialization after `scrollToIndex`; focus died with the recycled source row. Now: frame-aligned retry chase (bounded, newer request supersedes)
  - Verified matrix: `MatDialog` hosting (focus trap + roving tabindex coexist; menu above the dialog by paint order; per-row `more_vert` MatMenu coexists with the built-in menu; drag preview stacks above the dialog — asserted by stacking-order comparison, since `elementFromPoint` cannot see `pointer-events: none` previews); built-in menu via right-click and Shift+F10 at both virtualized edges; close-on-scroll; `aria-setsize`/`posinset` true totals at both edges; keyboard cut/paste move end-to-end; RTL arrow mirroring + drag indicator (via the new **`?dir=rtl` demo bootstrap hook** — `Directionality` samples `dir` once at construction, post-load flips are invisible, which the RTL spec documents)
- ~~Perf benchmark: 100k nodes, expand-all, scroll, search~~ ✅ **2026-07-07** (e2e, headless Chromium, 110k-node `xl` dataset fully expanded): dataset switch → first render **477ms**, 4-stop full-list scroll **436ms**, full-model search **47ms**; `scrollHeight` ≈ 3.5M px proves the render is virtual. Loose CI budgets guard O(n²)-class regressions only — the numbers above are the record
- ~~**Empty & loading states (promoted to a v1 deliverable 2026-07-06 — confirmed migration blocker)**~~ ✅ **2026-07-06**: `treeEmptyDef` (zero visible rows — no data _or_ search filtered all out) and `treeLoadingDef` (root-level load via the new `[loading]` input; distinct from per-row lazy `isLoading`) projection directives. The tree owns the centered `.tree-state` slot (overlays the host, clear of the viewport transform; `aria-live="polite"`); the consumer projects the content — no template context needed since the projected template already sees the consumer's own signals (e.g. `search()` to say "no results" vs "empty"). Loading takes precedence over empty; both blank by default. 5 specs; covers the PrimeNG `[loading]`/`loadingMode="mask"` surface for the `iusta-core` `document-tree` port (ROADMAP2 Phase 14)
- ~~**Component test harness** (`@angular/cdk/testing`, Material-style `TreeHarness`)~~ ✅ **2026-07-06**: secondary entry point **`angular-tree/testing`** — `TreeHarness` (`getVisibleNodes`/`getNode` with text/key/level/expanded/selected filters, `getVisibleTexts`, `expandNode`/`collapseNode`, `dragTo`) + `TreeNodeHarness` (`expand`/`collapse` via the template's `treeNodeToggle`, `toggleSelection` via `treeNodeCheckbox`, `activate`, `getCheckState`, `isSelected` from the documented `data-selected` hook). `dragTo` drives a _real_ CDK pointer sequence (mousedown on the row, moves + release on the viewport — the row detaches mid-drag), ending in the same validated `moved` intent as a user drag. Two CDK fake-event traps found and documented in the harness: drag distance is measured from `pageX`/`pageY` (not `clientX`), and `buttons === 0 || detail === 0` marks a mousedown as a screen-reader fake that aborts the drag. jsdom (layoutless, all rects zero) is covered by an `itemSize`-arithmetic drop-point fallback — the same math the tree itself uses; the Phase 4 "jsdom can't exercise `cdkDrag`" caveat is hereby retired. 9 harness specs (incl. guard: drag into own subtree emits nothing); 72 lib specs green. Housekeeping same day: `npm test` now runs _both_ projects (it silently ran only the app before), `npm run build` targets the lib explicitly
- ~~Demo app + docs; ng-packagr build~~ ✅ **2026-07-07**: real library README (replaces CLI boilerplate; ships in the package via ng-packagr), publish metadata in `projects/angular-tree/package.json` (description/keywords/license MIT), `npm run e2e` script; dist verified (fesm + dts + testing entry + README)
- ~~**Demo restructure: feature-tour roots**~~ ✅ **2026-07-10** — every root now earns its place: **Starred** (smart folder), **Drag & drop rules** (NEW showcase: per-type `disableDrag`/`disableDrop` combinations as self-describing nodes — locked file/folder, tagged files A/B/C, bins with `accepts` lists, a no-drops bin; chips + lock icons make each rule visible on the row), **Cases** (the ONE deep hierarchy, now 6 levels: client → matter → phase → workstream → files; alone carries standard-scale volume and the ~100k `xl` fan-out), **Remote Archive** (lazy), **Flaky server (fails once)** (NEW: first load rejects, Retry recovers) + 2 loose root files (`parentId: null` drops). The flaky root made the template's `hasError` → Retry branch reachable for the first time — and instantly caught **matrix bug #5, fixed 2026-07-10: pending/failed lazy loads never repainted the row** — `loading`/`error` states flip signals no _template_ tracked (successful loads repaint via `visibleRows()`; zoneless CD schedules nothing for untracked signals), so the spinner/Retry def stayed stale until unrelated CD ran. Fix: the row binds `[attr.data-loading]`/`[attr.data-error]` — the tracking read AND new documented styling hooks (docs/THEMING.md); DOM-level lib spec + `e2e/lazy-retry.spec.ts` (real-browser spinner → Retry → recovery). 156 specs green: 127 lib + 9 app + 20 e2e
- ~~**Pointer drop-zone remap (matrix bug #6)**~~ ✅ **2026-07-10** — user-reported via the demo ("multi-file drop between folders leaves documents hanging between the lines"): the 'after' indicator line under an **expanded** row renders between the row and its first child, but `dropTargetFor` inserted *after the row's whole subtree* — the drop landed many rows below the line. Pointer path now resolves 'after'-on-expanded to **first child** (index 0, react-arborist parity) and indents the line one level deeper so it reads as a child slot; keyboard `Ctrl+Shift+V` deliberately keeps sibling-after semantics (no indicator justifies a remap there). New `e2e/drop-zones.spec.ts` pins all three zone→target mappings — the matrix had no positional drop assertions before, which is how this hid
- ~~**Drag-preview polish + overlay `--_spacing` bug**~~ ✅ **2026-07-10** — the drag preview and context-menu shell render in CDK's _body-level_ containers, where `:host`'s private `--_spacing` never inherits: their paddings/gaps silently collapsed to zero. Fixed by re-deriving `--_spacing` locally in both rules. Preview defaults improved while at it: 8px padding all around and a translucent chip derived from the theme surface (`oklch(from var(--mat-sys-surface) l c h / 0.85)` — relative color syntax, rows shine through in both light and dark) — two new documented tokens `--tree-drag-preview-bg` / `--tree-drag-preview-text` (docs/THEMING.md)
- **Remaining before release (user-side):**
  - [ ] **Real-AT screen-reader pass** (VoiceOver / NVDA) — a headless browser can't fake an assistive stack; the DOM groundwork (true `aria-setsize`/`posinset` at virtual edges, live region, roving tabindex) is e2e-verified
  - [ ] Optional cross-browser e2e run (suite is browser-agnostic; only Chromium exercised so far)
  - [ ] Version to `1.0.0`, add `repository` field, `npm publish` from `dist/angular-tree`

## Post-v1

Everything beyond release lives in **[ROADMAP2.md](./ROADMAP2.md)** (paper cuts, SSR, 1M-node perf, deferred non-goals, DX/ecosystem). Nothing there starts before Phase 8 completes.

## Cross-cutting Concerns

- **RTL**: logical CSS properties throughout (already in theming), `Directionality`-aware keyboard + drop indicator; RTL case in the test matrix
- **SSR / hydration**: virtual viewport has no size on the server — render first `ssrRowCount` rows statically, reconcile on hydration; no `afterNextRender` on server; verify zoneless + incremental hydration
- ~~**Empty & root-loading states**~~ ✅ **2026-07-06** (Phase 8): `treeEmptyDef` / `treeLoadingDef` projection templates + `[loading]` input; tree owns the slot, consumer the content; blank by default, loading over empty
- **Version policy**: Angular/CDK ≥ v21 peer deps; CDK is the only runtime dependency; `@angular/aria` is a _naming/semantics_ alignment target, not a dependency (it's dev preview)

## Non-goals (v1)

Explicit, to keep scope honest — each is a common ask for tree libraries:

- **Sparse selection over unloaded subtrees** — v1 checkbox cascade covers _loaded_ nodes only (documented). The "selected-roots + exclusions" model needed for "check parent = everything under it, loaded or not" is deferred; `checkboxSelection` semantics don't preclude it later
- **Cross-tree / external drag & drop** (incl. OS file drops) — single-tree only in v1; `MoveEvent` contract doesn't preclude it later
- **Flat input data (`levelAccessor`)** — nested `childrenAccessor` only in v1
- **Built-in inline editor UI** — the tree owns editing _state_ only; the input is a consumer template
- ~~**Built-in context menu**~~ — **amended 2026-07-06 (user call, renegotiated explicitly)**: the tree now ships context-menu _mechanics_ (trigger, positioning, keyboard path, close-on-scroll, an unstyled-by-default CDK Menu shell) via the `treeContextMenu` template def — but never menu _items_ or their styling; those stay consumer templates with a typed context. External menu systems remain hostable via `(contextRequested)`
- **Zone.js support guarantees** — designed zoneless-first; should work under Zone.js but it's not a tested target

---

## Public API Sketch — v2 draft (Material-aligned)

Guiding principle: **DX over raw API minimalism, Material muscle memory over react-arborist naming.** The consumer's data stays untouched — accessors describe it (modern `CdkTree` pattern, `TreeControl` is deprecated). The arborist-style flat model is purely internal.

```html
<angular-tree
  #tree="angularTree"
  [dataSource]="files()"
  [childrenAccessor]="getChildren"
  [expansionKey]="getId"
  [selection]="selectionModel"
  [multi]="true"
  [checkboxSelection]="true"
  [itemSize]="32"
  [searchTerm]="search()"
  [searchMatch]="matchesNode"
  [indentGuides]="true"
  [disableDrop]="isDropForbidden"
  (moved)="onMove($event)"
  (renamed)="onRename($event)"
  (activated)="onOpen($event)"
  (contextRequested)="openMenu($event)"
>
  <!-- expandable node -->
  <ng-template treeNodeDef let-node [treeNodeDefWhen]="hasChild" let-isExpanded="isExpanded" let-isEditing="isEditing">
    <button treeNodeToggle>{{ isExpanded ? '▾' : '▸' }}</button>
    <!-- Gmail-style swap: checkbox when selection is active, icon otherwise -->
    @if (tree.selectionActive()) {
    <mat-checkbox treeNodeCheckbox />
    } @else {
    <mat-icon>folder</mat-icon>
    } @if (isEditing) {
    <input treeNodeEditInput [value]="node.name" />
    } @else {
    <span [matContextMenuTriggerFor]="menu">{{ node.name }}</span>
    }
  </ng-template>

  <!-- leaf (fallback def) -->
  <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>

  <!-- Built-in context menu (2026-07-06): ITEMS are yours, mechanics are the
       tree's (trigger, position, keyboard, close-on-scroll, cdkMenu shell) -->
  <ng-template treeContextMenu let-node let-ids="ids">
    @switch (node.kind) { @case ('folder') {
    <button cdkMenuItem (cdkMenuItemTriggered)="tree.expandDescendants(node)">Expand subtree</button>
    } @default {
    <button cdkMenuItem (cdkMenuItemTriggered)="remove(ids)">Delete ({{ ids.length }})</button>
    } }
  </ng-template>
</angular-tree>
```

```ts
// No forced node shape — generic T + accessors:
childrenAccessor: (node: T) => T[] | Promise<T[]> | Observable<T[]>; // async return = lazy loading
expansionKey:     (node: T) => string;
searchMatch:      (node: T, term: string) => boolean; // required for search — T has no shape to match against
typeaheadText:    (node: T) => string;                // required for type-ahead — same rationale
enterAction:      'activate' | 'edit';                // default 'activate'
selectionMode:    'explicit' | 'follow';              // aria alignment; 'follow' = selection tracks focus
focusMode:        'roving' | 'activedescendant';      // aria alignment; activedescendant keeps DOM focus on the tree
indentGuides:     boolean;                            // guide line per ancestor level; click collapses that group
loading:          boolean;                            // root-level load in flight → shows treeLoadingDef

// Projection templates (tree owns the slot, consumer the content):
//   treeContextMenu   — context-menu items (typed context: node/nodes/ids/position)
//   treeEmptyDef      — shown when zero visible rows (no data or search-empty)
//   treeLoadingDef    — shown while [loading] is true (over empty)

// Template context (TreeNodeContext) additionally exposes:
//   checkState: 'checked' | 'unchecked' | 'indeterminate'   ← icon-as-checkbox swap driver

// Imperative TreeApi (exportAs / viewChild), CdkTree-compatible names:
interface TreeApi<T> {
  expand(node: T): void;   collapse(node: T): void;
  expandAll(): void;       collapseAll(): void;
  expandDescendants(node: T): void;
  isExpanded(node: T): boolean;
  expandedKeys(): ReadonlySet<string>;   // read-only signal (deviation: CdkTree keeps this hidden)
  edit(node: T): void;
  focus(node: T): void;
  scrollTo(node: T): void;
  /** Opens the projected treeContextMenu anchored to the node's row (more_vert pattern). */
  openContextMenu(node: T): void;
}

// treeContextMenu template context (built-in context-menu host, 2026-07-06):
interface TreeContextMenuContext<T> {
  $implicit: T;              // the clicked/focused node (alias: node)
  node: T;
  nodes: readonly T[];       // post-reconciliation selection as nodes
  ids: readonly string[];    // …and as keys — what the menu should act on
  position: { x: number; y: number };
}

interface MoveEvent<T> {
  dragIds: string[];        // plural: multi-drag-ready even if v1 ships single-drag
  parentId: string | null;  // null = root
  index: number;
}
```

### Settled in brainstorming

- **Accessors, not `TreeNode<T>`** — Material DX; the accessor is the natural "entrance hurdle" that prevents misuse without reshaping data
- **Lazy loading via async `childrenAccessor`** — CDK-idiomatic; no separate `loadChildren` output
- **Directives over NodeHandle methods** — `treeNodeToggle`, `treeNodeCheckbox`, `treeNodeEditInput` (`treeNodeRenameTrigger` existed until 2026-07-09, removed with the no-rename-gesture decision); context exposes plain values (`isExpanded`, `isSelected`, `level`, `isEditing`, `isLoading`)
- **Multiple `treeNodeDef` with `when` predicates** — leaf vs. folder templates, Material-style. First matching def wins; undecorated def is the fallback
- **Typed node classification** — `T` may be a discriminated union; `when` predicates are typed as _type guards_ (`(node: T) => node is S`) and `TreeNodeDef<T, S>` + static `ngTemplateContextGuard` narrows the template context to `S` under `strictTemplates` (better than CDK Table, whose `when` doesn't narrow). Needs a type-inference spike in Phase 0
- **Behavior per type via predicates, not templates** — `disableDrag(node)`, `disableDrop(ctx)`, `disableEdit(node)`, `isSelectable(node)` all receive the typed node. The tree never interprets a type field itself — no `nodeType` input or registry; classification stays a consumer concept expressed through guards
- **Selection: CDK `SelectionModel` input**, but the tree drives ctrl/shift-range semantics (only it knows visible flat order); naming aligned with `@angular/aria/tree` (`multi`, `selectionMode`)
- **Checkbox interaction: Gmail semantics (decided)** — checkbox and row click coexist: plain row click _activates_ (never mutates selection), checkbox click toggles selection, Shift+checkbox range-selects over visible order. Keyboard mirrors it: `Space` toggles check on the focused row, `Enter` activates. Ctrl/Shift+row-click stay as power-user selection shortcuts (no conflict with activation on plain click)
  - _Amendment proposed and **withdrawn** 2026-07-06_: a `rowClickSelects` input (plain click toggling leaf selection) was implemented, then reverted at the user's call — plain-click-activates stays locked with no opt-out; leaf selection goes through the icon-as-checkbox (`treeNodeCheckbox`) instead
- **Indent guides ("threadlines") are tree-owned opt-in UI (settled 2026-07-06)** — `[indentGuides]` input renders guide lines; _clicking a guide collapses (and focuses) that ancestor group_ (JetBrains/VS Code affordance). Guides are pointer sugar — keyboard equivalent is ArrowLeft-to-parent, so guides stay `aria-hidden`. Token: `--tree-guide` → `--mat-sys-outline-variant`
  - _Implementation revised 2026-07-06 (user call: "should feel like Reddit")_: guides are **one continuous overlay div per expanded group**, not per-row segments — whole-line `:hover` highlight, single click target, no subpixel seams between rows. Positioned absolutely in the CDK scroll content (moves natively with rows, no per-scroll-frame work) and clamped to the rendered range via a `renderedRangeStream` mirror signal (an unclamped guide over 100k rows would be a megapixel-tall element). Groups come from a stack-based O(visible) pass that only re-runs on visibility changes, never on scroll. **Lazy loading is a non-issue** (question raised, confirmed): a guide spans _visible_ rows only — unloaded children sit behind a collapsed or loading parent and occupy zero rows, so the line's end is always known; it simply grows when a batch resolves. Hit target widened same day (user call): the clickable band is the _full indent column_ (`--tree-indent`, 1.5rem default), not a 7px strip — safe because guides only ever overlay row padding (descendants are indented ≥ 1 level deeper); the visible 1px line is a centered `::before`
- **`checkState` exposed in the template context (settled 2026-07-06)** — enables the icon-as-checkbox pattern (icon while `unchecked`, checkbox visual once `checked`/`indeterminate`) as pure consumer template logic via `treeNodeCheckbox` on any element; the tree still ships no checkbox UI. Demo shows it on folders _and_ files
- **Checkbox selection: `[checkboxSelection]` flag** (MUI precedent; `selectionMode` was taken by aria alignment) enables cascade semantics: check parent → selects loaded descendants; parent tri-state derived via the O(n) reverse-pass `checkStates` computed. The tree ships **no checkbox UI** — a `treeNodeCheckbox` directive wires any element (native input, `mat-checkbox`) to derived state (`checked`/`indeterminate`) and toggle. Icon↔checkbox swapping (Gmail-style) is consumer template logic driven by a `selectionActive()` signal — swap, always-show, or hover are all the consumer's choice
- **Expansion state internal + methods** (strict Material surface), plus a read-only `expandedKeys()` snapshot for persistence and `defaultExpandedKeys` / `setExpanded(keys)` for restore. Also the _performant_ choice: no consumer CD dirty-marking per toggle, and private state permits O(1) in-place Set mutation + version bump instead of the O(expanded) immutable copies a public `model<Set>` contract would force
- **Rename: tree owns editing state only**; consumer renders the input inside the template
- **Rename ships NO gesture at all (settled 2026-07-09, user call — supersedes the 2026-07-06 gesture decision)** — the tree exposes **`edit(node)`** (and the row handle's `beginEdit()`, both respecting `disableEdit`) as the public wiring point; the consumer attaches their own trigger: a context-menu item, their own keybinding, a row button. Rationale: the earlier slow-second-click directive (`treeNodeRenameTrigger`, Finder/Explorer pattern) fired accidental renames next to double-click-to-open, and a built-in F2 was a hidden keymap entry consumers couldn't opt out of. Both are **removed** (directive deleted, F2 dropped from the keydown map); `enterAction="edit"` remains as an explicit opt-in. Double-click stays the consumer's; the demo wires rename through its context menu (`tree.edit(node)`)
- **APG treeview audit fixes (settled 2026-07-09, user call — audit against w3.org/WAI/ARIA/apg/patterns/treeview)** — three gaps closed pre-release: (1) **tree label**: new alias inputs `aria-label` / `aria-labelledby` on `<angular-tree>` forwarded to the internal `role="tree"` viewport (the only APG _requirement_ we failed — a plain host attribute never reached AT; labelledby wins when both are set); (2) **focus entry respects selection**: the roving-tabindex fallback prefers the first _selected_ visible row before the first row; (3) **optional multi-select keys**: Shift+Space (range from the shared anchor), Ctrl/Cmd+A (select all visible, again = clear), Ctrl/Cmd+Shift+Home/End (select to edge + move focus). Deliberately skipped: `*` expand-siblings (would collide with type-ahead; revisit in ROADMAP2 if asked for)
- **`deselectOnOutsideClick` input, default `true` (settled 2026-07-09, user call)** — a pointer-down on no row (empty viewport space or outside the tree) clears the selection, file-manager style. Zero-cost design: piggybacks on the document `pointerdown` listener the tree already owns for focus bookkeeping (no second listener, no effect), guards cheapest-first (flag → selection-empty → DOM walks). Never clears on: rows, indent guides, CDK overlays (context menu / dialogs act ON the selection), scrollbar drags. Opt out when an outside toolbar consumes the selection. **Escape joins as the final Escape-ladder layer (same day)**: clears the selection after mark/drag/menu layers, focus stays on the row (APG: never drop the active element), unconsumed Escape bubbles to dialogs, and the clear announces via new `announcements.selectionCleared` (default "Selection cleared") — APG assigns Escape no meaning, so the desktop convention is free
- **Row height: `[itemSize]` is the only mechanism, republished as `--tree-row-height` (settled 2026-07-09, user call)** — virtualization stays always-on with no opt-out (now stated explicitly in README + docs/VIRTUALIZATION.md); fixed row height is what keeps offset→index math, drop zones, and scroll-to exact. The tree republishes the input as a read-only host CSS variable so consumer row-content sizing (toggle targets, spacers, indent) derives from the same number instead of repeating it — the demo consumes it. Variable per-row heights remain out: CDK autosize stays a documented consumer-side escape hatch, not a wrapped feature. **Extended same day (user call): the consumer sizing vocabulary is a three-token chain** — `--tree-row-height` (published, read-only) → `--tree-toggle-size` (master control size: toggle + checkbox targets, thread-line column via `--tree-indent`, default = row height) → leaf spacer = toggle size × `--tree-toggle-spacing-factor` (default 0.5). Documented invariant: toggle size must never exceed row height (clipped state layers, overlapping hit targets, mis-centered guides). Supersedes `--tree-checkbox-touch-target` (pre-release, removed outright); `--tree-checkbox-radius` stays
- **Flat input data (`levelAccessor`)** — deferred to a later phase; nested-only in v1
- **Context menu hosting: one OS-like menu per tree (settled 2026-07-06, user call)** — right-click must work _anywhere on any row_ (parent or leaf), with menu **items branching on node type** in the consumer template; trigger directives on label spans are an anti-pattern (pixel-targeting, split mouse/keyboard paths) and the docs now say so.
- **Built-in context-menu host: `treeContextMenu` def (settled 2026-07-06, user call — supersedes the external-recipe-only stance)** — the consumer _projects menu items_ into an `ng-template[treeContextMenu]`; the tree owns everything else: a `CdkContextMenuTrigger` on the host (armed transiently per event — the mouse path lets CDK's _own_ `contextmenu` listener open it so the triggering event threads into the outside-click stream and the right-click's trailing pointer event can't self-close it; keyboard/API call `open(position)` directly, where no trailing pointer exists. A first cut called the public `open()` on every path and flickered — open-then-instant-close — because `open()` passes no user event. A second cut armed the trigger and leaned on CDK's _own_ `contextmenu` host listener to open it; that fired in jsdom but **not on a real Mac trackpad** (the browser menu won). Final design (2026-07-06): the tree drives CDK's internal `_open(userEvent, coords)` directly — one quarantined cast (no public coordinate+event overload exists), threading the event to kill the flicker, un-gating `disabled` only for that synchronous call so empty-space clicks stay inert), a `cdkMenu` shell wrapping the projected items (tokens: `--tree-menu-bg`/`--tree-menu-radius`/`--tree-menu-shadow`), native-`contextmenu` suppression on rows **only when the def is present** (never inside inputs — rename keeps its paste menu), built-in close-on-scroll (the settled scroll decision, now enforced by the tree), and `TreeApi.openContextMenu(node)` for row-template buttons (`more_vert`). Template context: `{ $implicit/node, nodes, ids, position }` — `ids`/`nodes` are the post-reconciliation selection, so per-type actions are a `@switch` on the consumer's own discriminant. `(contextRequested)` still emits first: external systems (MatMenu, Aria) stay hostable, but are demoted to a docs recipe — **MatMenu dropped from the demo 2026-07-06 (user call)**; its no-coordinate-`open()` caveat stays documented
- **Context menu scroll behavior: close-on-scroll (settled 2026-07-06)** — under virtualization the anchor row's DOM is _destroyed_ once it leaves the render range, so "reposition" would track a recycled element; close-on-scroll is the only coherent option. The consumer configures it on their overlay (`close()` scroll strategy / MatMenu default reposition must be overridden) — recipes in docs/CONTEXT-MENUS.md; Phase 8 tests it
- **Search requires a `searchMatch` predicate (settled 2026-07-05)** — react-arborist can default to `node.data.name`, but our `T` has no forced shape, so there is nothing safe to match against. Without `searchMatch`, `searchTerm` is inert (documented, no warning spam). Matching child keeps its ancestor chain visible; visibility filtering only — expansion state is not mutated by search (term cleared = old expansion intact)
- **`treeNodeDef` syntax: both, structural canonical (settled 2026-07-05)** — `*treeNodeDef="let n; when: isFolder"` is the documented primary form (Material `matRowDef` muscle memory); the explicit `<ng-template treeNodeDef [treeNodeDefWhen]>` form works automatically since structural desugars to it. Both are tested in the demo; type narrowing verified in the explicit form applies identically to structural (same desugared binding)

### Still open

_(none — all design questions settled as of 2026-07-06)_
