import { expect, test } from '@playwright/test';

import { rowByName, scrollViewport, waitForTree } from './helpers';

/**
 * Lazy-load error path in a real browser (found broken by this very demo:
 * loading/error flips scheduled no zoneless CD until the row's
 * data-loading/data-error bindings started tracking the state). The demo's
 * "Flaky server (fails once)" folder rejects its first load and resolves the
 * retry — exactly the consumer recipe the docs prescribe.
 */
test.describe('lazy-load error → retry', () => {
  test('first load errors into the Retry affordance; Retry recovers', async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);

    // The flaky root sits at the very bottom of ~2.6k expanded rows.
    const scrollHeight = await page.locator('.tree-viewport').evaluate((viewport) => viewport.scrollHeight);
    await scrollViewport(page, scrollHeight);

    const flaky = rowByName(page, 'Flaky server');
    await flaky.locator('.node-toggle').click();

    // Pending load: spinner via [data-loading]-driven CD, then the rejection
    // lands (~800ms) and must surface as the projected Retry button.
    await expect(flaky.locator('.node-icon--spin')).toBeVisible();
    const retry = flaky.locator('.node-retry');
    await expect(retry).toBeVisible();
    await expect(page.locator('.tree-node[data-error]')).toHaveCount(1);

    // Retry re-runs the accessor; the second attempt resolves (~1.2s).
    await retry.click();
    await expect(flaky.locator('.node-icon--spin')).toBeVisible();
    await expect(page.locator('[data-node-id^="flaky/"]').first()).toBeVisible({ timeout: 5_000 });
    await expect(retry).toHaveCount(0);
  });
});
