# Theming

`angular-tree` is themed through CSS custom properties with a three-step fallback chain, resolved at point of use:

```
--tree-*  →  --mat-sys-*  →  hardcoded fallback
```

With Angular Material's M3 theme present, the tree picks up your theme (including dark mode) automatically through the `--mat-sys-*` system variables — zero configuration. Without Material, the hardcoded fallbacks apply and everything still works; the tree has **no Material dependency** (CDK only). Either way, any `--tree-*` token you set wins.

Because the chains sit at point of use rather than being declared on the host element, you can set tokens at any level — `:root`, a layout container, or the `angular-tree` element itself — and inheritance works as expected.

## Tokens

| Token | M3 system fallback | Final fallback | Used for |
|---|---|---|---|
| `--tree-bg` | `--mat-sys-surface` | `#ffffff` | Tree background, drag preview |
| `--tree-text` | `--mat-sys-on-surface` | `#1d1b20` | Row text |
| `--tree-font` | `--mat-sys-body-medium` | `400 0.875rem/1.25rem Roboto, sans-serif` | Typography (full `font` shorthand) |
| `--tree-node-hover` | `--mat-sys-surface-container-highest` | `#e6e6e6` | Row hover |
| `--tree-node-selected` | `--mat-sys-secondary-container` | `#e8def8` | Selected row (`[data-selected]`) |
| `--tree-focus-ring` | `--mat-sys-primary` | `#6750a4` | `:focus-visible` outline |
| `--tree-drop-indicator` | `--mat-sys-primary` | `#6750a4` | Drop line/box, count badge |
| `--tree-drag-shadow` | `--mat-sys-level3` | `0 2px 8px rgb(0 0 0 / 0.3)` | Drag preview elevation |
| `--tree-badge-text` | `--mat-sys-on-primary` | `#ffffff` | Multi-drag count badge text |
| `--tree-indent` | — | `1.5rem` | Per-level indentation step |
| `--tree-guide` | `--mat-sys-outline-variant` | `#cac4d0` | Indent guide lines (`[indentGuides]`); hover uses `--tree-focus-ring` |
| `--tree-menu-bg` | `--mat-sys-surface-container` | `#f3edf7` | Built-in context-menu shell background (`treeContextMenu`) |
| `--tree-menu-radius` | — | `8px` | Context-menu shell corner radius |
| `--tree-menu-shadow` | `--mat-sys-level2` | `0 2px 8px rgb(0 0 0 / 0.25)` | Context-menu shell elevation |

Indentation is applied as `padding-inline-start: calc(var(--tree-level) * var(--tree-indent, 1.5rem))` — logical properties, so RTL mirrors for free. `--tree-level` is set per row by the tree; treat it as read-only.

Indent guide lines are drawn at `calc(var(--tree-indent) / 2)` within the indent column, so they stay centered under the toggle column at any indent — set `--tree-indent` to your toggle's width (e.g. `32px`) for exact alignment.

## Recipes

### Brand override (with or without Material)

```css
:root {
  --tree-node-selected: #fdecc8;
  --tree-drop-indicator: #b3541e;
  --tree-indent: 1.25rem;
}
```

### Dark mode without Material

With Material, dark mode is automatic (the `--mat-sys-*` values flip). Without it:

```css
.dark {
  --tree-bg: #1c1b1f;
  --tree-text: #e6e1e5;
  --tree-node-hover: #2f2e33;
  --tree-node-selected: #4a4458;
}
```

### Row state hooks

Rows expose state as data attributes, so consumer stylesheets can restyle states without fighting the defaults: `[data-selected]` (in the selection), `[data-move-source]` (marked by Ctrl+X, awaiting keyboard drop), and `[data-node-id]` (stable per-node key). Example:

```css
angular-tree .tree-node[data-move-source] {
  outline: 1px dashed var(--tree-drop-indicator);
}
```

## Consumer-template tokens (convention)

The tree ships no checkbox UI, so it never *applies* these — but templates hosting a `treeNodeCheckbox` element should consume them, keeping checkbox ergonomics configurable through the same `--tree-*` vocabulary as everything else:

| Token | Default | Used for |
|---|---|---|
| `--tree-checkbox-touch-target` | `32px` | Hit area of the checkbox host (square; matches the default 32px row height) |
| `--tree-checkbox-radius` | `4px` | Corner radius of the checkbox host / its state layer |

Recipe (the demo's icon-as-checkbox host):

```css
.node-check {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--tree-checkbox-touch-target, 32px);
  block-size: var(--tree-checkbox-touch-target, 32px);
  border-radius: var(--tree-checkbox-radius, 4px);
}
```

If you raise `--tree-checkbox-touch-target` past your `itemSize`, raise `itemSize` too — the row is the touch target's ceiling.

## What the tree does *not* style

By design (the tree ships no UI it doesn't own): toggle buttons, icons, checkboxes, rename inputs, context menus, and the empty/loading states (`treeEmptyDef` / `treeLoadingDef`) are consumer templates — style them in your own stylesheet. The tree owns only the centered slot each renders in (`.tree-state`, overlaying the host). The demo app (`projects/app`) shows a complete Material-flavored example.
