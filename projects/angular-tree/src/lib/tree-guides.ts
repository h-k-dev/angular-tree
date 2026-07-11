import type { ListRange } from '@angular/cdk/collections';

import type { VisibleTreeNode } from './tree-controller';

/**
 * Indent-guide math (ROADMAP Phase 8 "should feel like Reddit"). Pure — the
 * component wraps these in computeds so guides recompute only on visibility
 * changes (expand/collapse/search/data) and range changes, never on scroll.
 * CDK touchpoints: none here — `ListRange` comes from the viewport's
 * `renderedRangeStream` mirror in the component.
 */

/** One expanded group's guide span over the *visible* flat array. Internal. */
export interface GuideGroup {
  /** Key of the expanded parent the guide belongs to. */
  readonly key: string;
  readonly level: number;
  /**
   * First visible-row index the guide spans / the parent's LAST DIRECT child.
   * Not the last descendant: a line dropping past its own children to end
   * beside some deeper grandchild points at nothing — each nesting level
   * draws its own line, so this one stops at the last row it connects.
   */
  readonly start: number;
  readonly end: number;
}

/** A guide clamped to the rendered range, in content-wrapper px. Internal. */
export interface GuideOverlay {
  readonly key: string;
  readonly level: number;
  readonly top: number;
  readonly height: number;
  /** True when the group's real end is rendered — the elbow may draw. */
  readonly elbow: boolean;
}

/**
 * One guide span per expanded row with visible children, over the whole
 * visible flat array. Stack-based single pass: a row at a level ≤ an open
 * parent's closes that parent's group.
 */
export function computeGuideGroups(
  rows: readonly VisibleTreeNode<unknown>[],
): readonly GuideGroup[] {
  const groups: GuideGroup[] = [];
  const open: { key: string; level: number; start: number; end: number }[] = [];

  const close = (until: number) => {
    while (open.length > 0 && until <= open[open.length - 1].level) {
      const group = open.pop()!;
      // Expanded but childless (e.g. lazy load in flight) → no line yet.
      if (group.end >= group.start) groups.push(group);
    }
  };

  for (let index = 0; index < rows.length; index++) {
    const { flat, isExpanded } = rows[index];
    close(flat.level);
    // Visible levels step by exactly 1 downward (a child renders only under
    // its parent), so the innermost open group one level up IS the parent.
    const parent = open[open.length - 1];
    if (parent && parent.level === flat.level - 1) parent.end = index;
    if (flat.expandable && isExpanded) {
      open.push({
        key: flat.key,
        level: flat.level,
        start: index + 1,
        end: index,
      });
    }
  }
  close(-Infinity);
  return groups;
}

/**
 * Guides clamped to the rendered range, in content-wrapper px — an unclamped
 * guide over 100k expanded rows would be a megapixel-tall element.
 *
 * Connector geometry: the line spans the parent row's *bottom edge* down to
 * the last direct child's row *centre* — not the first child's top to the last
 * descendant's bottom (which overshot half a row past the last child into the
 * gap before the next dedented row). The bottom-edge start keeps the line
 * visually dropping out of the parent's toggle without ever entering the
 * glyph — the toggle is consumer UI of unknown height, but it always fits
 * inside its row, so the row seam is the nearest safe anchor. At the bottom
 * the elbow turns toward the last child, terminating *at* it.
 *
 * `elbow` is false when the real last child is below the rendered window —
 * drawing the turn at the clamp edge would claim the group ends mid-scroll.
 */
export function clampGuideOverlays(
  groups: readonly GuideGroup[],
  range: ListRange,
  itemSize: number,
): readonly GuideOverlay[] {
  const overlays: GuideOverlay[] = [];

  for (const group of groups) {
    const start = Math.max(group.start, range.start);
    const end = Math.min(group.end, range.end - 1);
    if (start > end) continue; // group entirely outside the rendered window
    overlays.push({
      key: group.key,
      level: group.level,
      top: (start - range.start) * itemSize,
      height: (end - start + 0.5) * itemSize,
      elbow: group.end <= range.end - 1,
    });
  }
  return overlays;
}
