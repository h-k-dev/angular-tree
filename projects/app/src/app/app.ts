import {
  Component,
  computed,
  DOCUMENT,
  inject,
  linkedSignal,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CdkMenuItem } from '@angular/cdk/menu';
import { DecimalPipe } from '@angular/common';
import { SelectionModel } from '@angular/cdk/collections';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';

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
  FolderNode,
  generateExampleTree,
  isFile,
  isFolder,
  isSmart,
} from './example-data';

@Component({
  selector: '[app-root]',
  imports: [
    DecimalPipe,
    MatToolbarModule,
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
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '[class.dark-mode]': "theme() === 'dark'",
  },
})
export class App {
  readonly #document = inject(DOCUMENT);
  readonly #dialog = inject(MatDialog);

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  theme = signal<'light' | 'dark'>('light');
  themeClass = computed(() => `${this.theme()}-mode`);

  toggleTheme() {
    if (this.#document.startViewTransition) {
      this.#document.startViewTransition(() => {
        this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
      });

      return;
    }

    this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
  }

  // ---------------------------------------------------------------------------
  // Upload dialog — MatDialog-hosted tree + MatMenu context menu, the
  // stacking/focus-trap testbed of the ROADMAP Phase 8 integration matrix
  // ---------------------------------------------------------------------------
  openUpload() {
    import('./upload-dialog/upload-dialog').then(({ UploadDialog }) => {
      this.#dialog
        .open<InstanceType<typeof UploadDialog>, undefined, FolderNode>(UploadDialog)
        .afterClosed()
        .subscribe((folder) => {
          if (folder) this.lastIntent.set(`upload → "${folder.name}"`);
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Tree
  // ---------------------------------------------------------------------------
  /** `xl` ≈ 110k nodes — virtualization smoke run (ROADMAP Phase 2). */
  scale = signal<ExampleScale>('standard');
  readonly #example = computed(() => generateExampleTree(this.scale()));

  /** Writable (rename applies here), re-derived when the scale switches. */
  roots = linkedSignal<DocNode[]>(() => this.#example().roots);
  /** Everything expanded on load so the viewport scrolls immediately. */
  defaultExpandedKeys = computed(() => this.#example().folderIds);
  nodeCount = computed(() => this.#example().nodeCount);

  toggleScale() {
    this.scale.update((scale) => (scale === 'standard' ? 'xl' : 'standard'));
  }

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

  activeNode = signal<DocNode | null>(null);

  /** Root-level load flag → drives the projected `treeLoadingDef`. */
  rootLoading = signal(false);

  /** Demo: flash the loading overlay for a moment (real apps set this around a fetch). */
  simulateLoad() {
    this.rootLoading.set(true);
    setTimeout(() => this.rootLoading.set(false), 1_500);
  }

  /** Consumer-owned selection over node keys (controlled — ROADMAP settled). */
  selectionModel = new SelectionModel<string>(/* multiple */ true);
  search = signal('');

  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }

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

  /** Last intent, surfaced in the toolbar — the demo's "consumer applied it" proof. */
  lastIntent = signal<string | null>(null);

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
