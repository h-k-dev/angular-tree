import { expect, Page, test } from '@playwright/test';

import { waitForTree } from './helpers';

/**
 * Phase 8 matrix — middleEllipsis against a REAL renderer: canvas-measured
 * `head…tail` must actually fit the laid-out label (jsdom has neither canvas
 * nor layout, so the unit suite can only exercise the pure core with a fake
 * measurer). Seed: the VS Code Explorer's absurdly long spec filename, running
 * the Finder tail rule (`middleEllipsisTail="extension"`); the `title`
 * attribute carries the untruncated name and is this spec's ground truth.
 */

const LONG = (page: Page) =>
  page.locator('.vsc-name[title^="virtualized-explorer"]');

test.describe('middleEllipsis (macOS-style)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/vscode');
    await waitForTree(page);
    // src/app is default-open — the seed row renders without scrolling.
    await expect(LONG(page)).toBeVisible();
  });

  test('renders head…tail with the extension intact, fitting its box exactly', async ({
    page,
  }) => {
    const label = LONG(page);
    // Web-font arrival re-derives — wait until a truncated form is present.
    await expect(label).toContainText('…');

    const { full, rendered, fits } = await label.evaluate((el) => ({
      full: el.getAttribute('title')!,
      rendered: el.textContent!,
      fits: el.scrollWidth <= el.clientWidth,
    }));

    expect(rendered).not.toBe(full);
    const [head, tail] = rendered.split('…');
    expect(head.length).toBeGreaterThan(0);
    expect(full.startsWith(head)).toBe(true); // head is a true prefix
    expect(full.endsWith(tail)).toBe(true); // tail is a true suffix
    // Finder's rule, properly middle: the extension NEVER truncates AND both
    // ends of the stem survive — the tail carries real name characters too,
    // never the bare ".ts" (that would read as end-ellipsis).
    expect(tail.endsWith('.ts')).toBe(true);
    expect(tail.length).toBeGreaterThan('.ts'.length);
    // The composed string FITS — no CSS clipping, no end-ellipsis fallback.
    expect(fits).toBe(true);
    // aria-label mirrors the full name (AT never reads the … form).
    await expect(label).toHaveAttribute('aria-label', full);
  });

  test('dragging the sash re-truncates live (the Finder column-drag moment)', async ({
    page,
  }) => {
    const label = LONG(page);
    await expect(label).toContainText('…');
    const wide = await label.evaluate((el) => el.textContent!);

    // A real pointer drag on the sash — the explorer narrows and the label's
    // ResizeObserver re-derives through the flex chain, mid-gesture.
    const sash = page.locator('.vsc-sash');
    const box = (await sash.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x - 130, y, { steps: 8 });
    await page.mouse.up();

    await expect(label).toContainText('…');
    await expect
      .poll(async () => (await label.evaluate((el) => el.textContent!)).length)
      .toBeLessThan(wide.length);

    const narrow = await label.evaluate((el) => ({
      text: el.textContent!,
      fits: el.scrollWidth <= el.clientWidth,
    }));
    expect(narrow.fits).toBe(true);
    expect(narrow.text.endsWith('.ts')).toBe(true); // the rule holds narrow too
  });
});
