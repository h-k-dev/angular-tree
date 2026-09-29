import { expect, Page, test } from '@playwright/test';

import { focusedNodeId, scrollViewport, waitForTree } from './helpers';

/**
 * Sticky scroll (ROADMAP2 decision 16) against a real renderer — VS Code
 * `StickyScrollController` parity on the VS Code example (itemSize 22, default
 * cap 7). jsdom can only prove the math and the wiring; whether the band
 * really covers the list top, hands off pixel-flush during a push, keeps off
 * the scrollbar, and leaves the revealed/focused row uncovered needs layout.
 * The seed `src/app/content/…/pipeline` is eight folders deep — one past the
 * cap — and starts collapsed.
 */

const ROW = 22;
const APP = 'angular-tree/src/app';
const CHAIN = [
  `${APP}/content`,
  `${APP}/content/partials`,
  `${APP}/content/partials/crm`,
  `${APP}/content/partials/crm/deals`,
  `${APP}/content/partials/crm/deals/pipeline`,
];
const CRM = CHAIN[2];
const DEALS = CHAIN[3];
const BILLING = `${APP}/content/partials/billing`;

const leaf = (key: string) => key.slice(key.lastIndexOf('/') + 1);
const band = (page: Page) => page.locator('.vsc-tree .tree-sticky');
const pinned = (page: Page, key: string) =>
  page.locator(`.vsc-tree [data-sticky-key="${key}"]`);
const real = (page: Page, key: string) =>
  page.locator(`.vsc-tree [data-node-id="${key}"]`);

/** Pinned keys (last path segment) with their band-relative top, outermost first. */
function stack(page: Page) {
  return page
    .locator('.vsc-tree .tree-sticky-row')
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          `${(row as HTMLElement).dataset['stickyKey']!.split('/').pop()}@${(row as HTMLElement).style.top}`,
      ),
    );
}

/** Visible-order index of a key, via the dev-mode component (context-menu.spec precedent). */
function indexOf(page: Page, key: string) {
  return page.evaluate((wanted) => {
    const ng = (
      window as unknown as { ng: { getComponent(el: Element): unknown } }
    ).ng;
    const tree = ng.getComponent(document.querySelector('.vsc-tree')!) as {
      visibleRows(): readonly { key: string }[];
    };
    return tree.visibleRows().findIndex((row) => row.key === wanted);
  }, key);
}

async function viewportBox(page: Page) {
  return page.locator('.vsc-tree .tree-viewport').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      clientRight: rect.left + el.clientWidth,
    };
  });
}

test.describe('stickyScroll (VS Code parity)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vscode');
    await waitForTree(page);
    // Open the deep seed one level at a time through each folder's twistie.
    for (const key of CHAIN) {
      await real(page, key).locator('.vsc-twisty').click();
      await expect(real(page, key)).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('nothing pins at the top', async ({ page }) => {
    await scrollViewport(page, 0);
    await expect(band(page)).toHaveCount(0);
  });

  test('pins the outermost seven ancestors, over the list top, clear of the scrollbar', async ({
    page,
  }) => {
    const first =
      (await indexOf(page, `${CHAIN[4]}/pipeline-board.component.ts`)) * ROW;
    await scrollViewport(page, first + 5);

    // Eight ancestors, cap 7 → `pipeline` (the innermost) is the one dropped.
    expect(await stack(page)).toEqual([
      'angular-tree@0px',
      'src@22px',
      'app@44px',
      'content@66px',
      'partials@88px',
      'crm@110px',
      'deals@132px',
    ]);
    const box = await viewportBox(page);
    const rect = (await band(page).boundingBox())!;
    expect(rect.y).toBeCloseTo(box.top, 0);
    expect(rect.height).toBeCloseTo(7 * ROW, 0);
    // The scrollbar stays grabbable: the band ends at the client edge.
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.clientRight + 0.5);
  });

  test('push hand-off: a group’s pinned row rides up flush with the next group', async ({
    page,
  }) => {
    // Park `billing` (the row right after crm's subtree) half a row into
    // crm's slot (110..132): crm must ride up so its bottom meets billing.
    await scrollViewport(page, (await indexOf(page, BILLING)) * ROW - 121);

    expect(await stack(page)).toEqual([
      'angular-tree@0px',
      'src@22px',
      'app@44px',
      'content@66px',
      'partials@88px',
      'crm@99px',
    ]);
    const crm = (await pinned(page, CRM).boundingBox())!;
    const billing = (await real(page, BILLING).boundingBox())!;
    expect(crm.y + crm.height).toBeCloseTo(billing.y, 0);
  });

  test('clicking a pinned row reveals it under its ancestors, focuses and selects it', async ({
    page,
  }) => {
    const first =
      (await indexOf(page, `${CHAIN[4]}/pipeline-board.component.ts`)) * ROW;
    await scrollViewport(page, first + 5);

    await pinned(page, DEALS).locator('.vsc-name').click();

    // deals has six ancestors → its real row lands right under them.
    const box = await viewportBox(page);
    await expect
      .poll(async () => (await real(page, DEALS).boundingBox())?.y)
      .toBeCloseTo(box.top + 6 * ROW, 0);
    await expect.poll(() => focusedNodeId(page)).toBe(DEALS);
    await expect(real(page, DEALS)).toHaveAttribute('aria-selected', 'true');
    // The label click-to-toggle skips in the band (isSticky) — still open.
    await expect(real(page, DEALS)).toHaveAttribute('aria-expanded', 'true');
  });

  test('focus moves never leave the focused row under the band', async ({
    page,
  }) => {
    const first =
      (await indexOf(page, `${CHAIN[4]}/pipeline-board.component.ts`)) * ROW;
    await scrollViewport(page, first + 5);
    await pinned(page, DEALS).locator('.vsc-name').click();
    await expect.poll(() => focusedNodeId(page)).toBe(DEALS);

    // ArrowUp → crm, whose row sits under the band at this scroll offset.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focusedNodeId(page)).toBe(CRM);
    const box = await viewportBox(page);
    const row = (await real(page, CRM).boundingBox())!;
    const cover = (await band(page).boundingBox())?.height ?? 0;
    // VS Code reveal padding: min(level, cap) rows — crm is level 5.
    expect(row.y).toBeCloseTo(box.top + 5 * ROW, 0);
    expect(row.y).toBeGreaterThanOrEqual(box.top + cover - 0.5);
  });

  test('the twistie in a pinned row collapses that folder', async ({
    page,
  }) => {
    const first =
      (await indexOf(page, `${CHAIN[4]}/pipeline-board.component.ts`)) * ROW;
    await scrollViewport(page, first + 5);

    await pinned(page, CRM).locator('.vsc-twisty').click();
    await expect(pinned(page, CRM)).toHaveCount(0); // collapsed → nothing left to pin
    await scrollViewport(page, 0);
    await expect(real(page, CRM)).toHaveAttribute('aria-expanded', 'false');
  });

  test('dragging over a pinned row targets it as a drop INSIDE', async ({
    page,
  }) => {
    const first =
      (await indexOf(page, `${CHAIN[4]}/pipeline-board.component.ts`)) * ROW;
    await scrollViewport(page, first + 5);

    // A row well below the 154px band (the first files sit under it). Grab
    // its LABEL: at depth 8 the indent column is mostly guide overlays,
    // which are click targets of their own and never start a drag.
    const source = (await real(
      page,
      `${CHAIN[4]}/pipeline-stage-header.component.ts`,
    )
      .locator('.vsc-name')
      .boundingBox())!;
    const target = (await pinned(
      page,
      `${APP}/content/partials`,
    ).boundingBox())!;
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(target.x + 60, target.y + target.height / 2, {
      steps: 12,
    });

    const indicator = page.locator('.vsc-tree .tree-drop-indicator--inside');
    await expect(indicator).toBeVisible();
    const drawn = (await indicator.boundingBox())!;
    // Same box a list inside-drop draws: itemSize tall + its 2px border
    // (content-box), anchored at the pinned row's top.
    expect(drawn.y).toBeCloseTo(target.y, 0);
    expect(drawn.height).toBeGreaterThanOrEqual(target.height);
    expect(drawn.height).toBeLessThanOrEqual(target.height + 4);
    await page.mouse.up();
  });

  test('stack order: outermost first, each named row is a real ancestor', async ({
    page,
  }) => {
    // Guard against the band ever showing rows from a sibling chain.
    await scrollViewport(page, (await indexOf(page, DEALS)) * ROW + 30);
    const keys = await page
      .locator('.vsc-tree .tree-sticky-row')
      .evaluateAll((rows) =>
        rows.map((row) => (row as HTMLElement).dataset['stickyKey']!),
      );
    keys.forEach((key, i) => {
      if (i > 0) expect(key.startsWith(`${keys[i - 1]}/`)).toBe(true);
    });
    expect(keys.map(leaf)).toContain('deals');
  });
});
