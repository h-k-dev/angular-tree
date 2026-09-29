import { expect, test } from '@playwright/test';

import { waitForTree } from './helpers';

/**
 * rowClass classes land on the TREE's row element, so a consumer's scoped
 * (Emulated) rule for them compiles to `.cls[_ngcontent-…]` and silently never
 * matches — the Static example's Framer instance bar shipped exactly that way
 * and painted nothing. Pins the documented fix (global stylesheet) against a
 * real renderer: the class is present AND its rule actually applies.
 */
test('rowClass: the Framer instance bar paints', async ({ page }) => {
  await page.goto('/static');
  await waitForTree(page);

  const instance = page
    .locator('.tool-panel--framer .tree-node.row-instance')
    .first();
  await expect(instance).toBeVisible();
  expect(
    await instance.evaluate((el) => getComputedStyle(el).boxShadow),
  ).toContain('inset');
});
