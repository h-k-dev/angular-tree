# Accessibility

What the tree guarantees, and the one contract consumer templates must follow.

## What the tree owns

- **Roles & positions** — `role="tree"`/`role="treeitem"`, `aria-level`, `aria-expanded`, `aria-selected`/`aria-checked` (mode-dependent), and `aria-setsize`/`aria-posinset` computed from the _full_ model, so positions announce truthfully at both virtualized edges.
- **Focus** — roving `tabindex` (default) or `aria-activedescendant` (`focusMode`). Focus survives virtualization, data replacement (re-attached by key; vanished keys fall back to the nearest visible survivor), menu round-trips, and consumer dialogs. Before the user ever moves focus, the Tab target is the first _selected_ row when a selection exists (APG), then the first row.
- **Keyboard** — full APG map: arrows (RTL-mirrored), Home/End, PageUp/PageDown, type-ahead, Enter (activate), Space (select), Shift+Space (range from anchor), Ctrl/Cmd+A (select all visible / clear), Ctrl/Cmd+Shift+Home/End (select to edge), Shift+F10 / ContextMenu (menu), Ctrl/Cmd+X/C/V (move/copy), Escape (close menu, cancel drag, cancel mark, clear selection — one layer per press; focus always stays put, and an unconsumed Escape bubbles so enclosing dialogs still close). Clearing the selection announces politely (`announcements.selectionCleared`).
- **Labelling hook** — APG requires the `role="tree"` element to have an accessible name, and that element is the tree's _internal_ viewport: set `aria-label` (or `aria-labelledby` pointing at your visible heading) **on `<angular-tree>`** and the tree forwards it. This is the one ARIA attribute the consumer must supply.
- **Announcements** — moves/copies, lazy-load outcomes, and search result counts reach screen readers through a polite live region (CDK `LiveAnnouncer`). Customize or translate via the `announcements` input; pass `null` to silence:

```html
<angular-tree [announcements]="{ searchResults: (n, term) => n + ' Treffer für „' + term + '“' }" />
```

## The one rule for row templates

**Interactive elements inside a row must leave the tab order** (`tabindex="-1"`). A `treeitem`'s content is not a tab stop (APG): with 100k rows, every focusable button multiplies the Tab sequence, and screen-reader users lose the tree's single-stop model. Every capability has a keyboard equivalent on the focused row — expand/collapse (arrows), selection (Space, Shift+Space semantics via checkbox range), any action incl. rename (context menu via Shift+F10).

The tree-shipped directives (`treeNodeToggle`, `treeNodeCheckbox`, `treeNodeDragHandle`) already do this. For your own elements — action buttons, `more_vert` menus — set it yourself:

```html
<ng-template treeNodeDef let-node>
  <span>{{ node.name }}</span>
  <button tabindex="-1" [matMenuTriggerFor]="menu" aria-label="Options">⋮</button>
</ng-template>
```

Pointer users click them; keyboard users reach the same actions through the context menu. The rename input (`treeNodeEditInput`) is the deliberate exception — it _is_ the focus target while editing.

## What stays yours

- Accessible names: put real text (or `aria-label`s) in your templates; the tree never invents labels.
- A real assistive-technology pass: automated checks (axe, this suite) cover the mechanics — VoiceOver/NVDA behavior on your actual templates is your release gate.
