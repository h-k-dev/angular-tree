import { expect, Page, test } from '@playwright/test';

import { rows, waitForTree } from './helpers';

/**
 * Phase 8 matrix — indent-guide CONNECTOR GEOMETRY. jsdom has no layout, so
 * the unit suite can only assert the inline top/height strings; whether the
 * line actually drops from the parent's toggle, lands on the last direct
 * child, and stays out of the glyph is only provable against a real renderer
 * (this exact family shipped broken with zero e2e coverage — hence this file).
 * The Static page's Figma panel is constant data, fully expanded, itemSize 28.
 */

interface RowBox {
  top: number;
  bottom: number;
  centre: number;
  colLeft: number;
  colRight: number;
  colBottom: number;
}

interface GuideBox {
  level: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  elbow: boolean;
}

/** Rects of the Figma panel's named rows + all its guides, in viewport px. */
function measurePanel(page: Page, names: readonly string[]) {
  return page.evaluate((wanted) => {
    const panel = document.querySelector('.tool-panel--figma')!;
    const measured: Record<string, RowBox> = {};
    for (const name of wanted) {
      // `.at(-1)`: duplicate names ('Card' ×4) resolve to the LAST row —
      // the only duplicate this spec reads is Components' trailing child.
      const row = [...panel.querySelectorAll('.tree-node')]
        .filter(
          (candidate) =>
            candidate.querySelector('.layer-name')?.textContent?.trim() ===
            name,
        )
        .at(-1)!;
      const rect = row.getBoundingClientRect();
      const col = row
        .querySelector('.layer-toggle, .layer-toggle-spacer')!
        .getBoundingClientRect();
      measured[name] = {
        top: rect.top,
        bottom: rect.bottom,
        centre: (rect.top + rect.bottom) / 2,
        colLeft: col.left,
        colRight: col.right,
        colBottom: col.bottom,
      };
    }
    const guides = [...panel.querySelectorAll<HTMLElement>('.tree-guide')].map(
      (guide) => {
        const rect = guide.getBoundingClientRect();
        return {
          level: Number(guide.style.getPropertyValue('--tree-level')),
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          elbow: guide.hasAttribute('data-elbow'),
        };
      },
    );
    return { rows: measured, guides };
  }, names);
}

/** The guide whose line starts at this row's bottom seam (its group's guide). */
function guideOf(guides: readonly GuideBox[], parent: RowBox): GuideBox {
  const guide = guides.find(
    (candidate) => Math.abs(candidate.top - parent.bottom) <= 1,
  );
  expect(
    guide,
    'expected a guide starting at the parent row seam',
  ).toBeTruthy();
  return guide!;
}

test.describe('Indent-guide connectors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/static');
    await waitForTree(page);
  });

  test('the line spans parent row seam → last DIRECT child centre', async ({
    page,
  }) => {
    const { rows: row, guides } = await measurePanel(page, [
      'Links',
      'About',
      'Page 1',
      'Footer',
      'Legal',
      'Components',
      'Card',
      'Body',
    ]);

    // Leaf-children group: Links's line ends at About (its last child).
    expect(
      Math.abs(guideOf(guides, row['Links']).bottom - row['About'].centre),
    ).toBeLessThanOrEqual(1);

    // Nested groups end at the last DIRECT child, not the last descendant —
    // a line running past its own children dangles beside a grandchild.
    expect(
      Math.abs(guideOf(guides, row['Page 1']).bottom - row['Footer'].centre),
    ).toBeLessThanOrEqual(1);
    expect(guideOf(guides, row['Page 1']).bottom).toBeLessThan(
      row['Legal'].top,
    );
    expect(
      Math.abs(guideOf(guides, row['Components']).bottom - row['Card'].centre),
    ).toBeLessThanOrEqual(1);
    expect(guideOf(guides, row['Components']).bottom).toBeLessThan(
      row['Body'].top,
    );

    // The seam start clears the toggle glyph (toggle always fits its row).
    expect(guideOf(guides, row['Links']).top).toBeGreaterThanOrEqual(
      row['Links'].colBottom,
    );
  });

  test('the line hangs under the parent toggle and the elbow reaches the child column', async ({
    page,
  }) => {
    const { rows: row, guides } = await measurePanel(page, ['Links', 'Home']);
    const guide = guideOf(guides, row['Links']);

    // Box centre (where ::before draws the line) = parent toggle centre.
    const lineX = (guide.left + guide.right) / 2;
    expect(
      Math.abs(lineX - (row['Links'].colLeft + row['Links'].colRight) / 2),
    ).toBeLessThanOrEqual(1);

    // Elbow attribute + rendered └: a bottom border curving into the child
    // column — the box's inline end is where the child's content starts.
    expect(guide.elbow).toBe(true);
    expect(Math.abs(guide.right - row['Home'].colLeft)).toBeLessThanOrEqual(1);
    const before = await page
      .locator('.tool-panel--figma .tree-guide[data-elbow]')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el, '::before');
        return {
          bottom: style.borderBottomStyle,
          radius: parseFloat(style.borderEndStartRadius),
        };
      });
    expect(before.bottom).toBe('solid');
    expect(before.radius).toBeGreaterThan(0);
  });

  test('RTL mirrors the connector to the right of the child column', async ({
    page,
  }) => {
    await page.goto('/static?dir=rtl');
    await waitForTree(page);
    const { rows: row, guides } = await measurePanel(page, ['Links', 'Home']);
    const guide = guideOf(guides, row['Links']);

    // Same anchors as LTR, mirrored: line under the toggle, elbow toward the
    // child's column — which now extends LEFTWARD from the guide box.
    const lineX = (guide.left + guide.right) / 2;
    expect(
      Math.abs(lineX - (row['Links'].colLeft + row['Links'].colRight) / 2),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(guide.left - row['Home'].colRight)).toBeLessThanOrEqual(1);
  });
});

test.describe('Indent guides under virtualization', () => {
  test('a group cut by the render window keeps an open end (no elbow)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTree(page);
    await page.getByRole('button', { name: '100k mode' }).click();
    await expect(page.getByRole('button', { name: /nodes/ })).toBeVisible();
    await expect(rows(page).first()).toBeVisible();

    // xl: everything expanded — groups at the top run far past the window.
    const guides = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.tree-guide')].map(
        (guide) => ({
          bottom: guide.getBoundingClientRect().bottom,
          elbow: guide.hasAttribute('data-elbow'),
        }),
      ),
    );
    const renderEdge = await page.evaluate(() =>
      Math.max(
        ...[...document.querySelectorAll('.tree-node')].map(
          (row) => row.getBoundingClientRect().bottom,
        ),
      ),
    );

    const open = guides.filter((guide) => !guide.elbow);
    expect(open.length).toBeGreaterThan(0);
    // Open-ended lines are CLIPPED, not short: each runs to the render edge
    // (last rendered row's centre — half an item above its bottom).
    for (const guide of open) {
      expect(renderEdge - guide.bottom).toBeLessThanOrEqual(40 /* itemSize */);
    }
  });
});
