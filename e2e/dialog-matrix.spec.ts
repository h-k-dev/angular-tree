import { expect, test } from '@playwright/test';

import { builtInMenu, focusedNodeId, rowByName, waitForTree } from './helpers';

/**
 * Phase 8 matrix — tree hosted inside `MatDialog`: the focus trap must not
 * fight the tree's focus engine, the built-in menu must open above the dialog
 * and restore focus on close, an external MatMenu trigger must coexist, and
 * the CDK drag preview must stack above the dialog.
 */
test.describe('tree inside MatDialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
    await page.getByRole('button', { name: 'Upload' }).click();
    await expect(
      page.locator('mat-dialog-container .tree-viewport'),
    ).toBeVisible();
  });

  const dialog = (page: import('@playwright/test').Page) =>
    page.locator('mat-dialog-container');

  test('focus trap and roving tabindex coexist — arrow keys move row focus', async ({
    page,
  }) => {
    const casesRow = rowByName(page, 'Cases', dialog(page));
    await casesRow.click();
    const before = await focusedNodeId(page);
    expect(before).not.toBeNull();

    await page.keyboard.press('ArrowDown');
    // Focus lands on the next row asynchronously (virtual re-render chase).
    await expect.poll(() => focusedNodeId(page)).not.toBe(before);
    expect(await focusedNodeId(page)).not.toBeNull();
  });

  test('built-in menu opens above the dialog, restores focus to the row on close', async ({
    page,
  }) => {
    const row = rowByName(page, 'Cases', dialog(page));
    const id = await row.getAttribute('data-node-id');
    await row.click({ button: 'right' });

    const menu = builtInMenu(page);
    await expect(menu).toBeVisible();

    // Stacking proof: the point at the menu's center hits the menu, not the
    // dialog behind it (z-order is what the user actually sees).
    const box = (await menu.boundingBox())!;
    const hitsMenu = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('.tree-menu') != null,
      {
        x: box.x + box.width / 2,
        y: box.y + Math.min(10, box.height / 2),
      },
    );
    expect(hitsMenu).toBe(true);

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect.poll(() => focusedNodeId(page)).toBe(id);
    // The dialog itself stayed open — Escape was consumed by the menu.
    await expect(dialog(page)).toBeVisible();
  });

  test('external MatMenu on the row more_vert coexists with the built-in menu', async ({
    page,
  }) => {
    await dialog(page)
      .locator('.tree-node')
      .filter({ hasText: 'Cases' })
      .first()
      .getByRole('button', { name: /Options for/ })
      .click();

    const matMenu = page.locator('.mat-mdc-menu-panel');
    await expect(matMenu).toBeVisible();
    await matMenu.getByRole('menuitem', { name: 'Upload here' }).click();
    await expect(matMenu).toBeHidden();
    await expect(dialog(page)).toContainText('Destination: Cases');
  });

  test('drag preview stacks above the dialog', async ({ page }) => {
    const row = rowByName(page, 'Cases', dialog(page));
    const box = (await row.boundingBox())!;

    // Hand-rolled pointer sequence: CDK ignores synthetic drag events, and the
    // preview only exists mid-drag — assert stacking while the button is down.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 + 60,
      { steps: 8 },
    );

    const preview = page.locator('.tree-drag-preview');
    await expect(preview).toBeVisible();
    // elementFromPoint can't see the preview (CDK previews are
    // pointer-events: none) — compare actual CSS stacking: climb both
    // elements to their diverging ancestors and rank by z-index, then by
    // document order (later paints above at equal z).
    const paintsAbove = await page.evaluate(() => {
      const preview = document.querySelector('.tree-drag-preview');
      const dialog = document.querySelector('mat-dialog-container');
      if (!preview || !dialog) return 'missing element';
      const chain = (el: Element) => {
        const out = [el];
        while (el.parentElement) out.push((el = el.parentElement));
        return out.reverse();
      };
      const a = chain(preview);
      const b = chain(dialog);
      let i = 0;
      while (a[i] === b[i]) i++;
      const z = (el: Element) => {
        const value = getComputedStyle(el as HTMLElement).zIndex;
        return value === 'auto' ? 0 : Number(value);
      };
      if (z(a[i]) !== z(b[i])) return z(a[i]) > z(b[i]);
      return (
        (b[i].compareDocumentPosition(a[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
      );
    });
    await page.mouse.up();
    expect(paintsAbove).toBe(true);
  });
});
