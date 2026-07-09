import { expect, test } from '@playwright/test';

import { rows, scrollViewport, waitForTree } from './helpers';

/**
 * Phase 8 — the real-measurement 100k benchmark (the vitest perf spec guards
 * complexity; this measures actual browser work). Budgets are deliberately
 * loose (CI machines vary) — the numbers land in the report for the roadmap
 * exit note; regressions of the O(n²) kind blow straight past them.
 */
test.describe('100k-node perf', () => {
  test('xl dataset: render, scroll, search stay within loose budgets', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await waitForTree(page);

    // --- Switch to xl (~110k nodes, everything expanded) --------------------
    const renderStart = Date.now();
    await page.getByRole('button', { name: '100k mode' }).click();
    await expect(page.getByRole('button', { name: /nodes/ })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();
    const renderMs = Date.now() - renderStart;

    // --- Scroll: jump through the whole list in big strides -----------------
    const scrollHeight = await page.locator('.tree-viewport').evaluate((viewport) => viewport.scrollHeight);
    expect(scrollHeight).toBeGreaterThan(1_000_000); // ~110k × 40px — virtualization is real

    const scrollStart = Date.now();
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      await scrollViewport(page, scrollHeight * fraction);
      await expect(rows(page).first()).toBeVisible(); // rows re-rendered at each stop
    }
    const scrollMs = Date.now() - scrollStart;

    // --- Search over the full model -----------------------------------------
    const searchStart = Date.now();
    await page.locator('.app-search').fill('contract');
    await expect(rows(page).first()).toBeVisible();
    const searchMs = Date.now() - searchStart;

    await page.locator('.app-search').fill('');
    await expect(rows(page).first()).toBeVisible();

    console.log(`[perf 110k] render ${renderMs}ms · 4-stop scroll ${scrollMs}ms · search ${searchMs}ms`);
    expect(renderMs).toBeLessThan(15_000);
    expect(scrollMs).toBeLessThan(5_000);
    expect(searchMs).toBeLessThan(5_000);
  });
});
