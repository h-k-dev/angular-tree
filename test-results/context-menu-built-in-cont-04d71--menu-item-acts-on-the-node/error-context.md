# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: context-menu.spec.ts >> built-in context menu >> right-click on a row opens the menu; item acts on the node
- Location: e2e/context-menu.spec.ts:17:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]: angular-tree
    - generic [ref=e4]: context menu on 1 node(s)
    - searchbox "Search…" [ref=e5]
    - button "100k mode" [ref=e6]:
      - img [ref=e7]: speed
      - generic [ref=e8]: 100k mode
    - button "Simulate load" [ref=e11]:
      - img [ref=e12]: sync
      - generic [ref=e13]: Simulate load
    - button "Switch to dark mode" [ref=e16] [cursor=pointer]:
      - img [ref=e17]: dark_mode
    - button "Upload" [ref=e20]:
      - img [ref=e21]: cloud_upload
      - generic [ref=e22]: Upload
  - main [ref=e25]:
    - tree [ref=e27]:
      - generic [ref=e28]:
        - treeitem "Toggle Starred Starred saved search 12" [level=1] [ref=e29]:
          - button "Toggle Starred" [ref=e30] [cursor=pointer]:
            - img [ref=e31]: chevron_right
          - img [ref=e34]: star
          - generic [ref=e35]: Starred
          - generic [ref=e36]: saved search
          - generic [ref=e37]: "12"
        - treeitem "Toggle Cases Select Cases Cases 6" [expanded] [active] [level=1] [ref=e38]:
          - button "Toggle Cases" [ref=e39] [cursor=pointer]:
            - img [ref=e40]: expand_more
          - button "Select Cases" [ref=e43] [cursor=pointer]:
            - img [ref=e44]: gavel
          - generic [ref=e45]: Cases
          - generic [ref=e46]: "6"
        - treeitem "Toggle Acme Corp Select Acme Corp Acme Corp 5" [expanded] [level=2] [ref=e47]:
          - button "Toggle Acme Corp" [ref=e48] [cursor=pointer]:
            - img [ref=e49]: expand_more
          - button "Select Acme Corp" [ref=e52] [cursor=pointer]:
            - img [ref=e53]: domain
          - generic [ref=e54]: Acme Corp
          - generic [ref=e55]: "5"
        - treeitem "Toggle Drafts Select Drafts Drafts 11" [expanded] [level=3] [ref=e56]:
          - button "Toggle Drafts" [ref=e57] [cursor=pointer]:
            - img [ref=e58]: expand_more
          - button "Select Drafts" [ref=e61] [cursor=pointer]:
            - img [ref=e62]: folder_open
          - generic [ref=e63]: Drafts
          - generic [ref=e64]: "11"
        - treeitem "Select Due Diligence.xlsx Due Diligence.xlsx signed 2.8 MB" [level=4] [ref=e65]:
          - button "Select Due Diligence.xlsx" [ref=e66] [cursor=pointer]:
            - img [ref=e67]: table_chart
          - generic [ref=e68]: Due Diligence.xlsx
          - generic [ref=e69]: signed
          - generic [ref=e70]: 2.8 MB
        - treeitem "Select Master Agreement.xlsx Master Agreement.xlsx 197 kB" [level=4] [ref=e71]:
          - button "Select Master Agreement.xlsx" [ref=e72] [cursor=pointer]:
            - img [ref=e73]: table_chart
          - generic [ref=e74]: Master Agreement.xlsx
          - generic [ref=e75]: 197 kB
        - treeitem "Select Exhibit A.png Exhibit A.png 2.7 MB" [level=4] [ref=e76]:
          - button "Select Exhibit A.png" [ref=e77] [cursor=pointer]:
            - img [ref=e78]: image
          - generic [ref=e79]: Exhibit A.png
          - generic [ref=e80]: 2.7 MB
        - treeitem "Select Due Diligence.pdf Due Diligence.pdf final 3.4 MB" [level=4] [ref=e81]:
          - button "Select Due Diligence.pdf" [ref=e82] [cursor=pointer]:
            - img [ref=e83]: picture_as_pdf
          - generic [ref=e84]: Due Diligence.pdf
          - generic [ref=e85]: final
          - generic [ref=e86]: 3.4 MB
        - treeitem "Select Due Diligence.docx Due Diligence.docx signed 183 kB" [level=4] [ref=e87]:
          - button "Select Due Diligence.docx" [ref=e88] [cursor=pointer]:
            - img [ref=e89]: description
          - generic [ref=e90]: Due Diligence.docx
          - generic [ref=e91]: signed
          - generic [ref=e92]: 183 kB
        - treeitem "Select Master Agreement.png Master Agreement.png draft 1.3 MB" [level=4] [ref=e93]:
          - button "Select Master Agreement.png" [ref=e94] [cursor=pointer]:
            - img [ref=e95]: image
          - generic [ref=e96]: Master Agreement.png
          - img [ref=e97]: star
          - generic [ref=e98]: draft
          - generic [ref=e99]: 1.3 MB
        - treeitem "Select Brand Guidelines.docx Brand Guidelines.docx 3.1 MB" [level=4] [ref=e100]:
          - button "Select Brand Guidelines.docx" [ref=e101] [cursor=pointer]:
            - img [ref=e102]: description
          - generic [ref=e103]: Brand Guidelines.docx
          - generic [ref=e104]: 3.1 MB
        - treeitem "Select Brand Guidelines.pdf Brand Guidelines.pdf draft 2.2 MB" [level=4] [ref=e105]:
          - button "Select Brand Guidelines.pdf" [ref=e106] [cursor=pointer]:
            - img [ref=e107]: picture_as_pdf
          - generic [ref=e108]: Brand Guidelines.pdf
          - generic [ref=e109]: draft
          - generic [ref=e110]: 2.2 MB
        - treeitem "Select Meeting Notes.png Meeting Notes.png final 921 kB" [level=4] [ref=e111]:
          - button "Select Meeting Notes.png" [ref=e112] [cursor=pointer]:
            - img [ref=e113]: image
          - generic [ref=e114]: Meeting Notes.png
          - generic [ref=e115]: final
          - generic [ref=e116]: 921 kB
        - treeitem "Select Master Agreement.png Master Agreement.png 3.4 MB" [level=4] [ref=e117]:
          - button "Select Master Agreement.png" [ref=e118] [cursor=pointer]:
            - img [ref=e119]: image
          - generic [ref=e120]: Master Agreement.png
          - img [ref=e121]: star
          - generic [ref=e122]: 3.4 MB
        - treeitem "Select NDA.xlsx NDA.xlsx final 617 kB" [level=4] [ref=e123]:
          - button "Select NDA.xlsx" [ref=e124] [cursor=pointer]:
            - img [ref=e125]: table_chart
          - generic [ref=e126]: NDA.xlsx
          - generic [ref=e127]: final
          - generic [ref=e128]: 617 kB
        - treeitem "Toggle Signed Select Signed Signed 9" [expanded] [level=3] [ref=e129]:
          - button "Toggle Signed" [ref=e130] [cursor=pointer]:
            - img [ref=e131]: expand_more
          - button "Select Signed" [ref=e134] [cursor=pointer]:
            - img [ref=e135]: folder_open
          - generic [ref=e136]: Signed
          - generic [ref=e137]: "9"
        - treeitem "Select Exhibit A.eml Exhibit A.eml signed 2.3 MB" [level=4] [ref=e138]:
          - button "Select Exhibit A.eml" [ref=e139] [cursor=pointer]:
            - img [ref=e140]: mail
          - generic [ref=e141]: Exhibit A.eml
          - generic [ref=e142]: signed
          - generic [ref=e143]: 2.3 MB
        - treeitem "Select Master Agreement.eml Master Agreement.eml 1.1 MB" [level=4] [ref=e144]:
          - button "Select Master Agreement.eml" [ref=e145] [cursor=pointer]:
            - img [ref=e146]: mail
          - generic [ref=e147]: Master Agreement.eml
          - generic [ref=e148]: 1.1 MB
        - treeitem "Select Invoice 2026-041.png Invoice 2026-041.png 3.3 MB" [level=4] [ref=e149]:
          - button "Select Invoice 2026-041.png" [ref=e150] [cursor=pointer]:
            - img [ref=e151]: image
          - generic [ref=e152]: Invoice 2026-041.png
          - generic [ref=e153]: 3.3 MB
        - treeitem "Select NDA.pdf NDA.pdf 589 kB" [level=4] [ref=e154]:
          - button "Select NDA.pdf" [ref=e155] [cursor=pointer]:
            - img [ref=e156]: picture_as_pdf
          - generic [ref=e157]: NDA.pdf
          - generic [ref=e158]: 589 kB
        - treeitem "Select Onboarding Checklist.png Onboarding Checklist.png 1.5 MB" [level=4] [ref=e159]:
          - button "Select Onboarding Checklist.png" [ref=e160] [cursor=pointer]:
            - img [ref=e161]: image
          - generic [ref=e162]: Onboarding Checklist.png
          - generic [ref=e163]: 1.5 MB
        - treeitem "Select NDA.xlsx NDA.xlsx 3.0 MB" [level=4] [ref=e164]:
          - button "Select NDA.xlsx" [ref=e165] [cursor=pointer]:
            - img [ref=e166]: table_chart
          - generic [ref=e167]: NDA.xlsx
          - generic [ref=e168]: 3.0 MB
        - treeitem "Select Exhibit A.pdf Exhibit A.pdf signed 2.1 MB" [level=4] [ref=e169]:
          - button "Select Exhibit A.pdf" [ref=e170] [cursor=pointer]:
            - img [ref=e171]: picture_as_pdf
          - generic [ref=e172]: Exhibit A.pdf
          - generic [ref=e173]: signed
          - generic [ref=e174]: 2.1 MB
        - treeitem "Select Onboarding Checklist.xlsx Onboarding Checklist.xlsx 939 kB" [level=4] [ref=e175]:
          - button "Select Onboarding Checklist.xlsx" [ref=e176] [cursor=pointer]:
            - img [ref=e177]: table_chart
          - generic [ref=e178]: Onboarding Checklist.xlsx
          - generic [ref=e179]: 939 kB
        - treeitem "Select Termination Notice.xlsx Termination Notice.xlsx signed 4.0 MB" [level=4] [ref=e180]:
          - button "Select Termination Notice.xlsx" [ref=e181] [cursor=pointer]:
            - img [ref=e182]: table_chart
          - generic [ref=e183]: Termination Notice.xlsx
          - generic [ref=e184]: signed
          - generic [ref=e185]: 4.0 MB
        - treeitem "Toggle Correspondence Select Correspondence Correspondence 6" [expanded] [level=3] [ref=e186]:
          - button "Toggle Correspondence" [ref=e187] [cursor=pointer]:
            - img [ref=e188]: expand_more
          - button "Select Correspondence" [ref=e191] [cursor=pointer]:
            - img [ref=e192]: folder_open
          - generic [ref=e193]: Correspondence
          - generic [ref=e194]: "6"
        - treeitem "Select Court Filing.png Court Filing.png 2.4 MB" [level=4] [ref=e195]:
          - button "Select Court Filing.png" [ref=e196] [cursor=pointer]:
            - img [ref=e197]: image
          - generic [ref=e198]: Court Filing.png
          - generic [ref=e199]: 2.4 MB
        - treeitem "Select Exhibit A.png Exhibit A.png signed 1.9 MB" [level=4] [ref=e200]:
          - button "Select Exhibit A.png" [ref=e201] [cursor=pointer]:
            - img [ref=e202]: image
          - generic [ref=e203]: Exhibit A.png
          - generic [ref=e204]: signed
          - generic [ref=e205]: 1.9 MB
        - treeitem "Select Payroll Summary.png Payroll Summary.png 513 kB" [level=4] [ref=e206]:
          - button "Select Payroll Summary.png" [ref=e207] [cursor=pointer]:
            - img [ref=e208]: image
          - generic [ref=e209]: Payroll Summary.png
          - img [ref=e210]: star
          - generic [ref=e211]: 513 kB
        - treeitem "Select Payroll Summary.png Payroll Summary.png draft 2.8 MB" [level=4] [ref=e212]:
          - button "Select Payroll Summary.png" [ref=e213] [cursor=pointer]:
            - img [ref=e214]: image
          - generic [ref=e215]: Payroll Summary.png
          - img [ref=e216]: star
          - generic [ref=e217]: draft
          - generic [ref=e218]: 2.8 MB
  - menu [ref=e226]:
    - menuitem "Expand subtree" [ref=e227] [cursor=pointer]
    - menuitem "Collapse" [ref=e228] [cursor=pointer]
    - menuitem "Delete" [ref=e229] [cursor=pointer]
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
> 26 |       .toBe(true);
     |        ^ Error: expect(received).toBe(expected) // Object.is equality
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
  41 |     await expect(builtInMenu(page)).toBeHidden();
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