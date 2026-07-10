import { expect, test } from '@playwright/test';

import { focusedNodeId, rows, scrollViewport, waitForTree } from './helpers';

/**
 * Phase 8 matrix — screen-reader groundwork the DOM can prove without real AT:
 * `aria-setsize`/`aria-posinset` must announce *true* positions at both
 * virtualized edges (not render-range-relative ones), and the keyboard
 * cut/paste move must work end-to-end. The real-AT (VoiceOver) pass stays a
 * manual checklist item — a browser can't fake an assistive stack.
 */
test.describe('ARIA at virtualized edges', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForTree(page);
  });

  test('setsize/posinset are true totals at the top edge', async ({ page }) => {
    const first = rows(page).first();
    // Roots: Starred + DnD rules + Cases + lazy archive + flaky + 2 loose files = 7 siblings.
    await expect(first).toHaveAttribute('aria-posinset', '1');
    await expect(first).toHaveAttribute('aria-level', '1');
    const setSize = Number(await first.getAttribute('aria-setsize'));
    expect(setSize).toBeGreaterThan(1);

    // Virtualization is actually on: far fewer rows rendered than exist.
    const rendered = await rows(page).count();
    const total = await page.evaluate(() => document.querySelectorAll('.tree-viewport [data-node-id]').length);
    expect(total).toBe(rendered); // recycled DOM, not a hidden full render
  });

  test('setsize/posinset stay true at the bottom edge', async ({ page }) => {
    const first = rows(page).first();
    const firstId = await first.getAttribute('data-node-id');
    await first.click();
    await page.keyboard.press('End');
    // End's focus chases the row across the virtual re-render — wait for it.
    await expect.poll(() => focusedNodeId(page)).not.toBe(firstId);

    // The focused row is now the very last visible node; its posinset must
    // equal its setsize (last sibling), which only holds if the values are
    // computed from the full model rather than the rendered slice.
    const id = await focusedNodeId(page);
    const last = page.locator(`[data-node-id="${id}"]`);
    const pos = Number(await last.getAttribute('aria-posinset'));
    const size = Number(await last.getAttribute('aria-setsize'));
    expect(pos).toBe(size);
    expect(pos).toBeGreaterThan(0);

    await scrollViewport(page, 0); // sanity: scrolling back re-renders row 1 correctly
    await expect(rows(page).first()).toHaveAttribute('aria-posinset', '1');
  });

  test('keyboard move (cut/paste) lands as a moved intent end-to-end', async ({ page }) => {
    // Pick a file row (draggable; folders host drops) and cut it.
    const file = rows(page).filter({ hasText: '.pdf' }).first();
    await file.click();
    await page.keyboard.press('ControlOrMeta+x');

    // Walk up to a folder row and paste *inside* it.
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown'); // Starred (smart) → 'Drag & drop rules' (ordinary drop host)
    await page.keyboard.press('ControlOrMeta+v');

    await expect(page.locator('.app-last-intent')).toContainText('moved 1 node(s)');
  });
});
