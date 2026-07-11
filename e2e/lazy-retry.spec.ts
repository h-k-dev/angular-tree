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
  test('first load errors into the Retry affordance; Retry recovers', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTree(page);

    // The flaky root sits at the very bottom of ~2.6k expanded rows.
    const scrollHeight = await page
      .locator('.tree-viewport')
      .evaluate((viewport) => viewport.scrollHeight);
    await scrollViewport(page, scrollHeight);

    const flaky = rowByName(page, 'Flaky server');
    await flaky.locator('.node-toggle').click();

    // No pre-error spinner assertion here: the flaky accessor's FIRST
    // (rejecting) call is consumed by the flatten-time expandability probe
    // (same node object ⇒ at most one accessor call — ROADMAP), so its 800ms
    // rejection countdown starts at PAGE LOAD. A pre-error spinner is only
    // visible when the click lands inside that window — a timing assumption
    // page-setup growth broke. The zoneless data-loading repaint (matrix
    // bug #5) stays pinned by the Retry-path spinner assertion below.
    const retry = flaky.locator('.node-retry');
    await expect(retry).toBeVisible();
    await expect(page.locator('.tree-node[data-error]')).toHaveCount(1);

    // Retry re-runs the accessor; the second attempt resolves (~1.2s).
    await retry.click();
    await expect(flaky.locator('.node-icon--spin')).toBeVisible();
    await expect(page.locator('[data-node-id^="flaky/"]').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(retry).toHaveCount(0);
  });
});
