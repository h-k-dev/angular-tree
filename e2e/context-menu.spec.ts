import { expect, test } from '@playwright/test';

import { builtInMenu, focusedNodeId, rowByName, rows, waitForTree } from './helpers';

/**
 * Phase 8 matrix — built-in `treeContextMenu`: right-click + Shift+F10, at the
 * virtualized top/bottom edges, and the settled close-on-scroll behavior.
 * (`openContextMenu(node)` — the more_vert path — is covered by the unit
 * specs; the dialog spec exercises an external MatMenu trigger instead.)
 */
test.describe('built-in context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  test('right-click on a row opens the menu; item acts on the node', async ({ page }) => {
    const folder = rowByName(page, 'Cases');
    await folder.click({ button: 'right' });

    const menu = builtInMenu(page);
    await expect(menu).toBeVisible();
    // Menu receives focus (keyboard-operable immediately — APG menu pattern).
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('.tree-menu') != null))
      .toBe(true);

    await menu.getByRole('menuitem', { name: 'Collapse' }).click();
    await expect(menu).toBeHidden();
    // The intent reached the consumer (toolbar echoes it).
    await expect(page.locator('.app-last-intent')).toContainText('collapsed');
  });

  test('Escape closes the menu and focus returns to the row', async ({ page }) => {
    const folder = rowByName(page, 'Cases');
    const id = await folder.getAttribute('data-node-id');
    await folder.click({ button: 'right' });
    await expect(builtInMenu(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(builtInMenu(page)).toBeHidden();
    await expect.poll(() => focusedNodeId(page)).toBe(id);
  });

  test('Shift+F10 opens the menu on the focused row', async ({ page }) => {
    const folder = rowByName(page, 'Cases');
    await folder.click();
    await page.keyboard.press('Shift+F10');
    await expect(builtInMenu(page)).toBeVisible();
  });

  test('menu opens at both virtualized edges (Home / End targets)', async ({ page }) => {
    const first = rows(page).first();
    await first.click();

    // Bottom edge: End scrolls the virtual viewport and focuses the last row.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+F10');
    await expect(builtInMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    // Focus restore is async (microtask + render) — wait for it, or the next
    // keystroke fires against a recycled row.
    await expect.poll(() => focusedNodeId(page)).not.toBeNull();

    // Top edge again — the row DOM at the far end was recycled in between.
    await page.keyboard.press('Home');
    await expect.poll(() => focusedNodeId(page)).not.toBeNull();
    await page.keyboard.press('Shift+F10');
    await expect(builtInMenu(page)).toBeVisible();
  });

  test('scrolling the viewport closes the menu (settled close-on-scroll)', async ({ page }) => {
    await rowByName(page, 'Cases').click({ button: 'right' });
    await expect(builtInMenu(page)).toBeVisible();

    await page
      .locator('.tree-viewport')
      .evaluate((viewport) => viewport.scrollBy({ top: 200 }));
    await expect(builtInMenu(page)).toBeHidden();
  });
});
