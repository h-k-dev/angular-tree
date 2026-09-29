import { expect, Locator, Page, test } from '@playwright/test';

import { focusedNodeId, rowByName, rows, waitForTree } from './helpers';

/**
 * Row-state output tokens (`--tree-node-reveal-opacity` / `-visibility`) — the
 * reveal-on-hover pattern consumers read from SCOPED CSS, no ::ng-deep. jsdom
 * evaluates neither :hover nor media queries, so the states are only provable
 * in a real renderer. Consumer: the upload dialog's ⋮ button reads the tokens
 * with the documented `var(…, 1)` / `var(…, visible)` fallbacks.
 */

const token = (row: Locator) =>
  row.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--tree-node-reveal-opacity').trim(),
  );

const visibility = (el: Locator) =>
  el.evaluate((node) => getComputedStyle(node).visibility);

/** Resolves once the element's running CSS transitions have finished. */
const settled = (el: Locator) =>
  el.evaluate((node) =>
    Promise.all(node.getAnimations().map((a) => a.finished)),
  );

/** Park the pointer where no row is — hover must not leak into a test. */
const pointerAway = (page: Page) => page.mouse.move(0, 0);

test.describe('row reveal tokens', () => {
  test.describe('upload dialog ⋮ action', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForTree(page);
      await page.getByRole('button', { name: 'Upload' }).click();
      await expect(
        page.locator('mat-dialog-container .tree-viewport'),
      ).toBeVisible();
      // The dialog's focus trap lands on a row AFTER the dialog is visible —
      // settle it first, or a "resting" row picked now gets focused (and
      // legitimately revealed via :focus-within) mid-test.
      await expect.poll(() => focusedNodeId(page)).not.toBeNull();
      await pointerAway(page);
    });

    const dialog = (page: Page) => page.locator('mat-dialog-container');

    /** A folder row that neither holds focus nor is selected. */
    async function restingFolderRow(page: Page) {
      const focused = await focusedNodeId(page);
      const candidates = rows(page, dialog(page)).filter({
        has: page.locator('.upload-more'),
      });
      const count = await candidates.count();
      for (let i = 0; i < count; i++) {
        const row = candidates.nth(i);
        const id = await row.getAttribute('data-node-id');
        const selected = await row.getAttribute('data-selected');
        if (id !== focused && selected === null) return row;
      }
      throw new Error('no resting folder row rendered');
    }

    test('hidden at rest, revealed on hover — no ::ng-deep involved', async ({
      page,
    }) => {
      const row = await restingFolderRow(page);
      const action = row.locator('.upload-more');

      expect(await token(row)).toBe('0');
      expect(await visibility(action)).toBe('hidden');
      await expect(action).toBeHidden();

      await row.hover();
      expect(await token(row)).toBe('1');
      await expect(action).toBeVisible();
      // Opacity fades in (0.2s transition) — poll for the settled value.
      await expect
        .poll(() => action.evaluate((el) => getComputedStyle(el).opacity))
        .toBe('1');

      await pointerAway(page);
      await expect.poll(() => visibility(action)).toBe('hidden');
    });

    test('keyboard: the focused row reveals its action and Tab reaches it', async ({
      page,
    }) => {
      const row = rowByName(page, 'Cases', dialog(page));
      await row.focus();
      await pointerAway(page);

      const action = row.locator('.upload-more');
      await expect(action).toBeVisible();
      // visibility: hidden would drop it from the Tab order — :focus-within
      // is in the reveal set precisely so this hop works.
      await page.keyboard.press('Tab');
      await expect(action).toBeFocused();
    });

    test('consumer override: the trigger stays visible while its MatMenu is open', async ({
      page,
    }) => {
      const row = await restingFolderRow(page);
      const action = row.locator('.upload-more');

      await row.hover();
      await action.click();
      const menu = page.locator('.mat-mdc-menu-panel');
      await expect(menu).toBeVisible();

      // The pointer moves onto the menu and focus sits in the overlay: the
      // row has lost hover AND focus-within — only [aria-expanded] holds it.
      await menu.hover();
      expect(await token(row)).toBe('0');
      // visibility flips to hidden only at the END of the 0.2s fade — assert
      // after any transition settles, or this passes without the override.
      await settled(action);
      expect(await visibility(action)).toBe('visible');
    });
  });

  test('selected row publishes the revealed state without hover or focus', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTree(page);

    // Not the first root — the Starred smart folder is unselectable.
    const row = rowByName(page, 'Cases');
    const id = await row.getAttribute('data-node-id');
    await row.focus();
    await page.keyboard.press('Space');
    await expect(row).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focusedNodeId(page)).not.toBe(id);
    await pointerAway(page);

    expect(await token(row)).toBe('1');
  });
});

test.describe('row reveal tokens — touch', () => {
  // No hover on touch: the tokens must stay UNSET so the consumer fallback
  // (always visible) applies — a hover-gated action would be unreachable.
  test.use({ hasTouch: true, isMobile: true });

  test('tokens are unset and the action shows via its fallback', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTree(page);
    expect(
      await page.evaluate(() => matchMedia('(hover: hover)').matches),
    ).toBe(false);

    await page.getByRole('button', { name: 'Upload' }).click();
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog.locator('.tree-viewport')).toBeVisible();

    const row = rows(page, dialog)
      .filter({ has: page.locator('.upload-more') })
      .last();
    expect(await token(row)).toBe('');
    await expect(row.locator('.upload-more')).toBeVisible();
  });
});
