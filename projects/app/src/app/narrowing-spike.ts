import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AngularTree, TreeNodeDef } from '@h-k-dev/angular-tree';

import { DocNode, isFolder } from './example-data';

/**
 * Phase 0 type-narrowing spike — VERIFIED 2026-07-05.
 *
 * With `[treeNodeDefWhen]="isFolder"` the template context narrows to
 * `FolderNode` under strictTemplates: `node.children.length` compiles, and
 * `node.size` was confirmed to produce TS2339 ("does not exist on type
 * 'FolderNode'"). Generic inference flows: `when` binding → `TreeNodeDef<T, S>`
 * → `ngTemplateContextGuard` → `let-node`.
 *
 * Kept as living documentation of the spike (ROADMAP Phase 0 deliverable).
 */
@Component({
  selector: 'app-narrowing-spike',
  imports: [AngularTree, TreeNodeDef],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './narrowing-spike.html',
})
export class NarrowingSpike {
  roots: DocNode[] = [];
  isFolder = isFolder;
  children = (n: DocNode) => (isFolder(n) ? n.children : undefined);
  key = (n: DocNode) => n.id;
}
