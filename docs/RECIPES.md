# Recipes

Consumer-side patterns the headless design expects you to own. Each is a few
lines of template — deliberately not library API (ships-no-UI rule).

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

## Loading mask over existing content

`treeLoadingDef` covers the *initial* load. For PrimeNG-style
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
.tree-frame { position: relative; }
.tree-mask {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: color-mix(in srgb, var(--mat-sys-surface) 60%, transparent);
}
```

Rows stay visible and focus is untouched — pair with `invalidateChildren()`
for per-subtree refreshes, which shows the per-row `isLoading` spinner instead.

## Dialog round-trip refocus

Dialogs that mutate tree data destroy the trigger row's DOM, so Material's
element-based focus restore lands on `body`. The tree's focus retention (v2)
repairs this automatically. If you need an explicit target after `afterClosed`
(e.g. focus the *new* row after a create dialog):

```ts
this.dialog.open(CreateFolder).afterClosed().subscribe((created) => {
  if (created) this.tree().focus(created);
});
```
