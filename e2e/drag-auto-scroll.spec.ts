import { expect, Page, test } from '@playwright/test';

import { waitForTree } from './helpers';

/**
 * Edge auto-scroll while dragging (ROADMAP Phase 4; parity gate for ROADMAP2
 * decision 17 stage 1): the tree drives the virtual viewport itself — a
 * pointer HELD STILL inside the 32px edge band keeps scrolling, and the drop
 * target keeps following the rows that virtualization materializes under it.
 * Only a real renderer runs the rAF loop against real layout.
 */
test.describe('drag edge auto-scroll', () => {
  const SOURCE = 'cases/0/0/0/0/f1';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  const viewportBox = async (page: Page) =>
    (await page.locator('.tree-viewport').boundingBox())!;

  const scrollTop = (page: Page) =>
    page.locator('.tree-viewport').evaluate((viewport) => viewport.scrollTop);

  /** Picks the source row up and parks the pointer at `y`, mid-width. */
  const dragTo = async (page: Page, y: number) => {
    const from = (await page
      .locator(`[data-node-id="${SOURCE}"]`)
      .boundingBox())!;
    const viewport = await viewportBox(page);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.x + viewport.width / 2, y, { steps: 12 });
    return viewport;
  };

  test('a pointer held in the bottom band scrolls; leaving the band stops; the top band scrolls back', async ({
    page,
  }) => {
    const viewport = await dragTo(
      page,
      (await viewportBox(page)).y + (await viewportBox(page)).height - 10,
    );
    const centreX = viewport.x + viewport.width / 2;

    // No further pointer events: the loop must keep running on its own.
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(400);

    // Out of the band → the loop stands down (one in-flight frame may land).
    await page.mouse.move(centreX, viewport.y + viewport.height / 2, {
      steps: 4,
    });
    await page.waitForTimeout(100);
    const settled = await scrollTop(page);
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(settled);

    // Top band reverses direction, all the way back to the start.
    await page.mouse.move(centreX, viewport.y + 10, { steps: 4 });
    await expect.poll(() => scrollTop(page)).toBe(0);

    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.app-last-intent')).toHaveCount(0);
  });

  test('the drop lands on a row that only existed after auto-scrolling', async ({
    page,
  }) => {
    // KNOWN BUG (found 2026-11-10 by this spec): once auto-scroll pushes the
    // drag SOURCE out of the render range, CDK's drag placeholder stays behind
    // in the virtual-scroll content wrapper as an extra 40px element, so every
    // rendered row sits one row lower than the `index * itemSize` arithmetic
    // the drop math uses — the indicator and the drop are one row off from
    // the row under the pointer (and rows stay displaced after the drag ends,
    // until the next re-render). Remove this line when fixed: the spec then
    // fails as "expected to fail, but passed".
    test.fail(true, 'CDK drag placeholder displaces virtualized rows');

    const viewport = await dragTo(
      page,
      (await viewportBox(page)).y + (await viewportBox(page)).height - 10,
    );
    const centreX = viewport.x + viewport.width / 2;

    // Far enough that the pointer's row was outside the initial render range
    // and sits in a different folder than the source.
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(1600);

    // While still parked in the band the indicator must be live — the target
    // is re-derived per frame from the stationary pointer, not per pointermove.
    await expect(page.locator('.tree-drop-indicator')).toBeVisible();

    await page.mouse.move(centreX, viewport.y + viewport.height / 2, {
      steps: 4,
    });
    await page.waitForTimeout(150); // let the loop's last frame land

    // Whatever row ended up under the viewport centre is the target. Its
    // 'before' zone (top quarter) means: same parent, its own position.
    const target = await page.evaluate(
      ([x, y]) => {
        const row = document
          .elementsFromPoint(x, y)
          .find((element) => element.matches('.tree-node')) as
          HTMLElement | undefined;
        if (!row) return null;
        const rect = row.getBoundingClientRect();
        return {
          id: row.dataset['nodeId']!,
          index: Number(row.getAttribute('aria-posinset')) - 1,
          top: rect.top,
        };
      },
      [centreX, viewport.y + viewport.height / 2] as const,
    );
    expect(target).not.toBeNull();
    const parentId = target!.id.split('/').slice(0, -1).join('/');
    expect(parentId).not.toBe('cases/0/0/0/0'); // not the source's own folder

    await page.mouse.move(centreX, target!.top + 4, { steps: 3 });
    await expect(page.locator('.tree-drop-indicator')).toBeVisible();
    await page.mouse.up();

    await expect(page.locator('.app-last-intent')).toContainText(
      `moved 1 node(s) → ${parentId}@${target!.index}`,
    );
  });
});
