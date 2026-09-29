import { expect, test } from '@playwright/test';

import { rowByName, waitForTree } from './helpers';

/**
 * `[data-selected]` wins over `:hover` by source order, so a hovered selected
 * row used to give no feedback at all (#4, item 9). The dedicated
 * `.tree-node[data-selected]:hover` rule paints `--tree-node-selected-hover`
 * (default: the M3 8% state layer over the selected fill). jsdom can't hover —
 * real renderer only.
 */
test('hovering a selected row changes its background', async ({ page }) => {
  await page.goto('/');
  await waitForTree(page);

  const row = rowByName(page, 'Cases');
  await row.focus();
  await page.keyboard.press('Space');
  await expect(row).toHaveAttribute('data-selected', 'true');

  const background = () =>
    row.evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.mouse.move(0, 0);
  const resting = await background();
  await row.hover();
  await expect.poll(background).not.toBe(resting);
});
