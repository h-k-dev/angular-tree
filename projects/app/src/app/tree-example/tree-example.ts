import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal } from '@angular/core';
import { CdkMenuItem } from '@angular/cdk/menu';
import { SelectionModel } from '@angular/cdk/collections';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

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
} from 'angular-tree';

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
  /** Lazy folders resolve after a delay — simulates a server fetch (Phase 3). */
  getChildren = (node: DocNode) =>
    isFile(node)
      ? undefined
      : isFolder(node) && node.lazy
        ? new Promise<DocNode[]>((resolve) => setTimeout(() => resolve(node.children), 1_200))
        : node.children;
  getKey = (node: DocNode) => node.id;
  nodeName = (node: DocNode) => node.name;
  matchesNode = (node: DocNode, term: string) =>
    node.name.toLowerCase().includes(term.toLowerCase());

  /** Only real folders host drops (smart folders are virtual) — per-type predicates. */
  dropForbidden = (ctx: TreeDropContext<DocNode>) =>
    ctx.parentNode != null && !isFolder(ctx.parentNode);
  /** The smart folder is a saved search — moving it makes no sense. */
  dragForbidden = isSmart;
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
        node.id === id
          ? { ...node, name }
          : isFile(node)
            ? node
            : { ...node, children: rename(node.children) },
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

  menuDelete(ids: readonly string[]) {
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
