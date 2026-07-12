import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CdkMenuItem } from '@angular/cdk/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import {
  AngularTree,
  TreeContextMenu,
  TreeNodeDef,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

import {
  DocNode,
  FolderNode,
  generateExampleTree,
  isFile,
  isFolder,
} from '../example-data';

/**
 * Testbed dialog for the ROADMAP Phase 8 integration matrix — a tree hosted
 * inside `MatDialog`. Exercises BOTH menu paths side by side: the tree's
 * built-in right-click menu (`treeContextMenu`, CDK-shell) AND an arbitrary
 * action-button menu (the row's `more_vert` → MatMenu) — so a consumer can mix
 * the built-in host with any external trigger on a per-element basis.
 */
@Component({
  selector: 'app-upload-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    CdkMenuItem,
    AngularTree,
    TreeContextMenu,
    TreeNodeDef,
    TreeNodeToggle,
  ]
  templateUrl: './upload-dialog.html',
  styleUrl: './upload-dialog.scss',
})
export class UploadDialog {
  readonly #dialogRef =
    inject<MatDialogRef<UploadDialog, FolderNode>>(MatDialogRef);

  /** Real folders only — a smart folder can't receive uploads, and the
   *  DnD-rules showcase is main-example furniture, not a destination. */
  readonly roots = generateExampleTree('standard')
    .roots.filter(isFolder)
    .filter((node) => node.id !== 'dnd');
  /** Cases opens first so the dialog shows depth immediately. */
  readonly expandedKeys = [this.roots[0].id];

  isFolder = isFolder;
  children = (node: DocNode) =>
    isFile(node)
      ? undefined
      : isFolder(node) && node.lazy
        ? new Promise<DocNode[]>((resolve) =>
            setTimeout(() => resolve(node.children), 1_200),
          )
        : node.children;
  key = (node: DocNode) => node.id;
  nodeName = (node: DocNode) => node.name;

  readonly destination = signal<FolderNode | null>(null);
  readonly #destinationId = computed(() => this.destination()?.id);

  /** child id → parent folder, for the "Upload to parent" file action. */
  readonly #parents = new Map<string, FolderNode>();

  constructor() {
    const index = (folder: FolderNode) => {
      for (const child of folder.children) {
        this.#parents.set(child.id, folder);
        if (isFolder(child)) index(child);
      }
    };
    for (const root of this.roots) index(root);
  }

  isChosen(node: FolderNode): boolean {
    return this.#destinationId() === node.id;
  }

  parentOf(node: DocNode): FolderNode | null {
    return this.#parents.get(node.id) ?? null;
  }

  choose(node: FolderNode) {
    this.destination.set(node);
  }

  confirm() {
    const folder = this.destination();
    if (folder) this.#dialogRef.close(folder);
  }
}
