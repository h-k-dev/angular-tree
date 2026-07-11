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
  /** First / last visible-row index the guide spans (the parent's descendants). */
  readonly start: number;
  readonly end: number;
}

/** A guide clamped to the rendered range, in content-wrapper px. Internal. */
export interface GuideOverlay {
  readonly key: string;
  readonly level: number;
  readonly top: number;
  readonly height: number;
}

/**
 * One guide span per expanded row with visible descendants, over the whole
 * visible flat array. Stack-based single pass: a row at a level ≤ an open
 * parent's closes that parent's group.
 */
export function computeGuideGroups(rows: readonly VisibleTreeNode<unknown>[]): readonly GuideGroup[] {
  const groups: GuideGroup[] = [];
  const open: { key: string; level: number; start: number }[] = [];

  const close = (until: number, end: number) => {
    while (open.length > 0 && until <= open[open.length - 1].level) {
      const group = open.pop()!;
      // Expanded but childless (e.g. lazy load in flight) → no line yet.
      if (end >= group.start) groups.push({ ...group, end });
    }
  };

  for (let index = 0; index < rows.length; index++) {
    const { flat, isExpanded } = rows[index];
    close(flat.level, index - 1);
    if (flat.expandable && isExpanded) {
      open.push({ key: flat.key, level: flat.level, start: index + 1 });
    }
  }
  close(-Infinity, rows.length - 1);
  return groups;
}

/**
 * Guides clamped to the rendered range, in content-wrapper px — an unclamped
 * guide over 100k expanded rows would be a megapixel-tall element.
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
      height: (end - start + 1) * itemSize,
    });
  }
  return overlays;
}
