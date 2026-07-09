# Context Menus

The tree ships a **built-in context-menu host** (settled 2026-07-06): you project the menu _items_, the tree owns every mechanic around them — trigger, positioning, keyboard access, close-on-scroll, and the overlay shell. The tree still ships no item UI and no item styling.

## The built-in host: `treeContextMenu`

```html
<angular-tree [dataSource]="…" …>
  <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>

  <ng-template treeContextMenu let-node let-ids="ids">
    @switch (node.kind) { @case ('folder') {
    <button cdkMenuItem (cdkMenuItemTriggered)="tree.expandDescendants(node)">Expand subtree</button>
    } @default {
    <button cdkMenuItem (cdkMenuItemTriggered)="remove(ids)">Delete ({{ ids.length }})</button>
    } }
  </ng-template>
</angular-tree>
```

What the tree does when the def is present:

- **Right-click anywhere on a row** — folder or leaf, label or whitespace — opens the menu at the pointer (OS convention; no pixel-targeting of label spans). The browser menu is suppressed on rows, but **never inside inputs**: a rename field keeps its paste menu. Empty space below the rows stays untouched.
- **`Shift+F10` / `ContextMenu` key** open the same menu anchored to the focused row's rectangle — one code path with the mouse, not a parallel implementation.
- **`TreeApi.openContextMenu(node)`** opens it programmatically — wire a `more_vert` button in your row template for a discoverable, keyboard-friendly entry point.
- **Close-on-scroll** is built in: virtualization destroys a row's DOM when it leaves the render range, so repositioning would track a recycled element (settled decision, now enforced by the tree).
- The items render inside a `cdkMenu` **shell** in the CDK overlay container — correct stacking above dialogs, arrow-key navigation between `cdkMenuItem` children for free.

### Template context

| Binding              | Type                | Meaning                                                    |
| -------------------- | ------------------- | ---------------------------------------------------------- |
| `$implicit` / `node` | `T`                 | The clicked / focused node — branch your items on its type |
| `nodes`              | `readonly T[]`      | Post-reconciliation selection as nodes                     |
| `ids`                | `readonly string[]` | …the same selection as keys — what the menu should act on  |
| `position`           | `{ x, y }`          | Where the menu opened                                      |

Selection reconciliation happens _before_ the context is built (OS convention): right-clicking an unselected row selects it (replace); a row inside a multi-selection keeps the selection intact — so `ids`/`nodes` are always the set the user expects the action to hit.

### Shell tokens

| Token                | Fallback                                  | Used for            |
| -------------------- | ----------------------------------------- | ------------------- |
| `--tree-menu-bg`     | `--mat-sys-surface-container` → `#f3edf7` | Shell background    |
| `--tree-menu-radius` | `8px`                                     | Shell corner radius |
| `--tree-menu-shadow` | `--mat-sys-level2` → soft shadow          | Shell elevation     |

Item styling is entirely yours (the demo styles `.doc-menu-item` in its own stylesheet).

## The intent event (external hosting — recipe only)

`(contextRequested)` still emits **before** the built-in menu opens (or without any def present):

```ts
(contextRequested) => { ids: string[]; node: T; position: { x: number; y: number } }
```

Use it to host an external menu system instead of — or alongside — the built-in one. Without a `treeContextMenu` def the tree never calls `preventDefault()` on native `contextmenu`; suppression is then your trigger's job. Notes from when the demo hosted these directly:

- **MatMenu** (`matContextMenuTriggerFor` on the tree host element): works for mouse right-click, but `MatContextMenuTrigger` has no public coordinate `open()` — the keyboard path can't be wired to it. A row-template button with plain `matMenuTriggerFor` is the keyboard-accessible alternative.
- **Angular Aria Menu** (`ngMenuTrigger` + CDK Overlay): native Popover API (`usePopover: 'inline'`) → top layer.
- Configure **close-on-scroll** yourself (`scrollStrategies.close()`; MatMenu defaults to reposition — override `MAT_MENU_SCROLL_STRATEGY`).

## Stacking context — the three-layer problem

Three transform-creating layers interact: the virtual viewport's transformed content wrapper, `cdkDrag` previews, and overlay containers. The rules (ROADMAP Phase 7):

1. Menus and dialogs must render in the **CDK overlay container or the native top layer** — never inside the viewport DOM. A transformed, clipped ancestor breaks `position: fixed`. The built-in shell does this by construction.
2. The tree's drop indicator overlays the host element (not the page), so it needs no global z-index and can't fight your overlays.
3. The drag preview renders in CDK's body-level container. Its stacking above an open `MatDialog` is asserted in the Phase 8 integration matrix.
