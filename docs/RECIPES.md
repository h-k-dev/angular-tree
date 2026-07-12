# Recipes

Consumer-side patterns the headless design expects you to own. Each is a few
lines of template — deliberately not library API (ships-no-UI rule).

## Double-click

The tree never claims double-click for itself — that's a design guarantee (it's
why rename ships no pointer gesture). Two ways to use it, chosen by `clickAction`:

**Default (`clickAction="activate"`)** — single click emits `(activated)`;
double-click is entirely yours, on any element of your node template:

```html
<span class="node-name" (dblclick)="openFile(node)">{{ node.name }}</span>
```

Caveat: a double-click is also two single clicks, so `(activated)` fires twice
before your `(dblclick)` handler runs. Keep the activate handler cheap (set a
signal, highlight a row) or use the second mode.

**File-manager mode (`clickAction="select"`)** — plain click replaces the
selection and the _tree_ emits `(activated)` on double-click. No `(dblclick)`
wiring needed; the two gestures arrive pre-separated:

```html
<angular-tree clickAction="select" (activated)="open($event)" …></angular-tree>
```

## Confirm before applying an intent

Intents are _proposals_, not notifications of applied changes — the tree never
mutates your data, so "insert a confirmation dialog" is just an `await` in your
handler. Decline = don't apply = nothing happened; there is no rollback API
because there is nothing to roll back.

```ts
// Delete isn't even a tree event (deletion is an app concept) — your menu
// item is already your own callback:
async menuDelete(ids: readonly string[]) {
  const confirmed = await firstValueFrom(
    this.#dialog.open(ConfirmDelete, { data: { count: ids.length } }).afterClosed(),
  );
  if (confirmed) this.roots.update((roots) => applyDelete(roots, ids));
}

// Tree-emitted intents (moved, renamed) work the same — the event fires after
// the gesture, before any mutation. Park the payload, confirm, then apply:
async onMove(event: MoveEvent<DocNode>) {
  const confirmed = await firstValueFrom(this.#dialog.open(ConfirmMove).afterClosed());
  if (confirmed)
    this.roots.update((r) => applyMove(r, event.dragIds, event.parentId, event.index));
}
```

If a confirmed delete removes the focused row, focus retention moves focus to
the nearest visible survivor — no consumer bookkeeping.

Live in the demo: context menu → Delete opens `ConfirmDelete` (lazy-imported
MatDialog); see `tree-example.ts` in the playground's TS tab.

## `mat-checkbox` as the row checkbox

`treeNodeCheckbox` writes native `checked`/`indeterminate` element properties —
`MatCheckbox` is a component and doesn't read those. Bind its inputs from the
template context instead (settled 2026-07-07: pattern, not adapter — the lib
takes no Material dependency):

```html
<ng-container *treeNodeDef="let node; let checkState = checkState">
  <mat-checkbox
    tabindex="-1"
    [checked]="checkState === 'checked'"
    [indeterminate]="checkState === 'indeterminate'"
    (click)="$event.stopPropagation(); check.toggleSelection($event.shiftKey)"
    [aria-label]="'Select ' + node.name"
  />
  {{ node.name }}
</ng-container>
```

where `check` is the row's `TreeNodeHandle`, exposed by a two-line directive:

```ts
@Directive({ selector: '[treeCheck]', exportAs: 'treeCheck' })
export class TreeCheck {
  readonly handle = inject(TREE_NODE);
}
```

(Or skip Material's checkbox entirely: `treeNodeCheckbox` on a plain button
with your own visuals — the demo's icon-as-checkbox pattern — gets tri-state
writes and Shift-range for free.)

Notes: drive selection from `(click)` rather than `(change)` so `shiftKey` is
available for range-selection; `stopPropagation` keeps the row click's
activate/select semantics; `tabindex="-1"` keeps the checkbox out of the tab
order (docs/ACCESSIBILITY.md); `Space` on the focused row is the keyboard
toggle either way.

## Keep a CDK `SelectionModel` (consumer-side bridge)

Selection is signal-first: `[(selectedKeys)]` is the only tree input (the
`SelectionModel` input was removed pre-release, 2026-07-12 — one write path
instead of three). If surrounding code still wants a `SelectionModel`, bridge
it in your component; the tree never needs to know:

```ts
readonly model = new SelectionModel<string>(true);
readonly selectedKeys = signal<readonly string[]>([]);

constructor() {
  // tree → model
  effect(() => this.model.setSelection(...this.selectedKeys()));
  // model → tree (external writes elsewhere in your app)
  this.model.changed
    .pipe(takeUntilDestroyed())
    .subscribe(() => this.selectedKeys.set([...this.model.selected]));
}
```

`setSelection` no-ops on identical content, so the round-trip terminates.

## Loading mask over existing content

`treeLoadingDef` covers the _initial_ load. For PrimeNG-style
`loadingMode="mask"` during operations (refresh, bulk actions), overlay the
tree yourself — the tree deliberately ships no mask:

```html
<div class="tree-frame">
  <angular-tree … />
  @if (refreshing()) {
  <div class="tree-mask" aria-hidden="true"><mat-spinner diameter="32" /></div>
  }
</div>
```

```css
.tree-frame {
  position: relative;
}
.tree-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--mat-sys-surface) 60%, transparent);
}
```

Rows stay visible and focus is untouched — pair with `invalidateChildren()`
for per-subtree refreshes, which shows the per-row `isLoading` spinner instead.

## Dialog round-trip refocus

Dialogs that mutate tree data destroy the trigger row's DOM, so Material's
element-based focus restore lands on `body`. The tree's focus retention (v2)
repairs this automatically. If you need an explicit target after `afterClosed`
(e.g. focus the _new_ row after a create dialog):

```ts
this.dialog
  .open(CreateFolder)
  .afterClosed()
  .subscribe((created) => {
    if (created) this.tree().focus(created);
  });
```
