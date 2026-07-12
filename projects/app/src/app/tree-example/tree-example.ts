import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,

  // Signals
  input,
  linkedSignal,
  signal,
} from '@angular/core';

// CDK
import { CdkMenuItem } from '@angular/cdk/menu';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';

import {
  AngularTree,
  ContextRequestedEvent,
  MoveEvent,
  RenameEvent,
  SelectEvent,
  ToggleEvent,
  TreeContextMenu,
  TreeDropContext,
  TreeEmptyDef,
  TreeLoadingDef,
  TreeNodeCheckbox,
  TreeNodeDef,
  TreeNodeEditInput,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

import {
  applyCopy,
  applyDelete,
  applyMove,
  applyRename,
  DocNode,
  ExampleScale,
  FileExtension,
  generateExampleTree,
  isFile,
  isFolder,
  isSmart,
} from '../example-data';
import { FileSize } from '../file-size';

/** Per-extension Material icon — file "types" resolved in the consumer template. */
const FILE_ICONS: Record<FileExtension, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
  xlsx: 'table_chart',
  eml: 'mail',
  png: 'image',
};

/**
 * The living example: a document tree exercising the full angular-tree
 * surface — typed per-kind templates, checkbox cascade, lazy loading, drag &
 * drop, context menu, inline rename. The tree is CONTROLLED: it emits
 * intents (`moved`, `renamed`, …) and this component applies them to its own
 * data. Its source files render verbatim in the demo's code tabs.
 */
@Component({
  selector: 'app-tree-example',
  imports: [
    // Material
    MatButtonModule,
    MatIconModule,

    // CDK
    CdkMenuItem,

    // Angular Tree
    AngularTree,
    TreeContextMenu,

    // Directives
    TreeEmptyDef,
    TreeLoadingDef,
    TreeNodeCheckbox,
    TreeNodeDef,
    TreeNodeEditInput,
    TreeNodeToggle,

    // Pipes
    FileSize,
  ],
  templateUrl: './tree-example.html',
  styleUrl: './tree-example.scss',
})
export class TreeExample {
  readonly #dialog = inject(MatDialog);

  /** `xl` ≈ 110k nodes — virtualization smoke run (ROADMAP Phase 2). */
  readonly scale = input<ExampleScale>('standard');

  /** Matching child keeps its ancestor chain visible. */
  readonly searchTerm = input('');

  /** Root-level load flag → drives the projected `treeLoadingDef`. */
  readonly loading = input(false);

  readonly #example = computed(() => generateExampleTree(this.scale()));

  /** Writable (mutation intents apply here), re-derived when the scale switches. */
  roots = linkedSignal<DocNode[]>(() => this.#example().roots);

  /**
   * Controlled expansion (v2 Phase 15): `[(expandedKeys)]` — everything
   * expanded on load so the viewport scrolls immediately; a scale switch
   * re-derives (linkedSignal resets on its source), user toggles write back.
   * Snapshot/restore is just this signal — no imperative API needed.
   */
  expandedKeys = linkedSignal<readonly string[]>(
    () => this.#example().folderIds,
  );
  nodeCount = computed(() => this.#example().nodeCount);

  /**
   * Consumer-owned selection over node keys (v2 Phase 15): `[(selectedKeys)]`
   * — set it to select from outside, read it anywhere a signal works.
   */
  selectedKeys = signal<readonly string[]>([]);

  activeNode = signal<DocNode | null>(null);

  /** Last intent — the demo's "consumer applied it" proof, shown in the toolbar. */
  lastIntent = signal<string | null>(null);

  isFolder = isFolder;
  isSmart = isSmart;
  isFile = isFile;

  /** Flaky folders already asked once — the next attempt (Retry) succeeds. */
  readonly #flakyTried = new Set<string>();

  /**
   * Lazy folders resolve after a delay — simulates a server fetch (Phase 3).
   * A flaky folder's FIRST load rejects: the only path in the demo that
   * reaches the `hasError` → Retry branch of the folder template.
   */
  getChildren = (node: DocNode) => {
    if (isFile(node)) return undefined;
    if (isFolder(node) && node.flaky && !this.#flakyTried.has(node.id)) {
      this.#flakyTried.add(node.id);
      return new Promise<DocNode[]>((_, reject) =>
        setTimeout(
          () => reject(new Error('flaky by design — retry succeeds')),
          800,
        ),
      );
    }
    if (isFolder(node) && (node.lazy || node.flaky)) {
      return new Promise<DocNode[]>((resolve) =>
        setTimeout(() => resolve(node.children), 1_200),
      );
    }
    return node.children;
  };

  getKey = (node: DocNode) => node.id;

  nodeName = (node: DocNode) => node.name;

  matchesNode = (node: DocNode, term: string) =>
    node.name.toLowerCase().includes(term.toLowerCase());

  /**
   * Per-type drop rules ("Drag & drop rules" showcase): smart folders are
   * virtual (never a drop host); bins (`accepts`) take only files whose `dnd`
   * tag they list; tagged files land ONLY in bins — everything else lands in
   * ordinary folders and at the root. `some()` over the dragged set means one
   * unwelcome node vetoes the whole multi-drag.
   */
  dropForbidden = (ctx: TreeDropContext<DocNode>) => {
    const parent = ctx.parentNode;
    if (parent != null && !isFolder(parent)) return true;
    return ctx.dragNodes.some((node) =>
      isFile(node) && node.dnd
        ? !parent?.accepts?.includes(node.dnd)
        : parent?.accepts != null,
    );
  };

  /** Saved searches don't move; `locked` nodes demo `disableDrag` (drops unaffected). */
  dragForbidden = (node: DocNode) => isSmart(node) || node.locked === true;

  /** …and its virtual entries can't join a selection either. */
  selectable = (node: DocNode) => !isSmart(node);

  /**
   * `disableEdit` guards the tree's INLINE editing state (`tree.edit`) only —
   * the dialog path (`menuRename`) never enters editing state, so it isn't
   * gated. Saved searches keep their names; everything else offers BOTH.
   */
  editForbidden = (node: DocNode) => isSmart(node);

  activate(node: DocNode) {
    this.activeNode.set(node);
  }

  /** Double-click is the consumer's — rename is wired via the context menu. */
  openFile(node: DocNode) {
    this.lastIntent.set(`opened "${node.name}"`);
  }

  /** Controlled pattern end-to-end: the consumer owns the mutation. */
  onMove({ dragIds, parentId, index, dropEffect }: MoveEvent<DocNode>) {
    // dropEffect (v2): ⌥/Ctrl-drag or Ctrl+C-paste duplicates instead of moving.
    const apply = dropEffect === 'copy' ? applyCopy : applyMove;
    this.roots.update((roots) => apply(roots, dragIds, parentId, index));
    this.lastIntent.set(
      `${dropEffect === 'copy' ? 'copied' : 'moved'} ${dragIds.length} node(s) → ${parentId ?? 'root'}@${index}`,
    );
  }

  /** Controlled pattern end-to-end: apply the rename to our data, tree re-renders. */
  onRename({ id, name }: RenameEvent<DocNode>) {
    this.roots.update((roots) => applyRename(roots, id, name));
    this.lastIntent.set(`rename ${id} → "${name}"`);
  }

  /**
   * The OTHER rename pattern (docs/RECIPES.md): a prefilled MatDialog instead
   * of the inline input. The tree plays no part — no `tree.edit()`, no
   * editing state; the dialog result is applied to `roots` directly, same as
   * any other consumer mutation. The menu offers both: "Rename" goes inline
   * (`tree.edit`), "Rename in dialog…" comes here.
   */
  async menuRename(node: DocNode) {
    const { RenameDialog } = await import('../rename-dialog/rename-dialog');
    const name = await firstValueFrom(
      this.#dialog
        .open<InstanceType<typeof RenameDialog>, { name: string }, string>(
          RenameDialog,
          {
            data: { name: node.name },
          },
        )
        .afterClosed(),
    );
    if (!name || name === node.name) return;

    this.roots.update((roots) => applyRename(roots, node.id, name));
    this.lastIntent.set(`rename ${node.id} → "${name}" (dialog)`);
  }

  onSelection(event: SelectEvent<DocNode>) {
    this.lastIntent.set(`selection: ${event.ids.length} node(s)`);
  }

  onToggle(event: ToggleEvent<DocNode>) {
    this.lastIntent.set(
      `${event.expanded ? 'expanded' : 'collapsed'} ${event.id}`,
    );
  }

  /** Menu open/selection intents surface in the toolbar; the tree owns the menu itself. */
  onContextRequested(event: ContextRequestedEvent<DocNode>) {
    this.lastIntent.set(`context menu on ${event.ids.length} node(s)`);
  }

  menuToggleStar(node: DocNode) {
    if (!isFile(node)) return;
    const toggle = (nodes: DocNode[]): DocNode[] =>
      nodes.map((candidate) =>
        isFile(candidate)
          ? candidate.id === node.id
            ? { ...candidate, starred: !candidate.starred }
            : candidate
          : { ...candidate, children: toggle(candidate.children) },
      );
    this.roots.update(toggle);
    this.lastIntent.set(`starred toggled: ${node.id}`);
  }

  /**
   * Confirm-before-apply (docs/RECIPES.md): the intent is a PROPOSAL — nothing
   * is applied until we write to `roots`, so a declined dialog means nothing
   * happened and there is nothing to roll back.
   */
  async menuDelete(ids: readonly string[]) {
    const { ConfirmDelete } = await import('../confirm-delete/confirm-delete');
    const confirmed = await firstValueFrom(
      this.#dialog
        .open(ConfirmDelete, { data: { count: ids.length } })
        .afterClosed(),
    );
    if (!confirmed) return;

    this.roots.update((roots) => applyDelete(roots, ids));
    this.lastIntent.set(`deleted ${ids.length} node(s)`);
  }

  /** Template indexes the record directly — a lookup, not a call (STYLE.md). */
  fileIcons = FILE_ICONS;
}
