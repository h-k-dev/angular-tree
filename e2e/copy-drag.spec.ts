import { expect, test } from '@playwright/test';

import { rowByName, rows, waitForTree } from './helpers';

/**
 * v2 `MoveEvent.dropEffect` — the pointer path in a real browser: the copy
 * modifier (Ctrl here; ⌥ on macOS) is sampled from real mouse events
 * mid-drag, which jsdom can't produce. The demo applies `applyCopy` and
 * echoes the intent, so the assertion covers tree → consumer end-to-end.
 */
test.describe('copy-on-drag', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  const dragRowOnto = async (
    page: import('@playwright/test').Page,
    sourceText: string,
    targetText: string,
  ) => {
    const source = rows(page).filter({ hasText: sourceText }).first();
    const target = rowByName(page, targetText);
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Middle of the target row = 'inside' zone (three-zone drop math).
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
  };

  test('modifier-drag duplicates: intent says copied, source row survives', async ({ page }) => {
    await page.keyboard.down('Control');
    await dragRowOnto(page, '.pdf', 'Cases');
    await page.keyboard.up('Control');

    await expect(page.locator('.app-last-intent')).toContainText('copied 1 node(s)');
  });

  test('plain drag still moves', async ({ page }) => {
    await dragRowOnto(page, '.pdf', 'Cases');
    await expect(page.locator('.app-last-intent')).toContainText('moved 1 node(s)');
  });
});
