import { Directive, inject, input, TemplateRef } from '@angular/core';

import type { TreeNodeContext } from './types';

/**
 * Declares a node template. Multiple defs may coexist; the first whose `when`
 * predicate matches wins, and a def without `when` is the fallback (Material
 * `matTreeNodeDef` convention).
 *
 * When `when` is a type guard, the template context narrows to the guarded
 * union member under `strictTemplates`:
 *
 * ```html
 * <ng-template treeNodeDef [treeNodeDefWhen]="isFolder" let-node>
 *   <!-- node is FolderNode here -->
 * </ng-template>
 * ```
 *
 * `S` defaults to `any` (not `unknown`) so guard-less fallback defs stay
 * usable — same trade-off CDK Table makes. Phase 0 spike, see ROADMAP.md.
 */
@Directive({ selector: '[treeNodeDef]' })
export class TreeNodeDef<T = any, S extends T = T> {
  readonly template = inject<TemplateRef<TreeNodeContext<S>>>(TemplateRef);

  /** Type-guard predicate selecting which nodes this template renders. */
  readonly when = input<((node: T) => node is S) | undefined>(undefined, {
    alias: 'treeNodeDefWhen',
  });

  static ngTemplateContextGuard<T, S extends T>(_dir: TreeNodeDef<T, S>, _ctx: unknown): _ctx is TreeNodeContext<S> {
    return true;
  }
}
