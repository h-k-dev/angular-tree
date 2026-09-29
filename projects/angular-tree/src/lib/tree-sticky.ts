import type { VisibleTreeNode } from './tree-controller';

/**
 * Sticky-scroll math (ROADMAP2 decision 16) — a port of VS Code's
 * `StickyScrollController` (src/vs/base/browser/ui/tree/abstractTree.ts,
 * checked 2026-09-29) onto fixed row heights, where every VS Code
 * `getElementTop`/`indexAt` call collapses to index arithmetic. Pure — the
 * component wraps these in computeds: the structural index recomputes on
 * visibility changes only, the stack on scroll.
 * CDK touchpoints: none here — scroll offset and viewport height come from
 * the component's `elementScrolled` / ResizeObserver mirrors.
 */

/** VS Code `maxWidgetViewRatio`: the band never exceeds this share of the viewport. */
export const STICKY_MAX_VIEW_RATIO = 0.4;

/** Per-visible-row structure the stack walk needs. Internal. */
export interface StickyIndex {
  /** Visible index of each row's parent; -1 for roots. */
  readonly parent: Int32Array;
  /** Visible index of each row's LAST rendered descendant (itself for leaves). */
  readonly subtreeEnd: Int32Array;
}

/** One pinned row. Internal. */
export interface StickyNode {
  /** Index into the visible flat array. */
  readonly index: number;
  /** Band-relative px — below the slot while the next group pushes it up. */
  readonly top: number;
}

/**
 * Single stack pass: a row at a level ≤ an open row's closes that row's
 * subtree. Visible levels step by exactly 1 downward, so the innermost open
 * row one level up IS the parent.
 */
export function computeStickyIndex(
  rows: readonly VisibleTreeNode<unknown>[],
): StickyIndex {
  const parent = new Int32Array(rows.length);
  const subtreeEnd = new Int32Array(rows.length);
  const open: number[] = [];

  for (let index = 0; index < rows.length; index++) {
    const level = rows[index].flat.level;
    while (open.length > 0 && rows[open[open.length - 1]].flat.level >= level) {
      subtreeEnd[open.pop()!] = index - 1;
    }
    parent[index] = open.length > 0 ? open[open.length - 1] : -1;
    open.push(index);
  }
  for (const index of open) subtreeEnd[index] = rows.length - 1;
  return { parent, subtreeEnd };
}

export interface StickyGeometry {
  readonly scrollTop: number;
  readonly itemSize: number;
  readonly viewportHeight: number;
  /** VS Code `stickyScrollMaxItemCount` (clamped ≥ 1 by the caller's input). */
  readonly maxRows: number;
}

/**
 * The pinned stack, outermost first (VS Code `findStickyState` +
 * `constrainStickyNodes`). Empty at scrollTop 0 and in layoutless
 * environments (viewport height 0).
 */
export function resolveStickyNodes(
  index: StickyIndex,
  { scrollTop, itemSize, viewportHeight, maxRows }: StickyGeometry,
): readonly StickyNode[] {
  const count = index.parent.length;
  if (count === 0 || scrollTop <= 0 || viewportHeight <= 0 || itemSize <= 0)
    return [];

  // VS Code getNodeAtHeight: the row under a band-relative y, or -1 past the end.
  const rowAt = (y: number) => {
    const at = Math.floor((scrollTop + y) / itemSize);
    return at >= 0 && at < count ? at : -1;
  };

  const nodes: StickyNode[] = [];
  let under = rowAt(0);
  if (under < 0) return [];
  let stackHeight = 0;

  let next = nextSticky(index, under, -1, stackHeight, scrollTop, itemSize);
  while (next) {
    nodes.push(next);
    stackHeight += itemSize;
    // Past the cap VS Code stops advancing the probe row; the walk still
    // terminates (the chain runs out) and the constraint below cuts it.
    if (nodes.length <= maxRows) {
      under = rowAt(next.top + itemSize);
      if (under < 0) break;
    }
    next = nextSticky(
      index,
      under,
      next.index,
      stackHeight,
      scrollTop,
      itemSize,
    );
  }

  return constrain(nodes, itemSize, maxRows, viewportHeight);
}

/**
 * VS Code `getNextStickyNode`: the ancestor of `under` directly beneath the
 * previous sticky row (the root ancestor for the first). `under` itself only
 * joins as an expanded parent with rendered children, and nothing joins
 * before its own row has started scrolling under the band.
 */
function nextSticky(
  index: StickyIndex,
  under: number,
  previous: number,
  stackHeight: number,
  scrollTop: number,
  itemSize: number,
): StickyNode | null {
  const candidate = ancestorUnder(index.parent, under, previous);
  if (candidate < 0) return null;
  if (candidate === under && index.subtreeEnd[under] <= under) return null;
  if (scrollTop + stackHeight <= candidate * itemSize) return null;

  return {
    index: candidate,
    top: pushedTop(
      index.subtreeEnd[candidate],
      stackHeight,
      scrollTop,
      itemSize,
    ),
  };
}

/** VS Code `getAncestorUnderPrevious`, over parent indices (-1 = none). */
function ancestorUnder(
  parent: Int32Array,
  row: number,
  previous: number,
): number {
  let current = row;
  let up = parent[current];
  while (up >= 0) {
    if (up === previous) return current;
    current = up;
    up = parent[current];
  }
  return previous < 0 ? current : -1;
}

/**
 * VS Code `calculateStickyNodePosition` — the push hand-off: once the node's
 * last descendant's bottom edge rises into its slot, the row rides up with it.
 * Applies to EVERY sticky row, not just the last.
 */
function pushedTop(
  lastDescendant: number,
  slotTop: number,
  scrollTop: number,
  itemSize: number,
): number {
  const bottomOfLast = (lastDescendant + 1) * itemSize - scrollTop;
  return slotTop + itemSize > bottomOfLast && slotTop <= bottomOfLast
    ? bottomOfLast - itemSize
    : slotTop;
}

/**
 * VS Code `constrainStickyNodes` + `DefaultStickyScrollDelegate`: both caps
 * always apply — row count and 40 % of the viewport height, measured on the
 * PUSHED positions — and overflow is cut from the inner end, so the
 * outermost ancestors are the ones that stay.
 */
function constrain(
  nodes: readonly StickyNode[],
  itemSize: number,
  maxRows: number,
  viewportHeight: number,
): readonly StickyNode[] {
  const maxHeight = viewportHeight * STICKY_MAX_VIEW_RATIO;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].top + itemSize > maxHeight || i >= maxRows)
      return nodes.slice(0, i);
  }
  return nodes;
}

/** Band height (VS Code `getRootHeight`): last row's bottom edge, never negative. */
export function stickyBandHeight(
  nodes: readonly Pick<StickyNode, 'top'>[],
  itemSize: number,
): number {
  const last = nodes.at(-1);
  return last ? Math.max(0, last.top + itemSize) : 0;
}

/**
 * VS Code `nodePositionTopBelowWidget` with fixed heights: a node's own
 * ancestors (capped at `maxRows`) are what would pin above it, so that is the
 * clearance a reveal must leave. Deliberately NOT the 40 % cap — VS Code
 * doesn't apply it here either.
 */
export function stickyClearance(
  level: number,
  itemSize: number,
  maxRows: number,
): number {
  return Math.min(level, maxRows) * itemSize;
}

/**
 * VS Code `List.reveal(index, undefined, paddingTop)`: the scrollTop that
 * brings a row fully into view below `paddingTop`, or `null` when it already
 * is. Above the padded top → align under the band; below the fold → align to
 * the bottom edge.
 */
export function revealScrollTop(
  index: number,
  itemSize: number,
  scrollTop: number,
  viewportHeight: number,
  paddingTop: number,
): number | null {
  const top = index * itemSize;
  const bottom = top + itemSize;
  const scrollBottom = scrollTop + viewportHeight;

  if (top < scrollTop + paddingTop && bottom >= scrollBottom) return null;
  if (
    top < scrollTop + paddingTop ||
    (bottom >= scrollBottom && itemSize >= viewportHeight)
  )
    return Math.max(0, top - paddingTop);
  if (bottom >= scrollBottom) return bottom - viewportHeight;
  return null;
}
