import { expect, test } from '@playwright/test';

import { waitForTree } from './helpers';

/**
 * Pointer drop-zone → target mapping (matrix bug #6): the 'after' line under
 * an EXPANDED row sits visually between the row and its first child, so the
 * drop must land there (first child) — sibling-after would insert below the
 * row's whole subtree, far from the indicator ("documents hanging between
 * the lines"). Collapsed rows keep sibling-after semantics.
 */
test.describe('pointer drop zones', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  const row = (page: import('@playwright/test').Page, id: string) => page.locator(`[data-node-id="${id}"]`);

  /** Drag source onto target at a vertical fraction of the target row (0 = top edge). */
  const dragToZone = async (
    page: import('@playwright/test').Page,
    sourceId: string,
    targetId: string,
    fraction: number,
  ) => {
    const from = (await row(page, sourceId).boundingBox())!;
    const to = (await row(page, targetId).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height * fraction, { steps: 12 });
    await page.mouse.up();
  };

  test("'after' an expanded folder inserts as its FIRST CHILD, not after the subtree", async ({ page }) => {
    // Bottom band of the expanded Intake phase row — the line renders between
    // Intake and its first child (Drafts), so the drop must land at index 0.
    await dragToZone(page, 'cases/0/0/0/0/f1', 'cases/0/0/0', 0.9);
    await expect(page.locator('.app-last-intent')).toContainText('moved 1 node(s) → cases/0/0/0@0');
  });

  test("'after' a collapsed folder keeps sibling semantics", async ({ page }) => {
    await row(page, 'cases/0/0/0/0').locator('.node-toggle').click(); // collapse Drafts
    await dragToZone(page, 'cases/0/0/0/1/f12', 'cases/0/0/0/0', 0.9);
    // Sibling slot right after Drafts inside Intake.
    await expect(page.locator('.app-last-intent')).toContainText('moved 1 node(s) → cases/0/0/0@1');
  });

  test("'before' a folder inserts as its preceding sibling", async ({ page }) => {
    // Target must sit INSIDE the visible viewport — a below-the-fold target
    // (rendered in the virtual buffer, boundingBox off-screen) parks the
    // pointer in the edge band and auto-scroll shifts rows under it.
    await dragToZone(page, 'cases/0/0/0/0/f1', 'cases/0/0/0', 0.1);
    // Before Intake (first phase) among Contract Renewal's children.
    await expect(page.locator('.app-last-intent')).toContainText('moved 1 node(s) → cases/0/0@0');
  });
});
