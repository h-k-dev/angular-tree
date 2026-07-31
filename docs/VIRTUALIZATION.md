# Virtualization

How `angular-tree` renders 100k+ nodes without breaking a sweat, what `itemSize` means, and what to do when your rows aren't all the same height.

## The model

**Virtualization is always on — there is no opt-out.** It isn't a feature flag layered over a plain renderer; it _is_ the renderer: focus retention, guide overlays, drop-zone math, and the ARIA position attributes are all built on the flat model + fixed-row geometry. A hypothetical non-virtualized mode would be a second rendering path to keep correct forever, for the sole benefit of trees small enough that virtualization costs nothing anyway.

The tree never renders your nested data directly. `TreeController` flattens it into a single ordered array (`visibleNodes`), skipping children of collapsed nodes, and a `<cdk-virtual-scroll-viewport>` renders only the rows that intersect the viewport (plus a small buffer). Indentation is a CSS variable (`--tree-level`) on each row — there is no nested DOM, so depth costs nothing.

Two consequences worth internalizing:

1. **DOM size is O(viewport), not O(data).** The 100k-mode demo keeps ~30 rows in the DOM.
2. **Rows are disposable.** A row's DOM can be destroyed and recreated at any moment as it scrolls out of and back into view. This is why all state — expansion, selection, editing, in-flight lazy loads — lives in `TreeController`, never in the row. If you build custom node templates with their own stateful components, treat them the same way: derive everything from the template context, own nothing.

## `itemSize` — fixed row height

```html
<angular-tree [itemSize]="32" …></angular-tree>
```

`itemSize` is the fixed row height in pixels and drives `FixedSizeVirtualScrollStrategy`. Fixed height is what makes the fast path fast: scroll offset → row index is a division, `aria-setsize` positions and scroll-to-node offsets are exact, and no measurement pass ever runs.

Design your node templates to a fixed height. Truncate long names (`text-overflow: ellipsis`) instead of wrapping. If you need visual breathing room, adjust `itemSize` — not per-row padding.

### Truncation needs `labelOverflow: 'ellipsis'`

The ellipsis CSS alone is **not sufficient** under virtualization. CDK's scroll-content wrapper is absolutely positioned and shrink-wraps to the widest row — its `min-width: 100%` is a floor, not a ceiling — so a `white-space: nowrap` label grows the scroll content past the viewport: the label never meets an edge to truncate against, and you get a horizontal scrollbar instead of an ellipsis.

The tree owns the geometry fix (the wrapper lives inside the CDK component, out of reach of your styles):

```html
<angular-tree labelOverflow="ellipsis" …></angular-tree>
```

`'ellipsis'` caps rows at the visible viewport width (container-query units — the tree touches no CDK internals), which removes horizontal scrolling for that tree. The default `'scroll'` keeps today's behavior — deep hierarchies whose rows should scroll sideways stay on it.

Your side of the contract, on the label element:

```css
.node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-inline-size: 0; /* let the flex item shrink below its text width */
}
```

If you'd rather style from outside the tree (or pin the wrapper yourself), plain **global** CSS reaches it — component-scoped styles don't, and `::ng-deep` is not needed in a global stylesheet:

```css
/* styles.css — scope to your tree's container */
.my-tree .cdk-virtual-scroll-content-wrapper {
  inline-size: 100%;
}
```

### Middle ellipsis (macOS style)

CSS truncation is end-only. For Finder-style `head…tail` — both ends of the name survive, the middle gives way — the library ships a zero-dependency `middleEllipsis` directive (canvas `measureText` + `Intl.Segmenter`, no layout thrash):

```html
<!-- the directive OWNS the text — leave the element empty -->
<span class="node-name" [middleEllipsis]="node.name"></span>

<!-- Finder's rule: the extension is never truncated -->
<span [middleEllipsis]="file.name" middleEllipsisTail="extension"></span>
```

Its contract, in short:

- Pair it with `labelOverflow: 'ellipsis'` — without capped rows the label's container grows with the text and nothing ever needs truncating.
- Give the element a **content-independent inline size** (`flex: 1 1 auto; min-inline-size: 0`, or a fixed width). A shrink-to-content box resizes when its text is replaced, and re-truncation would chase its own output.
- The full name stays reachable: `title` (hover tooltip) and `aria-label` always carry the untruncated string, and type-ahead matches against your `typeaheadText` accessor, never the rendered DOM.
- It re-derives on rename, element resize, and web-font arrival; mixed-direction text is pinned in bidi isolates so the halves can't visually swap.

The tree republishes the value as a **read-only CSS variable `--tree-row-height`** on its host, so row-content sizing derives from the same source instead of repeating the number in CSS:

```css
angular-tree {
  --tree-toggle-size: var(
    --tree-row-height,
    32px
  ); /* toggle target = row height (its ceiling) */
  --tree-indent: var(--tree-toggle-size); /* indent step = toggle column */
}
```

Change `[itemSize]` and the scroll strategy, toggle targets, spacers, and indent geometry all follow — one knob. (Set row height via the input, never by styling `.tree-node` — the scroll strategy must know the number.)

## Dynamic heights — the escape hatch

If your rows genuinely cannot share one height (multi-line descriptions, inline previews), the escape hatch is the CDK **autosize** strategy from `@angular/cdk-experimental/scrolling`:

```html
<cdk-virtual-scroll-viewport autosize></cdk-virtual-scroll-viewport>
```

We deliberately do not wrap or re-export it. It estimates row heights while scrolling and corrects as it measures, which brings real trade-offs — it's experimental, scrollbar position can jitter during fast scrolls as estimates correct, `scrollToIndex`/`scrollTo(node)` become approximate (the strategy can't know exact offsets it hasn't measured), and `aria-setsize`/`aria-posinset` stay correct (they come from the flat model, not from geometry) but assistive-tech scroll targeting inherits the same approximation.

Practical guidance: keep the tree itself fixed-height and put variable-height content elsewhere (a detail panel, an expandable row _below_ the tree, a tooltip). Reach for autosize only when the product requirement is truly per-row variable height, and accept the trade-offs above knowingly.

## Interaction with lazy loading

Virtualization and async `childrenAccessor` compose safely by design (see ROADMAP Phase 3):

- A lazy load is triggered by the **expand intent**, never by a row rendering or unmounting.
- In-flight loads are tracked in `TreeController` keyed by node key — scrolling the loading node out of view (destroying its DOM) does not cancel, duplicate, or lose the load.
- When children arrive, the flat model grows and the viewport's total content size updates; the scroll position of the rows above the insertion point does not move.

## Interaction with drag & drop (Phase 4 preview)

Auto-scroll near viewport edges drives `scrollToOffset()` manually, and rows that become rendered mid-drag pick up drop-zone tracking — standard `cdkDropList` auto-scroll doesn't know about the virtual viewport. Fixed `itemSize` keeps the three-zone drop math (top 25% / middle 50% / bottom 25%) exact.

## SSR

The viewport has no size on the server. The plan (ROADMAP cross-cutting): render the first `ssrRowCount` rows statically and reconcile on hydration. Until that lands, treat server rendering of the tree body as empty-by-design.
