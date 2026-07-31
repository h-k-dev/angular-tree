import { expect, test } from '@playwright/test';

import { scrollViewport, waitForTree } from './helpers';

/**
 * Phase 8 matrix — labelOverflow: 'ellipsis' GEOMETRY. jsdom has no layout, so
 * the unit suite only pins the data attribute; whether capped rows really stop
 * CDK's shrink-wrapping content wrapper from outgrowing the viewport (the
 * wrapper's `min-width: 100%` is a floor — a nowrap label otherwise grows the
 * scroll content and ellipsis never engages) is only provable against a real
 * renderer. Seed: the Media library's absurdly long Agent 327 title, truncated
 * by plain consumer CSS (`text-overflow: ellipsis`) — the untreated case the
 * wrapper pin exists for.
 */

test.describe('labelOverflow: ellipsis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/media');
    await waitForTree(page);
    // The long-titled row sits near the playlist's end — bring it into range.
    await scrollViewport(page, 10_000);
  });

  test('rows cap at the viewport: no horizontal overflow, CSS ellipsis engages', async ({
    page,
  }) => {
    const label = page.locator('.media-name', { hasText: 'Agent 327' });
    await expect(label).toBeVisible();

    const geometry = await page.evaluate(() => {
      const viewport = document.querySelector('.tree-viewport')!;
      const wrapper = viewport.querySelector(
        '.cdk-virtual-scroll-content-wrapper',
      )!;
      const long = [...document.querySelectorAll('.media-name')].find((el) =>
        el.textContent?.includes('Agent 327'),
      )!;
      return {
        viewportScrollWidth: viewport.scrollWidth,
        viewportClientWidth: viewport.clientWidth,
        wrapperWidth: wrapper.getBoundingClientRect().width,
        labelScrollWidth: long.scrollWidth,
        labelClientWidth: long.clientWidth,
        labelTextOverflow: getComputedStyle(long).textOverflow,
      };
    });

    // The wrapper lands exactly on its min-width floor: the viewport's width.
    expect(geometry.wrapperWidth).toBeLessThanOrEqual(
      geometry.viewportClientWidth + 1,
    );
    // No horizontal scrollbar — scroll and client widths agree.
    expect(geometry.viewportScrollWidth).toBe(geometry.viewportClientWidth);
    // The label is genuinely CLIPPED (text wider than its box), not merely
    // styled — with the wrapper unpinned this is where truncation silently
    // degrades to a horizontal scrollbar (clientWidth grows to fit the text).
    expect(geometry.labelScrollWidth).toBeGreaterThan(
      geometry.labelClientWidth,
    );
    expect(geometry.labelTextOverflow).toBe('ellipsis');
  });

  test('short labels keep their intrinsic width (capping is a ceiling)', async ({
    page,
  }) => {
    await scrollViewport(page, 0);
    const short = page.locator('.media-name', { hasText: 'Big Buck Bunny' });
    await expect(short).toBeVisible();
    const clipped = await short.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(clipped).toBe(false);
  });
});
