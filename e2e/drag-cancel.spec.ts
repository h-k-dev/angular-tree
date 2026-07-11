import { expect, test } from '@playwright/test';

import { rowByName, rows, waitForTree } from './helpers';

/**
 * v2 Phase 9 — Escape cancels an in-flight pointer drag: CDK has no public
 * mid-drag cancel, so the tree flags the drop dead and ends the sequence with
 * a synthetic mouseup. Only a real browser runs the full CDK drag pipeline.
 */
test.describe('Escape cancels a pointer drag', () => {
  test('no moved intent, preview gone, next drag unaffected', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTree(page);

    const source = rows(page).filter({ hasText: '.pdf' }).first();
    const target = rowByName(page, 'Cases');
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 8,
    });
    await expect(page.locator('.tree-drag-preview')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.tree-drag-preview')).toBeHidden();
    await page.mouse.up(); // trailing physical release must not resurrect the drop

    // No intent reached the consumer — the toolbar echo never appeared.
    await expect(page.locator('.app-last-intent')).toHaveCount(0);

    // The cancel didn't poison drag state: a fresh drag still moves.
    const from2 = (await rows(page)
      .filter({ hasText: '.pdf' })
      .first()
      .boundingBox())!;
    const to2 = (await rowByName(page, 'Cases').boundingBox())!;
    await page.mouse.move(
      from2.x + from2.width / 2,
      from2.y + from2.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(to2.x + to2.width / 2, to2.y + to2.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(page.locator('.app-last-intent')).toContainText(
      'moved 1 node(s)',
    );
  });
});
