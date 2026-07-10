# angular-tree

High-performance, headless Angular tree component: react-arborist internals, Angular Material DX. Zoneless, signals-only, `@angular/cdk` as the only runtime dependency.

- **Virtualized, always** — 100k+ nodes at 60fps (CDK virtual scroll, flat internal model, O(n) recompute). There is no non-virtualized mode: rows are fixed-height (`[itemSize]`, default 32px) and their DOM is disposable by design — see [Virtualization](https://github.com/h-k-dev/angular-tree/tree/main/docs/VIRTUALIZATION.md) before building stateful row templates
- **Headless** — the tree ships no UI it doesn't own: node content, checkboxes, editors, and menu items are your templates; the tree owns behavior, ARIA, and mechanics
- **Accessor-based** — no forced node shape; describe your data with functions, never reshape it
- **Complete interaction set** — multi-select (Ctrl/Shift/checkbox cascade), drag & drop with per-node guards, lazy loading, inline rename, type-ahead, search filtering, full APG keyboard map, RTL, built-in context-menu host

## Install

```bash
npm install @h-k-dev/angular-tree
```

Peer dependencies: `@angular/core|common|cdk` ≥ 21.2, `rxjs` ≥ 7.8.

## Quick start

```html
<angular-tree
  #tree="angularTree"
  [dataSource]="roots()"
  [childrenAccessor]="getChildren"
  [expansionKey]="getKey"
  [itemSize]="32"
  (activated)="open($event)"
  (moved)="applyMove($event)"
  (renamed)="applyRename($event)"
>
  <!-- folder template — `when` predicates are typed type guards -->
  <ng-container *treeNodeDef="let node; when: isFolder; let isExpanded = isExpanded">
    <button treeNodeToggle>{{ isExpanded ? '▾' : '▸' }}</button>
    <span>{{ node.name }}</span>
  </ng-container>

  <!-- leaf fallback -->
  <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
</angular-tree>
```

```ts
// Accessors describe your data — the tree never mutates it. Async children = lazy loading.
getChildren = (node: DocNode) => node.children ?? fetchChildren(node.id);
getKey = (node: DocNode) => node.id;
```

All mutations are **intents**: the tree emits `moved` / `renamed` / `selectionChange` / `toggled`, you apply them to your data, the tree re-renders. State stays yours.

## Testing

`@h-k-dev/angular-tree/testing` ships a CDK test harness (`TreeHarness`, `TreeNodeHarness`) including a real drag-gesture simulation (`dragTo`).

## Docs

- [Theming](https://github.com/h-k-dev/angular-tree/tree/main/docs/THEMING.md) — `--tree-*` tokens, Material system-token chain
- [Context menus](https://github.com/h-k-dev/angular-tree/tree/main/docs/CONTEXT-MENUS.md) — built-in host, external menu systems
- [Virtualization](https://github.com/h-k-dev/angular-tree/tree/main/docs/VIRTUALIZATION.md) — sizing, autosize escape hatch
- [Accessibility](https://github.com/h-k-dev/angular-tree/tree/main/docs/ACCESSIBILITY.md) — what the tree guarantees, the one row-template rule, announcements
- [Recipes](https://github.com/h-k-dev/angular-tree/tree/main/docs/RECIPES.md) — `mat-checkbox`, loading masks, dialog refocus
- [Migration](https://github.com/h-k-dev/angular-tree/tree/main/docs/MIGRATION.md) — from PrimeNG `p-tree` / jsTree: accessor adapters, CRUD → intents, synthetic nodes, typed actions

## License

MIT
