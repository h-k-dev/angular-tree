import { expect, Page, test } from '@playwright/test';

import { waitForTree } from './helpers';

/**
 * Hover-expand while dragging (ROADMAP Phase 4; parity gate for ROADMAP2
 * decision 17 stage 1): resting on a collapsed folder's make-child zone opens
 * it after a delay so the drag can continue into it — the timer runs off a
 * stationary pointer, and a pass-through must not trigger it.
 */
test.describe('drag hover-expand', () => {
  const DRAFTS = 'cases/0/0/0/0';
  const SOURCE = 'cases/0/0/0/1/f12'; // first file of the sibling "Signed"

  const row = (page: Page, id: string) =>
    page.locator(`[data-node-id="${id}"]`);

  const centreOf = async (page: Page, id: string) => {
    const box = (await row(page, id).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    await row(page, DRAFTS).locator('.node-toggle').click();
    await expect(row(page, DRAFTS)).toHaveAttribute('aria-expanded', 'false');
  });

  test('resting on a collapsed folder expands it mid-drag; the drop lands inside', async ({
    page,
  }) => {
    // Regression pin (found + fixed 2026-11-10): CDK blurs the pressed row at
    // drag start while the tree still owns focus, so the expansion's row
    // change read as orphaned focus — retention re-focused the drag SOURCE,
    // which the new children had just pushed below the fold, and native focus
    // scrolling took the folder out from under the pointer. Retention now
    // stands down while a drag is in flight.
    const from = await centreOf(page, SOURCE);
    const over = await centreOf(page, DRAFTS);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(over.x, over.y, { steps: 10 });

    // Mouse still down, no further movement — the timer alone expands it.
    await expect(row(page, DRAFTS)).toHaveAttribute('aria-expanded', 'true');
    await expect(row(page, `${DRAFTS}/f1`)).toBeVisible();
    // The folder is still where the pointer rests — nothing scrolled.
    await page.waitForTimeout(200);
    expect(
      await page.locator('.tree-viewport').evaluate((el) => el.scrollTop),
    ).toBe(0);
    await expect(page.locator('.tree-drag-preview')).toBeVisible();

    await page.mouse.up();
    await expect(page.locator('.app-last-intent')).toContainText(
      `moved 1 node(s) → ${DRAFTS}@`,
    );
  });

  test('passing over a collapsed folder without resting leaves it collapsed', async ({
    page,
  }) => {
    const from = await centreOf(page, SOURCE);
    const over = await centreOf(page, DRAFTS);
    // Two rows up: "Contract Renewal" — already expanded, nothing to open.
    const away = await centreOf(page, 'cases/0/0');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(over.x, over.y, { steps: 6 });
    await page.mouse.move(away.x, away.y, { steps: 6 });

    // Well past the expand delay, parked elsewhere.
    await page.waitForTimeout(900);
    await expect(row(page, DRAFTS)).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});
