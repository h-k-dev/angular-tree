import { expect, test } from '@playwright/test';

import { rowByName, rows, waitForTree } from './helpers';

/**
 * Phase 8 matrix — RTL run of the keyboard + DnD behaviors in a real browser.
 * The unit suites already prove the direction-normalized keyboard map; this
 * verifies the browser actually reports RTL to the tree (CDK Directionality
 * reads the document `dir`) and that the drop indicator renders mid-drag.
 */
test.describe('RTL', () => {
  test.beforeEach(async ({ page }) => {
    // `?dir=rtl` (demo bootstrap hook): CDK Directionality samples the
    // document `dir` once at service construction — it must exist before
    // bootstrap, and Playwright init scripts run too early to survive the
    // parser finalizing <html>.
    await page.goto('/?dir=rtl');
    await waitForTree(page);
  });

  test('horizontal arrows mirror: ArrowLeft expands, ArrowRight collapses', async ({ page }) => {
    const folder = rowByName(page, 'Cases');
    await folder.click();
    await expect(folder).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ArrowRight'); // RTL: collapse
    await expect(folder).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press('ArrowLeft'); // RTL: expand
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
  });

  test('drop indicator renders during an RTL pointer drag', async ({ page }) => {
    const source = rows(page).filter({ hasText: '.pdf' }).first();
    const target = rowByName(page, 'Cases');
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });

    await expect(page.locator('.tree-drop-indicator')).toBeVisible();
    await page.mouse.up();
  });
});
