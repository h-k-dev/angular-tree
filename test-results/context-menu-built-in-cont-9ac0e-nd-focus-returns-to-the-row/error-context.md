# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: context-menu.spec.ts >> built-in context menu >> Escape closes the menu and focus returns to the row
- Location: e2e/context-menu.spec.ts:34:7

# Error details

```
Error: expect(locator).toBeHidden() failed

Locator:  locator('.cdk-overlay-container .tree-menu')
Expected: hidden
Received: visible
Timeout:  5000ms

Call log:
  - Expect "toBeHidden" with timeout 5000ms
  - waiting for locator('.cdk-overlay-container .tree-menu')
    14 × locator resolved to <div cdkmenu="" role="menu" tabindex="0" id="cdk-menu-0" aria-orientation="vertical" _ngcontent-ng-c2265458224="" class="cdk-menu cdk-menu-group tree-menu" data-cdk-menu-stack-id="cdk-menu-stack-0">…</div>
       - unexpected value "visible"

```

```yaml
- menu:
    - menuitem "Expand subtree"
    - menuitem "Collapse"
    - menuitem "Delete"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  |
  3  | import { builtInMenu, focusedNodeId, rowByName, rows, waitForTree } from './helpers';
  4  |
  5  | /**
  6  |  * Phase 8 matrix — built-in `treeContextMenu`: right-click + Shift+F10, at the
  7  |  * virtualized top/bottom edges, and the settled close-on-scroll behavior.
  8  |  * (`openContextMenu(node)` — the more_vert path — is covered by the unit
  9  |  * specs; the dialog spec exercises an external MatMenu trigger instead.)
  10 |  */
  11 | test.describe('built-in context menu', () => {
  12 |   test.beforeEach(async ({ page }) => {
  13 |     await page.goto('/');
  14 |     await waitForTree(page);
  15 |   });
  16 |
  17 |   test('right-click on a row opens the menu; item acts on the node', async ({ page }) => {
  18 |     const folder = rowByName(page, 'Cases');
  19 |     await folder.click({ button: 'right' });
  20 |
  21 |     const menu = builtInMenu(page);
  22 |     await expect(menu).toBeVisible();
  23 |     // Menu receives focus (keyboard-operable immediately — APG menu pattern).
  24 |     await expect
  25 |       .poll(() => page.evaluate(() => document.activeElement?.closest('.tree-menu') != null))
  26 |       .toBe(true);
  27 |
  28 |     await menu.getByRole('menuitem', { name: 'Collapse' }).click();
  29 |     await expect(menu).toBeHidden();
  30 |     // The intent reached the consumer (toolbar echoes it).
  31 |     await expect(page.locator('.app-last-intent')).toContainText('collapsed');
  32 |   });
  33 |
  34 |   test('Escape closes the menu and focus returns to the row', async ({ page }) => {
  35 |     const folder = rowByName(page, 'Cases');
  36 |     const id = await folder.getAttribute('data-node-id');
  37 |     await folder.click({ button: 'right' });
  38 |     await expect(builtInMenu(page)).toBeVisible();
  39 |
  40 |     await page.keyboard.press('Escape');
> 41 |     await expect(builtInMenu(page)).toBeHidden();
     |                                     ^ Error: expect(locator).toBeHidden() failed
  42 |     await expect.poll(() => focusedNodeId(page)).toBe(id);
  43 |   });
  44 |
  45 |   test('Shift+F10 opens the menu on the focused row', async ({ page }) => {
  46 |     const folder = rowByName(page, 'Cases');
  47 |     await folder.click();
  48 |     await page.keyboard.press('Shift+F10');
  49 |     await expect(builtInMenu(page)).toBeVisible();
  50 |   });
  51 |
  52 |   test('menu opens at both virtualized edges (Home / End targets)', async ({ page }) => {
  53 |     const first = rows(page).first();
  54 |     await first.click();
  55 |
  56 |     // Bottom edge: End scrolls the virtual viewport and focuses the last row.
  57 |     await page.keyboard.press('End');
  58 |     await page.keyboard.press('Shift+F10');
  59 |     await expect(builtInMenu(page)).toBeVisible();
  60 |     await page.keyboard.press('Escape');
  61 |
  62 |     // Top edge again — the row DOM at the far end was recycled in between.
  63 |     await page.keyboard.press('Home');
  64 |     await page.keyboard.press('Shift+F10');
  65 |     await expect(builtInMenu(page)).toBeVisible();
  66 |   });
  67 |
  68 |   test('scrolling the viewport closes the menu (settled close-on-scroll)', async ({ page }) => {
  69 |     await rowByName(page, 'Cases').click({ button: 'right' });
  70 |     await expect(builtInMenu(page)).toBeVisible();
  71 |
  72 |     await page
  73 |       .locator('.tree-viewport')
  74 |       .evaluate((viewport) => viewport.scrollBy({ top: 200 }));
  75 |     await expect(builtInMenu(page)).toBeHidden();
  76 |   });
  77 | });
  78 |
```
