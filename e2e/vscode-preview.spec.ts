import { expect, test } from '@playwright/test';

import { builtInMenu, rowByName, waitForTree } from './helpers';

test('VS Code preview ignores menu reconciliation until Preview is chosen', async ({
  page,
}) => {
  await page.goto('/vscode');
  await waitForTree(page);

  const editor = page.locator('.vsc-editor');
  const first = rowByName(page, 'main.ts');
  const second = rowByName(page, 'README.md');

  await first.click();
  await expect(editor).toHaveAttribute(
    'data-preview-path',
    'angular-tree/src/main.ts',
  );

  await second.click({ button: 'right' });
  await expect(second).toHaveAttribute('data-selected', 'true');
  await expect(builtInMenu(page)).toBeVisible();
  // Right-click reconciles selection first, but SelectEvent.cause lets the
  // preview consumer distinguish that write from a genuine selection.
  await expect(editor).toHaveAttribute(
    'data-preview-path',
    'angular-tree/src/main.ts',
  );

  await builtInMenu(page).getByRole('menuitem', { name: 'Preview' }).click();
  await expect(editor).toHaveAttribute(
    'data-preview-path',
    'angular-tree/README.md',
  );
});
