import { expect, Page, test } from '@playwright/test';

import { builtInMenu, focusedNodeId, rowByName, waitForTree } from './helpers';

/**
 * Built-in context menu — the behaviours ROADMAP2 decision 17 stage 3 would
 * move or re-own, pinned against the current shell first: keyboard travel
 * inside the menu, who keeps focus after an outside click, and the menu
 * staying on screen when opened at the window edge.
 */
test.describe('built-in context menu — keyboard, focus hand-off, edges', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  /** Text of the focused menu item, `null` when focus is not on an item. */
  const focusedItem = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute('role') === 'menuitem'
        ? (active.textContent ?? '').trim()
        : null;
    });

  /**
   * KNOWN BUG (found 2026-11-10 by these specs): no key travels inside the
   * built-in menu. The items come from the consumer's `treeContextMenu`
   * template, stamped into the tree's `cdkMenu` shell through an outlet — and
   * CdkMenu collects its items with a CONTENT QUERY, which only sees nodes
   * declared in the shell's own template. Its key manager therefore holds
   * zero items: ArrowUp/Down, Home and End are no-ops; only Tab/Escape and
   * the pointer work.
   */
  const ARROW_KEYS_DEAD =
    'CdkMenu content query cannot see outlet-stamped items';

  test('keyboard open lands on the first item', async ({ page }) => {
    await rowByName(page, 'Cases').click();
    await page.keyboard.press('Shift+F10');
    await expect(builtInMenu(page)).toBeVisible();
    await expect.poll(() => focusedItem(page)).toBe('Rename');
  });

  test('arrows, Home and End travel and wrap; Enter activates the focused item', async ({
    page,
  }) => {
    test.fail(true, ARROW_KEYS_DEAD); // remove when fixed

    await rowByName(page, 'Cases').click();
    await page.keyboard.press('Shift+F10');
    await expect.poll(() => focusedItem(page)).toBe('Rename');

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focusedItem(page)).toBe('Rename in dialog…');
    await page.keyboard.press('End');
    await expect.poll(() => focusedItem(page)).toBe('Delete');
    await page.keyboard.press('ArrowDown'); // wraps
    await expect.poll(() => focusedItem(page)).toBe('Rename');
    await page.keyboard.press('ArrowUp'); // wraps back
    await expect.poll(() => focusedItem(page)).toBe('Delete');
    await page.keyboard.press('Home');
    await expect.poll(() => focusedItem(page)).toBe('Rename');

    // Collapse is the fourth folder item.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focusedItem(page)).toBe('Collapse');
    await page.keyboard.press('Enter');

    await expect(builtInMenu(page)).toBeHidden();
    await expect(page.locator('.app-last-intent')).toContainText('collapsed');
  });

  test('mouse open puts focus in the menu but highlights no item', async ({
    page,
  }) => {
    await rowByName(page, 'Cases').click({ button: 'right' });
    await expect(builtInMenu(page)).toBeVisible();

    // Focus is in the menu (Escape works) but on no item — OS menus.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('.tree-menu') != null,
        ),
      )
      .toBe(true);
    expect(await focusedItem(page)).toBeNull();
  });

  test('after a mouse open the first ArrowDown enters the list', async ({
    page,
  }) => {
    test.fail(true, ARROW_KEYS_DEAD); // remove when fixed

    await rowByName(page, 'Cases').click({ button: 'right' });
    await expect(builtInMenu(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focusedItem(page)).toBe('Rename');
  });

  test('an outside click on a focusable control closes the menu and that control keeps focus', async ({
    page,
  }) => {
    await rowByName(page, 'Cases').click({ button: 'right' });
    await expect(builtInMenu(page)).toBeVisible();

    const search = page.locator('input').first();
    await search.click();

    await expect(builtInMenu(page)).toBeHidden();
    // The close must not reclaim focus for the row — the click target wins,
    // and stays won after the close handler's deferred work has run.
    await page.waitForTimeout(150);
    await expect(search).toBeFocused();
    expect(await focusedNodeId(page)).toBeNull();
  });

  test('an outside click on another row closes the menu and focuses that row', async ({
    page,
  }) => {
    await rowByName(page, 'Cases').click({ button: 'right' });
    await expect(builtInMenu(page)).toBeVisible();

    const other = page.locator('[data-node-id="cases/0/0/0/0/f1"]');
    await other.locator('.node-name').click();

    await expect(builtInMenu(page)).toBeHidden();
    await page.waitForTimeout(150);
    expect(await focusedNodeId(page)).toBe('cases/0/0/0/0/f1');
  });

  test('opened at the bottom-right corner the menu stays fully inside the window', async ({
    page,
  }) => {
    const viewport = (await page.locator('.tree-viewport').boundingBox())!;
    const size = page.viewportSize()!;
    // A point on the last fully visible row, hard against the right edge.
    const x = Math.min(viewport.x + viewport.width - 24, size.width - 4);
    const y = Math.min(viewport.y + viewport.height - 12, size.height - 4);
    await page.mouse.click(x, y, { button: 'right' });

    const menu = builtInMenu(page);
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  });
});
