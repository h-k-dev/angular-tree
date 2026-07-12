# Migrating from PrimeNG `p-tree` / jsTree

The port is mechanical once you accept the one philosophical difference: those
engines own your data (they mutate `TreeNode[]` / jsTree's internal model);
`angular-tree` never touches it. You keep your objects, describe them with
accessor functions, and apply the tree's _intents_ (`moved`, `renamed`, …) to
your own state. Everything below follows from that.

Generic patterns (loading mask, dialog refocus, `mat-checkbox`) live in
[RECIPES.md](./RECIPES.md); the a11y contract in
[ACCESSIBILITY.md](./ACCESSIBILITY.md).

## Accessor adapter guide

No data reshaping — write four functions against the shape you already have:

| angular-tree accessor | PrimeNG `TreeNode`                                          | jsTree node         | typical wrapper (`{ id, label, value, data, icon }`) |
| --------------------- | ----------------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| `expansionKey`        | `(n) => n.key`                                              | `(n) => n.id`       | `(n) => String(n.id)`                                |
| `childrenAccessor`    | `(n) => n.children`                                         | `(n) => n.children` | `(n) => n.value?.children`                           |
| `typeaheadText`       | `(n) => n.label`                                            | `(n) => n.text`     | `(n) => n.label`                                     |
| `searchMatch`         | `(n, t) => n.label.toLowerCase().includes(t.toLowerCase())` | same over `text`    | same over `label`                                    |

Lazy loading replaces PrimeNG's `onNodeExpand` + `leaf=false` dance and
jsTree's `core.data` callback: return a `Promise`/`Observable` from
`childrenAccessor` for unloaded nodes. The optional second parameter is an
`AbortSignal` — pass it straight to `fetch`; the tree aborts on destroy and
invalidation, replacing hand-rolled `AbortController` maps:

```ts
children = (node: Category, signal?: AbortSignal) =>
  node.loaded ? node.documents : this.api.documentsOf(node.id, signal);
```

Keys must be stable and unique tree-wide (PrimeNG lets `key` be optional;
here it's the identity everything hangs off — selection, expansion, focus).

## Input / event mapping (PrimeNG `p-tree`)

| p-tree                                                 | angular-tree                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[value]="nodes"`                                      | `[dataSource]="nodes"` + accessors — your objects, not `TreeNode`                                                                                |
| `pTemplate="type"` per node type                       | `*treeNodeDef="…; when: isType"` — `when` is a _type guard_, the template context narrows                                                        |
| `selectionMode="multiple"` `[metaKeySelection]="true"` | `[multi]="true"` `clickAction="select"` (plain click selects, dblclick activates)                                                                |
| `[(selection)]="TreeNode[]"`                           | `[(selectedKeys)]="keys"` (two-way, keys) — `(selectionChange)` additionally carries `nodes`                                                     |
| `(onNodeSelect)`                                       | `(selectionChange)` / `(activated)` depending on what it drove                                                                                   |
| `(onNodeDoubleClick)`                                  | `(activated)` under `clickAction="select"`                                                                                                       |
| `(onNodeExpand)` + fetched-flag lazy load              | async `childrenAccessor`; per-row `isLoading`/`hasError` context; refresh via `tree.invalidateChildren(node)` or `collapseBehavior="invalidate"` |
| `(onNodeCollapse)` / expanded bookkeeping on nodes     | `(toggled)` intent; whole-set state via `[(expandedKeys)]` — nodes never mutated                                                                 |
| `[loading]` `loadingMode="mask"`                       | `[loading]` + `treeLoadingDef` (initial); operation masks: RECIPES.md                                                                            |
| `[contextMenu]="cm"` + `<p-contextmenu>`               | `<ng-template treeContextMenu let-node let-ids="ids">` — items only, the tree owns trigger/position/keyboard/close-on-scroll                     |
| `[draggableNodes]`/`[droppableNodes]` + `(onNodeDrop)` | always draggable unless `disableDrag`; validate with `disableDrop(ctx)` _before_ the drop lands; apply `(moved)` yourself                        |
| `[validateDrop]` + revert calls                        | `disableDrop` — forbidden targets never highlight, nothing to revert                                                                             |
| thread-line CSS + click hacks                          | `[indentGuides]="true"` — guide click collapses that group, built in                                                                             |
| `node.key` / `node.expanded` in templates              | context: `key`, `isExpanded`, `level`, `index`, `checkState`, …                                                                                  |
| — (not available)                                      | virtualization (100k+), type-ahead, keyboard move/copy, focus retention, announcements                                                           |

What you delete: the `TreeNode[]` mapping layer, expanded/partialSelected
bookkeeping on nodes, per-node `AbortController` maps, thread-line click
handlers, drop-validation revert logic.

## jsTree CRUD → intents

| jsTree                        | angular-tree                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_node`                 | insert into your data, then `tree.edit(newNode)` for name-it-now UX (recipe below)                                                                    |
| `rename_node`                 | `(renamed)` intent → apply to your data; no built-in gesture — wire `tree.edit(node)` yourself (context-menu item, your own keybinding, a row button) |
| `delete_node`                 | consumer-side: context-menu item mutates your data (no delete intent — deletion is an app concept)                                                    |
| `move_node`                   | `(moved)` with `dropEffect: 'move'`                                                                                                                   |
| `copy_node` (modifier-drag)   | `(moved)` with `dropEffect: 'copy'` — ⌥ on macOS, Ctrl elsewhere; keyboard `Ctrl/Cmd+C` + `V`                                                         |
| `check_node` / `uncheck_node` | `[checkboxSelection]` + `[(selectedKeys)]` — cascade + tri-state derived                                                                              |
| `state.opened` restore        | `[(expandedKeys)]` two-way (or `[defaultExpandedKeys]` for load-only restore)                                                                         |
| `$.jstree.defaults.dnd.*`     | `disableDrag` / `disableDrop` predicates                                                                                                              |

### Create-node recipe

The tree has no `create_node` because creation is a data mutation — but the
"appears in rename mode" UX is two lines:

```ts
addFolder(parent: Category) {
  const draft = { id: crypto.randomUUID(), name: 'New folder', children: [] };
  this.data.update((roots) => insertChild(roots, parent.id, draft));
  this.tree().expand(parent);
  this.tree().edit(draft); // opens the inline rename input; commit emits (renamed)
}
```

## Synthetic grouping nodes (trash, "uncategorized")

Nodes that exist only in the UI — a trash root, a group for rows whose foreign
key is `null` — are synthesized in _your_ data layer with stable keys. The
accessors make them indistinguishable from real nodes; the tree needs no
"virtual node" concept:

```ts
const UNCATEGORIZED = {
  kind: 'category' as const,
  id: 'category-none',
  name: 'Uncategorized',
};
const TRASH = { kind: 'trash' as const, id: 'trash', name: 'Trash' };

roots = computed(() => [
  ...this.categories().map(toCategoryNode),
  {
    ...UNCATEGORIZED,
    children: this.documents().filter((d) => d.categoryId == null),
  },
  { ...TRASH, children: this.deletedDocuments() },
]);
```

Lazy variants work identically — return the fetch from `childrenAccessor`
keyed on the synthetic id (`'trash'` → deleted-documents query).

### Drop on trash = delete

Expressible today, no special API: it's an inside-drop on the trash node,
interpreted by _your_ `moved` handler:

```ts
onMove(event: MoveEvent<DocNode>) {
  if (event.parentNode?.kind === 'trash') {
    this.softDelete(event.dragIds); // your dialog/undo flow
    return;
  }
  if (event.parentNode?.kind === 'category' && event.dragNodes[0]?.kind === 'trash-doc') {
    this.restore(event.dragIds, event.parentNode.id); // trash → category = restore
    return;
  }
  this.data.update((roots) => applyMove(roots, event.dragIds, event.parentId, event.index));
}
```

Pair with `disableDrop` so illegal combinations (document → document,
trash-doc → trash) never even highlight:

```ts
dropForbidden = (ctx: TreeDropContext<DocNode>) =>
  ctx.parentNode != null && ctx.parentNode.kind === 'document';
```

## Typed node actions — one union, no scattered switches

Make your node type a discriminated union once; everything branches on it with
narrowing — templates, menu items, guards, intent handlers:

```ts
type DocNode = CategoryNode | TrashNode | DocumentNode | TrashedDocumentNode;
const isCategory = (n: DocNode): n is CategoryNode => n.kind === 'category';
```

- **Templates**: one `*treeNodeDef="…; when: isCategory"` per member — `when`
  type-guards narrow the context, so `node.color` compiles only where it exists.
- **Context menu**: `@switch (node.kind)` inside the single `treeContextMenu`
  def; `ids` is the reconciled selection the items should act on.
- **Guards**: `disableDrag`/`disableDrop`/`disableEdit`/`isSelectable` all
  receive the typed node — `dragForbidden = isTrash`.
- **Intent handlers**: `switch (event.parentNode?.kind)` with a
  `satisfies never` default so new members fail the build, not review.

The tree never interprets a type field itself — classification stays yours,
which is exactly why it ports across data models unchanged.
