import { expect, Locator, Page } from '@playwright/test';

/** First fully rendered tree row (virtualized — rendered ≠ all). */
export function rows(page: Page, scope?: Locator) {
  return (scope ?? page.locator('body')).locator('.tree-node');
}

export function rowByName(page: Page, name: string, scope?: Locator) {
  return rows(page, scope).filter({ hasText: name }).first();
}

/** The tree's built-in CDK-shell context menu (overlay-hosted). */
export function builtInMenu(page: Page) {
  return page.locator('.cdk-overlay-container .tree-menu');
}

export async function waitForTree(page: Page) {
  await expect(rows(page).first()).toBeVisible();
}

/**
 * The row that currently holds DOM focus — roving tabindex means exactly one
 * row is the active element when focus is inside the tree.
 */
export async function focusedNodeId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    return (
      active?.closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'] ?? null
    );
  });
}

/** Scroll the virtual viewport to an offset and let the render range settle. */
export async function scrollViewport(page: Page, top: number) {
  await page.evaluate((offset) => {
    const viewport = document.querySelector('.tree-viewport');
    if (viewport) viewport.scrollTop = offset;
  }, top);
  await page.waitForTimeout(100);
}
