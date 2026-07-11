import { expect, test } from '@playwright/test';

import { builtInMenu, rowByName, waitForTree } from './helpers';

/**
 * Matrix bug #7 (2026-07-11, user-reported: "rename inline does not work"):
 * a context-menu item that calls `tree.edit(node)` races the menu-close
 * focus reclaim — the reclaim saw only the tabindex −1 trigger host
 * ("orphaned"), focused the ROW after the edit input autofocused, and the
 * input's blur-commit ended the rename before the user could type. jsdom
 * can't reproduce the ordering (its render flush swaps the two afterNextRender
 * callbacks), so the real-browser assertion lives here.
 */
test.describe('inline rename via the context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  test('Rename keeps the edit input focused; Enter commits the typed name', async ({
    page,
  }) => {
    await rowByName(page, 'Due Diligence.xlsx').click({ button: 'right' });
    await builtInMenu(page)
      .getByRole('menuitem', { name: 'Rename', exact: true })
      .click();

    const input = page.locator('input.node-rename');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    // The regression committed the untouched name on menu close — nothing
    // may have fired before the user types.
    await expect(page.locator('.app-last-intent')).not.toContainText('rename');

    await input.fill('Quarterly Report.xlsx');
    await input.press('Enter');

    await expect(page.locator('.app-last-intent')).toContainText(
      'Quarterly Report.xlsx',
    );
    await expect(rowByName(page, 'Quarterly Report.xlsx')).toBeVisible();
    await expect(input).toBeHidden(); // editing ended with the commit
  });
});
