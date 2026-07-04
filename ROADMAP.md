# angular-tree — Roadmap

A high-performance, standalone Angular tree component inspired by [react-arborist](https://github.com/brimdata/react-arborist): flat virtualized rendering, full keyboard navigation, hierarchical drag & drop, inline renaming, and M3 theming — built on Signals, zoneless, OnPush.

## Design Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Data ownership | **Controlled** — consumer owns data via `input()`; tree emits intents (`moved`, `renamed`, `deleted`, …) and the consumer applies them | Single source of truth stays with the consumer; fits signal dataflow; no state divergence |
| Data shape | **No forced shape** — generic `T` + `childrenAccessor` + `expansionKey` (modern `CdkTree` pattern) | Material-familiar DX; consumer never reshapes data; the accessor is a natural misuse barrier |
| Node rendering | **`ng-template` contextual template** (`treeNodeDef` + `when` predicates) + behavior directives (`treeNodeToggle`) | Idiomatic Angular (CDK Table/Tree pattern); Material muscle memory |
| Imperative API | **`exportAs: 'angularTree'` + `viewChild()`**, `CdkTree`-compatible method names | Zero-setup access to `TreeApi` in template or class |
| Change detection | Zoneless-compatible, `OnPush`, signal-only state | OS-level responsiveness |
| DX priority | **DX > micro-performance** at the API boundary; performance work stays internal (flat model, virtualization) | Familiar surface lowers misuse; internals remain arborist-fast |

## Phase 0 — Public API Design (current)

Freeze the consumer-facing contract **before** building the internal model, so internals can be optimized freely without breaking consumers.

Deliverables:

- `TreeNode<T>` consumer data shape (id + children + payload)
- Component inputs/outputs (see API sketch below / `docs/API.md`)
- `TreeApi<T>` imperative surface
- Template context contract (`$implicit` node handle, level, `isExpanded`, `isSelected`, `isEditing`, `isLoading`)
- Intent event payloads (`MoveEvent`, `RenameEvent`, `SelectEvent`, `ToggleEvent`, `LoadChildrenEvent`)

- Type-narrowing spike: verify `strictTemplates` infers `TreeNodeDef<T, S>` from a type-guard `when` binding so each def's context narrows to its union member

Exit criteria: a demo consumer template compiles against the API stubs (no behavior yet) — including a discriminated-union node type with per-type defs — and the stubs pass the [STYLE.md](./STYLE.md) review checklist.

## Phase 1 — Data Architecture & Centralized API

The react-arborist `TreeApi` equivalent: one source of truth, no event bubbling through nested components.

- `TreeControllerService` provided on the host component (`providers: [...]`), internal-only
- Ingest nested `TreeNode<T>[]` input → flatten into `Map<string, FlatTreeNode<T>>`
- Core signals: `nodes`, `expandedIds: Set<string>`, `selectedIds: Set<string>`, `editingId: string | null`, `focusedId`, `searchTerm`
- `visibleNodes = computed(...)`: walks the map, skips children of collapsed nodes, produces the 1D render array
- Search: matching child keeps ancestor chain visible/expanded (react-arborist behavior)
- `checkStates = computed(...)`: **single reverse pass** over the flat array (children before parents) folding direct-child states into `Map<id, 'checked' | 'unchecked' | 'indeterminate'>` — O(n) per selection change, never per node. Rows read via per-row `computed(() => states().get(id))` so equality stops propagation → DOM updates are O(visible), not O(n)

## Phase 2 — Virtualized Rendering & Zoneless Setup

- `ChangeDetectionStrategy.OnPush`, signal inputs (`input()`, `model()`) only
- `<cdk-virtual-scroll-viewport>` wrapping the `@for` over `visibleNodes()`
- `itemSize` input (fixed height = best performance); document autosize strategy as the dynamic-height escape hatch
- Indentation via `--tree-level` CSS variable, not nested DOM

## Phase 3 — Keyboard Interaction & Lazy Loading

- CDK `FocusKeyManager` over rendered rows: Up/Down traversal of the flat array
- ArrowRight: expand; if expanded → first child. ArrowLeft: collapse; if collapsed → parent
- Enter: activate / start rename (configurable). Space: toggle selection. Home/End, type-ahead
- Lazy loading: async `childrenAccessor` → node `isLoading` in template context, focus retained
- Lazy-load **failure** states: accessor rejection/error → `hasError` in template context + `tree.retryChildren(node)`; never leave a node stuck in `isLoading`
- Focus restoration after virtual-list recalculation: `afterNextRender` + `data-node-id` query + `.focus()`
- RTL: ArrowLeft/ArrowRight semantics flip via `Directionality` (expand/collapse mirrored)

## Phase 4 — Drag & Drop in a Flat Virtual List

The hard part react-arborist solved: flat list drag, hierarchical drop.

- `cdkDrag` per node; **no** standard CDK list sorting
- Three-zone drop math on the hovered row's bounding box:
  - top 25% → insert before (previous sibling)
  - middle 50% → make child (auto-add target to `expandedIds` after hover delay)
  - bottom 25% → insert after (next sibling)
- Purely visual absolutely-positioned drop indicator; no mid-drag DOM reordering
- Emits `moved` intent `{ dragIds, parentId, index }` — consumer mutates data (controlled)
- Guards: can't drop into own descendant; optional `disableDrop` predicate input

### ⚠️ Biggest open challenge: multi-node drag & drop

Decide whether dragging a selected node drags the *entire selection* (react-arborist does):

- `MoveEvent.dragIds: string[]` is already plural — the event contract stays stable whichever way we decide
- Redundancy pruning: if an ancestor and its descendant are both selected, drag only the ancestor
- Drag preview: one representative row + count badge — never render N `cdkDrag` previews
- Drop validation must check *every* dragged id against the target (no drop into any dragged subtree)
- CDK complication: `cdkDrag` is single-element by design; multi-drag means custom preview + manual drop math (which we do anyway for the three-zone logic)
- De-risk option: ship v1 single-drag with the plural event contract; add multi-drag in v1.x without breaking changes

### DnD completeness

- **Auto-scroll near viewport edges** while dragging — must drive `CdkVirtualScrollViewport.scrollToOffset()` manually (standard `cdkDropList` auto-scroll doesn't know our viewport); newly-virtualized rows must pick up drop-zone tracking mid-drag
- **Keyboard move alternative (WCAG 2.5.7)**: every drag must have a non-pointer path — cut/paste-style `Ctrl+X` (mark selection), navigate, `Ctrl+V` (drop into), `Ctrl+Shift+V` (drop before/after); emits the same `MoveEvent`
- **Touch**: long-press = drag (cdkDrag default) conflicts with long-press = context menu; pick one (context menu wins, drag via handle on touch?) and document it
- **RTL**: three-zone math is Y-axis only (safe), but indent guides and drop-indicator inset must use logical properties + `Directionality`

## Phase 5 — Material 3 Theming

- `--tree-*` component tokens → `--mat-sys-*` fallback → hardcoded hex fallback (works without Material)
- Tokens: surfaces (`bg`, `hover`, `selected`), text/typography, focus ring, drop indicator
- Indentation: `padding-inline-start: calc(var(--tree-level) * var(--tree-indent, 1.5rem))`
- No Material component dependency — CDK only

## Phase 6 — Accessibility

- `role="tree"` on the viewport, `role="treeitem"` per row
- `aria-level` from flattened depth, `aria-expanded` on parents only (omitted for leaves)
- **`aria-setsize` + `aria-posinset` — mandatory with virtualization**: the DOM holds only rendered rows, so without these a screen reader announces "3 of 28" instead of "3 of 100,000". Computed from the flat model (siblings per parent), not the DOM
- `aria-selected` bound to `selectedIds`, `aria-activedescendant` during async focus states
- With `checkboxSelection`: tri-state `aria-checked` (`true`/`false`/`mixed`) on the `treeitem` per the ARIA checkbox-tree pattern — not `aria-selected`
- **Align semantics & naming with `@angular/aria/tree`** (v21 dev preview): `multi`, `selectionMode: 'explicit' | 'follow'`, `focusMode: 'roving' | 'activedescendant'`, Shift+Arrow range selection. We can't build *on* it (nested `<ul>` DOM, no virtualization) but our keyboard/ARIA behavior should be indistinguishable from it
- Screen-reader pass + axe audit as exit criteria

## Phase 7 — Context Menu & Overlay Integration

We don't ship a menu — the tree must be a *good host* for all three Angular menu systems:

| Menu system | Trigger | Notes |
|---|---|---|
| MatMenu | `matContextMenuTriggerFor` | Official since recent Material; no backdrop by default (re-right-click works) |
| CDK Menu | `cdkContextMenuTriggerFor` | Headless, `@angular/cdk/menu` |
| Angular Aria Menu | `ngMenuTrigger` + CDK Overlay | Uses native Popover API (`usePopover: 'inline'`) → top layer |

Tree-side contract:

- Right-click / `contextmenu` on a row: if the node is **not** selected → select it first (replace selection); if it **is** part of a multi-selection → keep the selection intact (OS convention)
- Keyboard menu access: `ContextMenu` key and `Shift+F10` on the focused row
- Expose per-row outlet/context so the consumer attaches any trigger inside `treeNodeDef` — the tree never assumes a menu exists
- `(contextRequested)` intent event `{ ids, node, position }` for programmatic menus (`MatMenuTrigger.openMenu()` pattern)

### Stacking context — no joke, tested explicitly

Three transform-creating layers stack up: `cdk-virtual-scroll-viewport` (transformed content wrapper) × `cdkDrag` previews (transforms) × overlay containers. Rules:

- Menus/dialogs must render in the **CDK overlay container or native top layer** — never inside the viewport DOM (clipped + transformed ancestor breaks `position: fixed`)
- Drop indicator stays *inside* the scroll content (it must scroll with rows), so it needs no global z-index
- Drag preview renders in CDK's body-level container — verify it stacks above an open MatDialog when the tree lives in one

## Phase 8 — Hardening & Release

- Vitest unit coverage: flattening, visibility computation, drop-zone math, keyboard map
- **Integration test matrix (required):**
  - Tree hosted inside `MatDialog`: focus trap doesn't fight `FocusKeyManager`; context menu opens, receives focus, restores focus to the row on close; drag preview stacks above the dialog
  - Context menu × all three menu systems (MatMenu, CDK Menu, Angular Aria) — open via right-click and Shift+F10, at top/bottom virtualized edges of the viewport
  - Scroll-while-menu-open behavior (close on scroll vs. reposition — decide and test)
  - Screen reader: `aria-setsize`/`posinset` announce true positions at both virtualized edges; keyboard move (cut/paste) end-to-end
  - RTL run of the keyboard + DnD suites
- Perf benchmark: 100k nodes, expand-all, scroll, search
- **Component test harness** (`@angular/cdk/testing`, Material-style `TreeHarness`): consumers test `expandNode`, `getVisibleNodes`, `dragTo` without knowing our DOM — same DX as `MatTreeHarness`
- Demo app + docs; ng-packagr build; publish

## Cross-cutting Concerns

- **RTL**: logical CSS properties throughout (already in theming), `Directionality`-aware keyboard + drop indicator; RTL case in the test matrix
- **SSR / hydration**: virtual viewport has no size on the server — render first `ssrRowCount` rows statically, reconcile on hydration; no `afterNextRender` on server; verify zoneless + incremental hydration
- **Empty & root-loading states**: optional `treeEmptyDef` / `treeLoadingDef` templates; sensible blank defaults
- **Version policy**: Angular/CDK ≥ v21 peer deps; CDK is the only runtime dependency; `@angular/aria` is a *naming/semantics* alignment target, not a dependency (it's dev preview)

## Non-goals (v1)

Explicit, to keep scope honest — each is a common ask for tree libraries:

- **Sparse selection over unloaded subtrees** — v1 checkbox cascade covers *loaded* nodes only (documented). The "selected-roots + exclusions" model needed for "check parent = everything under it, loaded or not" is deferred; `checkboxSelection` semantics don't preclude it later
- **Cross-tree / external drag & drop** (incl. OS file drops) — single-tree only in v1; `MoveEvent` contract doesn't preclude it later
- **Flat input data (`levelAccessor`)** — nested `childrenAccessor` only in v1
- **Built-in context menu or inline editor UI** — the tree hosts them (Phase 7), never ships them
- **Zone.js support guarantees** — designed zoneless-first; should work under Zone.js but it's not a tested target

---

## Public API Sketch — v2 draft (Material-aligned)

Guiding principle: **DX over raw API minimalism, Material muscle memory over react-arborist naming.** The consumer's data stays untouched — accessors describe it (modern `CdkTree` pattern, `TreeControl` is deprecated). The arborist-style flat model is purely internal.

```html
<angular-tree #tree="angularTree"
  [dataSource]="files()"
  [childrenAccessor]="getChildren"   
  [expansionKey]="getId"             
  [selection]="selectionModel"       
  [multi]="true"
  [checkboxSelection]="true"
  [itemSize]="32"
  [searchTerm]="search()"
  [disableDrop]="isDropForbidden"
  (moved)="onMove($event)"
  (renamed)="onRename($event)"
  (activated)="onOpen($event)"
  (contextRequested)="openMenu($event)">

  <!-- expandable node -->
  <ng-template treeNodeDef let-node [treeNodeDefWhen]="hasChild"
               let-isExpanded="isExpanded" let-isEditing="isEditing">
    <button treeNodeToggle>{{ isExpanded ? '▾' : '▸' }}</button>
    <!-- Gmail-style swap: checkbox when selection is active, icon otherwise -->
    @if (tree.selectionActive()) {
      <mat-checkbox treeNodeCheckbox />
    } @else {
      <mat-icon>folder</mat-icon>
    }
    @if (isEditing) {
      <input treeNodeEditInput [value]="node.name" />
    } @else {
      <span [matContextMenuTriggerFor]="menu">{{ node.name }}</span>
    }
  </ng-template>

  <!-- leaf (fallback def) -->
  <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
</angular-tree>
```

```ts
// No forced node shape — generic T + accessors:
childrenAccessor: (node: T) => T[] | Promise<T[]> | Observable<T[]>; // async return = lazy loading
expansionKey:     (node: T) => string;

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
- **Directives over NodeHandle methods** — `treeNodeToggle`, `treeNodePadding`-style; context exposes plain values (`isExpanded`, `isSelected`, `level`, `isEditing`, `isLoading`)
- **Multiple `treeNodeDef` with `when` predicates** — leaf vs. folder templates, Material-style. First matching def wins; undecorated def is the fallback
- **Typed node classification** — `T` may be a discriminated union; `when` predicates are typed as *type guards* (`(node: T) => node is S`) and `TreeNodeDef<T, S>` + static `ngTemplateContextGuard` narrows the template context to `S` under `strictTemplates` (better than CDK Table, whose `when` doesn't narrow). Needs a type-inference spike in Phase 0
- **Behavior per type via predicates, not templates** — `disableDrag(node)`, `disableDrop(ctx)`, `disableEdit(node)`, `isSelectable(node)` all receive the typed node. The tree never interprets a type field itself — no `nodeType` input or registry; classification stays a consumer concept expressed through guards
- **Selection: CDK `SelectionModel` input**, but the tree drives ctrl/shift-range semantics (only it knows visible flat order); naming aligned with `@angular/aria/tree` (`multi`, `selectionMode`)
- **Checkbox interaction: Gmail semantics (decided)** — checkbox and row click coexist: plain row click *activates* (never mutates selection), checkbox click toggles selection, Shift+checkbox range-selects over visible order. Keyboard mirrors it: `Space` toggles check on the focused row, `Enter` activates. Ctrl/Shift+row-click stay as power-user selection shortcuts (no conflict with activation on plain click)
- **Checkbox selection: `[checkboxSelection]` flag** (MUI precedent; `selectionMode` was taken by aria alignment) enables cascade semantics: check parent → selects loaded descendants; parent tri-state derived via the O(n) reverse-pass `checkStates` computed. The tree ships **no checkbox UI** — a `treeNodeCheckbox` directive wires any element (native input, `mat-checkbox`) to derived state (`checked`/`indeterminate`) and toggle. Icon↔checkbox swapping (Gmail-style) is consumer template logic driven by a `selectionActive()` signal — swap, always-show, or hover are all the consumer's choice
- **Expansion state internal + methods** (strict Material surface), plus a read-only `expandedKeys()` snapshot for persistence and `defaultExpandedKeys` / `setExpanded(keys)` for restore. Also the *performant* choice: no consumer CD dirty-marking per toggle, and private state permits O(1) in-place Set mutation + version bump instead of the O(expanded) immutable copies a public `model<Set>` contract would force
- **Rename: tree owns editing state only**; consumer renders the input inside the template
- **Flat input data (`levelAccessor`)** — deferred to a later phase; nested-only in v1

### Still open

1. Multi-node drag & drop: v1 or v1.x? (see Phase 4)
2. Context menu scroll behavior: close-on-scroll vs. reposition (see Phase 7/8)
3. `treeNodeDefWhen` syntax: structural (`*treeNodeDef="let n; when: hasChild"`) vs. explicit `<ng-template>` binding
