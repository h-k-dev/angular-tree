import { Directive, inject, TemplateRef } from '@angular/core';

/** What a `treeContextMenu` template receives — act on `ids`, branch on the node. */
export interface TreeContextMenuContext<T> {
  /** The clicked / focused node. */
  $implicit: T;
  /** Alias of `$implicit` for `let-node="node"` readers. */
  node: T;
  /** Post-reconciliation selection as nodes — what the menu should act on. */
  nodes: readonly T[];
  /** …the same selection as keys. */
  ids: readonly string[];
  /** Where the menu opened (pointer, or the focused row's rect for keyboard). */
  position: { x: number; y: number };
}

/**
 * Declares the tree's built-in context menu content (ROADMAP settled
 * 2026-07-06): the consumer projects menu *items*; the tree owns the
 * mechanics — trigger, positioning, keyboard access, close-on-scroll, and a
 * `cdkMenu` shell wrapping this template (so `cdkMenuItem` children get menu
 * keyboard navigation for free).
 *
 * ```html
 * <ng-template treeContextMenu let-node let-ids="ids">
 *   @switch (node.kind) { … }
 * </ng-template>
 * ```
 */
@Directive({
  selector: 'ng-template[treeContextMenu]',
})
export class TreeContextMenu<T> {
  readonly template =
    inject<TemplateRef<TreeContextMenuContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: TreeContextMenu<T>,
    context: unknown,
  ): context is TreeContextMenuContext<T> {
    return true;
  }
}
