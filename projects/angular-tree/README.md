# angular-tree

[![CI/CD](https://github.com/h-k-dev/angular-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/h-k-dev/angular-tree/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40h-k-dev%2Fangular-tree)](https://www.npmjs.com/package/@h-k-dev/angular-tree)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/h-k-dev/angular-tree/blob/main/LICENSE)

High-performance, headless tree component for Angular. Zoneless, signals-only, virtualized from the first row — `@angular/cdk` is the only runtime dependency.

**[▶ Live demo](https://h-k-dev.github.io/angular-tree/)** — 100k-node mode, a drag & drop rules showcase, lazy loading with error + retry, context menus, inline rename, search, dark mode. The demo's full source lives in [`projects/app`](https://github.com/h-k-dev/angular-tree/tree/main/projects/app) and doubles as the reference integration.

## Why angular-tree

- **Virtualized, always** — 100k+ nodes at 60fps (CDK virtual scroll, flat internal model, O(n) recompute). There is no non-virtualized mode: rows are fixed-height (`[itemSize]`) and their DOM is disposable by design — see [Virtualization](https://github.com/h-k-dev/angular-tree/tree/main/docs/VIRTUALIZATION.md) before building stateful row templates
- **Headless** — the tree ships no UI it doesn't own: node content, checkboxes, editors, and menu items are your templates; the tree owns behavior, ARIA, and mechanics
- **Accessor-based** — no forced node shape; describe your data with functions, never reshape it. Async accessors are lazy loading
- **Controlled** — every mutation is an intent (`moved`, `renamed`, …) that you apply to your own state; the tree never touches your data
- **Complete interaction set** — multi-select (Ctrl/Shift/checkbox cascade), drag & drop with per-node rules and copy-on-modifier, keyboard move (Ctrl+X/V), lazy loading with retry, inline rename, type-ahead, search filtering, RTL, built-in context-menu host
- **Accessible** — full APG tree keyboard map, true `aria-setsize`/`aria-posinset` at virtualized edges, roving tabindex or active-descendant, screen-reader announcements — see [Accessibility](https://github.com/h-k-dev/angular-tree/tree/main/docs/ACCESSIBILITY.md)

## Install

```bash
npm install @h-k-dev/angular-tree
```

Peer dependencies: `@angular/core|common|cdk` ≥ 21.2, `rxjs` ≥ 7.8.

## Quick start

```ts
import { Component, signal } from '@angular/core';
import {
  AngularTree,
  MoveEvent,
  TreeNodeDef,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

interface DocNode {
  id: string;
  name: string;
  children?: DocNode[];
}

@Component({
  selector: 'app-docs',
  imports: [AngularTree, TreeNodeDef, TreeNodeToggle],
  templateUrl: './docs.html',
})
export class Docs {
  roots = signal<DocNode[]>([/* your data */]);

  // Accessors DESCRIBE your data — the tree never mutates it.
  // Returning a Promise/Observable makes the node lazy.
  getChildren = (node: DocNode) => node.children;
  getKey = (node: DocNode) => node.id;
  isFolder = (node: DocNode) => node.children != null;

  // Mutations arrive as INTENTS — apply them to your own state, the tree re-renders.
  applyMove({ dragIds, parentId, index }: MoveEvent<DocNode>) {
    this.roots.update((roots) => moveNodes(roots, dragIds, parentId, index));
  }
}
```

```html
<angular-tree
  #tree="angularTree"
  [dataSource]="roots()"
  [childrenAccessor]="getChildren"
  [expansionKey]="getKey"
  [itemSize]="32"
  (moved)="applyMove($event)"
>
  <!-- folder template — `when` predicates are typed type guards -->
  <ng-container
    *treeNodeDef="let node; when: isFolder; let isExpanded = isExpanded"
  >
    <button treeNodeToggle>{{ isExpanded ? '▾' : '▸' }}</button>
    <span>{{ node.name }}</span>
  </ng-container>

  <!-- leaf fallback -->
  <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
</angular-tree>
```

## API at a glance

The most-used surface — the [live demo](https://h-k-dev.github.io/angular-tree/) includes a full API reference page.

| Input                                                       | Purpose                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `dataSource`, `childrenAccessor`, `expansionKey`            | Your data, described by functions; async children = lazy loading          |
| `itemSize`                                                  | Fixed row height in px — the virtualization contract                      |
| `selection`, `multi`, `checkboxSelection`                   | Consumer-owned CDK `SelectionModel`, optional checkbox cascade            |
| `searchTerm`, `searchMatch`                                 | Filtering; matches keep their ancestor chain visible                      |
| `disableDrag`, `disableDrop`, `disableEdit`, `isSelectable` | Per-node behavior predicates — type rules live in your code, not the tree |
| `defaultExpandedKeys`, `loading`, `indentGuides`            | Initial expansion, root-level loading state, clickable guide lines        |

| Output                                  | Fires when                                                           |
| --------------------------------------- | -------------------------------------------------------------------- |
| `activated`                             | Row clicked / Enter — your "open" action                             |
| `moved`                                 | Drag or keyboard move — `dragIds`, `parentId`, `index`, `dropEffect` |
| `renamed`, `selectionChange`, `toggled` | Inline rename commit, selection set change, expand/collapse          |
| `childrenLoaded`                        | Lazy load resolved or errored (pair with `retryChildren`)            |
| `contextRequested`                      | Right-click / Shift+F10 — feeds the built-in menu host               |

## Testing

`@h-k-dev/angular-tree/testing` ships a CDK test harness (`TreeHarness`, `TreeNodeHarness`) including a real drag-gesture simulation (`dragTo`).

## Docs

- [Theming](https://github.com/h-k-dev/angular-tree/tree/main/docs/THEMING.md) — `--tree-*` tokens, Material system-token chain, row state hooks
- [Context menus](https://github.com/h-k-dev/angular-tree/tree/main/docs/CONTEXT-MENUS.md) — built-in host, external menu systems
- [Virtualization](https://github.com/h-k-dev/angular-tree/tree/main/docs/VIRTUALIZATION.md) — sizing, autosize escape hatch
- [Accessibility](https://github.com/h-k-dev/angular-tree/tree/main/docs/ACCESSIBILITY.md) — what the tree guarantees, the one row-template rule, announcements
- [Recipes](https://github.com/h-k-dev/angular-tree/tree/main/docs/RECIPES.md) — `mat-checkbox`, loading masks, dialog refocus
- [Migration](https://github.com/h-k-dev/angular-tree/tree/main/docs/MIGRATION.md) — from PrimeNG `p-tree` / jsTree: accessor adapters, CRUD → intents, synthetic nodes, typed actions

## License

MIT
