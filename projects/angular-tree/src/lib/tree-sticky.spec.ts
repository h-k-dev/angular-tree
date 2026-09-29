import type { VisibleTreeNode } from './tree-controller';
import {
  computeStickyIndex,
  resolveStickyNodes,
  revealScrollTop,
  stickyBandHeight,
  stickyClearance,
  StickyGeometry,
} from './tree-sticky';

/**
 * The pure sticky-scroll core against hand-computed VS Code outcomes. Real
 * scroll geometry (band over rows, push hand-off on screen) lives in
 * e2e/sticky-scroll.spec.ts — jsdom has no layout.
 */

/** Visible rows from levels alone — the only field the core reads. */
function visible(levels: readonly number[]): VisibleTreeNode<unknown>[] {
  return levels.map(
    (level, index) =>
      ({
        flat: { key: String(index), level },
        isExpanded: levels[index + 1] > level,
      }) as unknown as VisibleTreeNode<unknown>,
  );
}

//              A  A1 A1a f  f  f  A1b g  A2 …leaf roots-level-1 rows
const LEVELS = [0, 1, 2, 3, 3, 3, 2, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const index = computeStickyIndex(visible(LEVELS));
const geometry = (overrides: Partial<StickyGeometry>): StickyGeometry => ({
  scrollTop: 0,
  itemSize: 20,
  viewportHeight: 1000,
  maxRows: 7,
  ...overrides,
});
const stack = (overrides: Partial<StickyGeometry>) =>
  resolveStickyNodes(index, geometry(overrides)).map(
    ({ index: at, top }) => `${at}@${top}`,
  );

describe('computeStickyIndex', () => {
  it('maps parents and last rendered descendants in one pass', () => {
    expect([...index.parent.slice(0, 9)]).toEqual([-1, 0, 1, 2, 2, 2, 1, 6, 0]);
    // A spans the whole list; A1 ends at g; A1a at its last f; leaves at themselves.
    expect(index.subtreeEnd[0]).toBe(19);
    expect(index.subtreeEnd[1]).toBe(7);
    expect(index.subtreeEnd[2]).toBe(5);
    expect(index.subtreeEnd[3]).toBe(3);
    expect(index.subtreeEnd[8]).toBe(8);
  });
});

describe('resolveStickyNodes (VS Code StickyScrollController parity)', () => {
  it('shows nothing at scrollTop 0 or without layout', () => {
    expect(stack({ scrollTop: 0 })).toEqual([]);
    expect(stack({ scrollTop: 30, viewportHeight: 0 })).toEqual([]);
  });

  it('pins each ancestor once its row scrolls under the band', () => {
    // 10px in: A is half-hidden → pinned; A1 now sits under A's sticky copy
    // → pinned; A1a likewise; the leaf below is never pinned.
    expect(stack({ scrollTop: 10 })).toEqual(['0@0', '1@20', '2@40']);
  });

  it('does not pin an expanded row sitting exactly at the viewport top', () => {
    const roots = computeStickyIndex(visible([0, 0, 1, 1, 1, 1]));
    const at = (scrollTop: number) =>
      resolveStickyNodes(roots, geometry({ scrollTop })).map((n) => n.index);
    expect(at(20)).toEqual([]); // row 1 fully visible — no need to pin it
    expect(at(21)).toEqual([1]); // one pixel under → pinned
  });

  it('pushes a row up as its subtree ends (the hand-off)', () => {
    // A1a's last child (row 5) bottom = 120 − 70 = 50 → A1a rides up to 30.
    expect(stack({ scrollTop: 70 })).toEqual(['0@0', '1@20', '2@30']);
    expect(
      stickyBandHeight(
        resolveStickyNodes(index, geometry({ scrollTop: 70 })),
        20,
      ),
    ).toBe(50);
  });

  it('pushes ANY sticky row, not just the last', () => {
    // A1 (ends at row 7) is pushed while A stays put; the probe then lands
    // below A1's subtree, so nothing deeper pins.
    expect(stack({ scrollTop: 125 })).toEqual(['0@0', '1@15']);
  });

  it('caps by row count, keeping the OUTERMOST ancestors', () => {
    expect(stack({ scrollTop: 10, maxRows: 2 })).toEqual(['0@0', '1@20']);
    expect(stack({ scrollTop: 10, maxRows: 1 })).toEqual(['0@0']);
  });

  it('caps the band at 40 % of the viewport height as well', () => {
    // 100px viewport → 40px band → two 20px rows.
    expect(stack({ scrollTop: 10, viewportHeight: 100 })).toEqual([
      '0@0',
      '1@20',
    ]);
    // 90px → 36px: the second row's bottom (40) no longer fits.
    expect(stack({ scrollTop: 10, viewportHeight: 90 })).toEqual(['0@0']);
  });

  it('returns nothing past the end of the list', () => {
    expect(stack({ scrollTop: 10_000 })).toEqual([]);
  });
});

describe('stickyClearance / revealScrollTop (VS Code reveal padding)', () => {
  it('clears min(level, maxRows) ancestor rows', () => {
    expect(stickyClearance(0, 20, 7)).toBe(0);
    expect(stickyClearance(3, 20, 7)).toBe(60);
    expect(stickyClearance(9, 20, 7)).toBe(140);
  });

  it('scrolls only when the row is under the band or past the fold', () => {
    // Row 10 (200..220) under a 60px band at scrollTop 160 → align below it.
    expect(revealScrollTop(10, 20, 160, 200, 60)).toBe(140);
    // Comfortably inside → no scroll.
    expect(revealScrollTop(10, 20, 100, 200, 60)).toBeNull();
    // Below the fold → bottom-align.
    expect(revealScrollTop(20, 20, 0, 200, 60)).toBe(220);
  });
});
