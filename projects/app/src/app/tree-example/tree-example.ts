import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { CdkMenuItem } from '@angular/cdk/menu';
import { SelectionModel } from '@angular/cdk/collections';
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
  DocNode,
  ExampleScale,
  FileExtension,
  generateExampleTree,
  isFile,
  isFolder,
  isSmart,
} from '../example-data';

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
    MatButtonModule,
    MatIconModule,
    AngularTree,
    TreeContextMenu,
    TreeEmptyDef,
    TreeLoadingDef,
    TreeNodeCheckbox,
    TreeNodeDef,
    TreeNodeEditInput,
    TreeNodeToggle,
    CdkMenuItem,
  ],
  templateUrl: './tree-example.html',
  styleUrl: './tree-example.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
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
  /** Everything expanded on load so the viewport scrolls immediately. */
  defaultExpandedKeys = computed(() => this.#example().folderIds);
  nodeCount = computed(() => this.#example().nodeCount);

  /** Consumer-owned selection over node keys (controlled — ROADMAP settled). */
  selectionModel = new SelectionModel<string>(/* multiple */ true);

  activeNode = signal<DocNode | null>(null);
  /** Last intent — the demo's "consumer applied it" proof, shown in the toolbar. */
  lastIntent = signal<string | null>(null);

  isFolder = isFolder;
  isSmart = isSmart;
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
        setTimeout(() => reject(new Error('flaky by design — retry succeeds')), 800),
      );
    }
    if (isFolder(node) && (node.lazy || node.flaky)) {
      return new Promise<DocNode[]>((resolve) => setTimeout(() => resolve(node.children), 1_200));
    }
    return node.children;
  };
  getKey = (node: DocNode) => node.id;
  nodeName = (node: DocNode) => node.name;
  matchesNode = (node: DocNode, term: string) => node.name.toLowerCase().includes(term.toLowerCase());

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
      isFile(node) && node.dnd ? !parent?.accepts?.includes(node.dnd) : parent?.accepts != null,
    );
  };
  /** Saved searches don't move; `locked` nodes demo `disableDrag` (drops unaffected). */
  dragForbidden = (node: DocNode) => isSmart(node) || node.locked === true;
  /** …and its virtual entries can't join a selection either. */
  selectable = (node: DocNode) => !isSmart(node);
  /** Folder names are fixed in this demo; files rename inline. */
  editForbidden = (node: DocNode) => !isFile(node);

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
    const rename = (nodes: DocNode[]): DocNode[] =>
      nodes.map((node) =>
        node.id === id ? { ...node, name } : isFile(node) ? node : { ...node, children: rename(node.children) },
      );
    this.roots.update(rename);
    this.lastIntent.set(`rename ${id} → "${name}"`);
  }

  onSelection(event: SelectEvent<DocNode>) {
    this.lastIntent.set(`selection: ${event.ids.length} node(s)`);
  }

  onToggle(event: ToggleEvent<DocNode>) {
    this.lastIntent.set(`${event.expanded ? 'expanded' : 'collapsed'} ${event.id}`);
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
      this.#dialog.open(ConfirmDelete, { data: { count: ids.length } }).afterClosed(),
    );
    if (!confirmed) return;

    this.roots.update((roots) => applyDelete(roots, ids));
    this.lastIntent.set(`deleted ${ids.length} node(s)`);
  }

  formatSize(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    return `${Math.round(bytes / 1_000)} kB`;
  }

  /** Per-extension Material icon — file "types" resolved in the consumer template. */
  fileIcon(ext: FileExtension): string {
    switch (ext) {
      case 'pdf':
        return 'picture_as_pdf';
      case 'docx':
        return 'description';
      case 'xlsx':
        return 'table_chart';
      case 'eml':
        return 'mail';
      case 'png':
        return 'image';
    }
  }
}
