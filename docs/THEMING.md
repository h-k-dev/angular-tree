# Theming

`angular-tree` is themed through CSS custom properties with a three-step fallback chain, resolved at point of use:

```
--tree-*  →  --mat-sys-*  →  hardcoded fallback
```

With Angular Material's M3 theme present, the tree picks up your theme (including dark mode) automatically through the `--mat-sys-*` system variables — zero configuration. Without Material, the hardcoded fallbacks apply and everything still works; the tree has **no Material dependency** (CDK only). Either way, any `--tree-*` token you set wins.

Because the chains sit at point of use rather than being declared on the host element, you can set tokens at any level — `:root`, a layout container, or the `angular-tree` element itself — and inheritance works as expected.

## Tokens

| Token                      | M3 system fallback                    | Final fallback                            | Used for                                                              |
| -------------------------- | ------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `--tree-bg`                | `--mat-sys-surface`                   | `#ffffff`                                 | Tree background                                                       |
| `--tree-text`              | `--mat-sys-on-surface`                | `#1d1b20`                                 | Row text                                                              |
| `--tree-font`              | `--mat-sys-body-medium`               | `400 0.875rem/1.25rem Roboto, sans-serif` | Typography (full `font` shorthand)                                    |
| `--tree-node-hover`        | `--mat-sys-surface-container-highest` | `#e6e6e6`                                 | Row hover                                                             |
| `--tree-node-selected`     | `--mat-sys-secondary-container`       | `#e8def8`                                 | Selected row (`[data-selected]`)                                      |
| `--tree-focus-ring`        | `--mat-sys-primary`                   | `#6750a4`                                 | `:focus-visible` outline                                              |
| `--tree-drop-indicator`    | `--mat-sys-primary`                   | `#6750a4`                                 | Drop line/box, count badge                                            |
| `--tree-drag-shadow`       | `--mat-sys-level3`                    | `0 2px 8px rgb(0 0 0 / 0.3)`              | Drag preview elevation                                                |
| `--tree-drag-preview-bg`   | `--mat-sys-surface` at 85% alpha      | `oklch(from #ffffff l c h / 0.85)`        | Drag preview chip background — the theme surface made translucent     |
| `--tree-drag-preview-text` | `--mat-sys-on-surface`                | `#1d1b20`                                 | Drag preview text                                                     |
| `--tree-badge-text`        | `--mat-sys-on-primary`                | `#ffffff`                                 | Multi-drag count badge text                                           |
| `--tree-indent`            | —                                     | `1.5rem`                                  | Per-level indentation step                                            |
| `--tree-guide`             | `--mat-sys-outline-variant`           | `#cac4d0`                                 | Indent guide lines (`[indentGuides]`); hover uses `--tree-focus-ring` |
| `--tree-menu-bg`           | `--mat-sys-surface-container`         | `#f3edf7`                                 | Built-in context-menu shell background (`treeContextMenu`)            |
| `--tree-menu-radius`       | —                                     | `8px`                                     | Context-menu shell corner radius                                      |
| `--tree-menu-shadow`       | `--mat-sys-level2`                    | `0 2px 8px rgb(0 0 0 / 0.25)`             | Context-menu shell elevation                                          |
| `--tree-scrollbar-thumb`   | `--mat-sys-outline`                   | `#79747e`                                 | Viewport scrollbar thumb base color (all states derive from it)       |
| `--tree-scrollbar-size`    | —                                     | `10px`                                    | Scrollbar width (Chromium/WebKit; Firefox is always `thin`)           |

Indentation is applied as `padding-inline-start: calc(var(--tree-level) * var(--tree-indent, 1.5rem))` — logical properties, so RTL mirrors for free. `--tree-level` is set per row by the tree; treat it as read-only.

Two more read-only variables the tree _publishes_ (outputs, not inputs): `--tree-level` (above) and `--tree-row-height` on the host — the `[itemSize]` input republished so your row-content CSS (toggle targets, spacers, indent) can derive from the same number the scroll strategy uses. Row height itself is controlled ONLY via `[itemSize]`; see docs/VIRTUALIZATION.md.

Indent guide lines are drawn at `calc(var(--tree-indent) / 2)` within the indent column, so they stay centered under the toggle column at any indent — set `--tree-indent` to your toggle's width (e.g. `32px`) for exact alignment.

## Scrollbar

The tree paints its viewport scrollbar (pill thumb, invisible track) instead of leaving it to the browser. Two reasons: the browser's own scrollbar follows the CSS `color-scheme` property — **not** your theme tokens — so an app that themes dark via tokens alone gets a light scrollbar; and the painted version gives affordance states the UA can't:

- **Rest** — thumb at 50% strength (`color-mix` of `--tree-scrollbar-thumb`).
- **Pointer over the tree** — 75%; **over/dragging the thumb** — full strength.
- **Keyboard focus inside the tree** — thumb tints `--tree-focus-ring`, signalling that arrow keys scroll this region.

All states derive from the single `--tree-scrollbar-thumb` token, so one override restyles the whole ladder. Firefox has no scrollbar pseudo-elements: it gets the same color story via the standard `scrollbar-color`/`scrollbar-width` properties (always `thin`, no pill radius — platform limit).

**Escape hatch:** setting any non-`auto` standard `scrollbar-width`/`scrollbar-color` on `.tree-viewport` from a global stylesheet switches Chromium to standard rendering and disables the tree's `::-webkit-scrollbar-*` painting entirely:

```css
angular-tree .tree-viewport {
  scrollbar-width: thin;
  scrollbar-color: gray transparent;
}
```

`scrollbar-color` is an inherited property, so plain `angular-tree { scrollbar-color: … }` in any stylesheet works too.

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

Rows expose state as data attributes, so consumer stylesheets can restyle states without fighting the defaults: `[data-selected]` (in the selection), `[data-move-source]` (marked by Ctrl+X, awaiting keyboard drop), `[data-loading]` / `[data-error]` (async `childrenAccessor` in flight / rejected — the same states the template context exposes as `isLoading`/`hasError`), and `[data-node-id]` (stable per-node key). For _depth_-based styling no extra attribute exists by design — `aria-level` is the industry-standard marker and is always set (root rows are `[aria-level='1']`); the template context additionally exposes `level` for structural decisions (e.g. the demo skips the leaf spacer at root so parentless files sit flush left). Example:

```css
angular-tree .tree-node[data-move-source] {
  outline: 1px dashed var(--tree-drop-indicator);
}
```

### Per-node styling (`rowClass` / `rowStyle`)

For styling that depends on your _data_ rather than tree state, the accessor inputs put classes and inline styles on the tree-owned row element (def content renders _inside_ the row and can't reach it). Because every `--tree-*` chain resolves at point of use, `rowStyle` is the per-node token override: return `{ '--tree-guide': node.color }` and that node's thread line tints — the tree additionally applies the **group parent's** `rowStyle` to that group's indent-guide overlay, since guides are siblings of the rows and would never inherit a row-applied variable on their own. `rowClass` stays row-only (classes designed for rows would wreck the overlay geometry). Tree-owned geometry (`height`, guide `top`, `--tree-level`) always wins over the consumer map.

```ts
rowStyle = (node: DocNode) =>
  node.kind === 'category' ? { '--tree-guide': node.color } : undefined;
```

## Consumer-template tokens (convention)

The tree ships no toggle or checkbox UI, so it never _applies_ these — but consumer templates should consume them, keeping row-content geometry configurable through the same `--tree-*` vocabulary as everything else. Three sizes rule everything, in a strict derivation chain:

| Token                          | Default                               | Used for                                                    |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------- |
| `--tree-row-height`            | _(published by the tree — read-only)_ | The `[itemSize]` input as a CSS variable; root of the chain |
| `--tree-toggle-size`           | `var(--tree-row-height)`              | **The master size for row controls** — see below            |
| `--tree-toggle-spacing-factor` | `0.5`                                 | Unitless; derives the leaf spacer from the toggle size      |
| `--tree-checkbox-radius`       | `100vw` (circle)                      | Corner radius of the checkbox state layer                   |

### `--tree-toggle-size` — the master control size

One number sizes every square in the row, so columns align by construction:

- **Toggle button** — its touch/state target (`inline-size`/`block-size`).
- **Checkbox host** — same target size (`treeNodeCheckbox` element).
- **Thread line** — set `--tree-indent: var(--tree-toggle-size)` and the indent guide centers exactly under the toggle column at any size.
- **Leaf spacer** — leaves have no toggle; the stand-in spacer is `calc(var(--tree-toggle-size) * var(--tree-toggle-spacing-factor))`.

```css
angular-tree {
  --tree-toggle-size: var(--tree-row-height, 32px);
  --tree-toggle-spacing-factor: 0.5;
  --tree-indent: var(--tree-toggle-size);
}

.node-toggle,
.node-check {
  inline-size: var(--tree-toggle-size);
  block-size: var(--tree-toggle-size);
}

.node-toggle-spacer {
  inline-size: calc(
    var(--tree-toggle-size) * var(--tree-toggle-spacing-factor, 0.5)
  );
}
```

**Invariant: `--tree-toggle-size` must never exceed `--tree-row-height`.** Rows are fixed-height boxes (that's what virtualization is built on — docs/VIRTUALIZATION.md); a control taller than its row breaks the UI: state layers clip against row bounds, hover circles overlap adjacent rows' hit targets, and the thread line no longer centers on what you see. Equal to the row height is the ceiling (the demo runs there — adjacent state layers just touch); strictly smaller buys the hover circles breathing room. If you need a bigger control, raise `[itemSize]` — never the toggle alone.

## What the tree does _not_ style

By design (the tree ships no UI it doesn't own): toggle buttons, icons, checkboxes, rename inputs, context menus, and the empty/loading states (`treeEmptyDef` / `treeLoadingDef`) are consumer templates — style them in your own stylesheet. The tree owns only the centered slot each renders in (`.tree-state`, overlaying the host). The demo app (`projects/app`) shows a complete Material-flavored example.
