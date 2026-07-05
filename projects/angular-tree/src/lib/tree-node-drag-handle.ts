import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { Directive, inject } from '@angular/core';

/**
 * Opt-in drag handle inside a node template (v2, ROADMAP2 Phase 9): the row
 * then drags *only* from this element, and the start delay drops to zero —
 * including touch, where row drags are otherwise disabled because long-press
 * belongs to the context menu (v1 decision). Grabbing a dedicated handle IS
 * the drag intent, so no delay disambiguation is needed.
 *
 * ```html
 * <ng-template treeNodeDef let-node>
 *   <mat-icon treeNodeDragHandle>drag_indicator</mat-icon>
 *   {{ node.name }}
 * </ng-template>
 * ```
 */
@Directive({
  selector: '[treeNodeDragHandle]',
  hostDirectives: [CdkDragHandle],
  host: {
    // Out of the tab order (APG: treeitem content is not a tab stop) — the
    // keyboard move path is Ctrl/Cmd+X/C + V on the focused row.
    tabindex: '-1',
    '[attr.data-tree-drag-handle]': "''",
  },
})
export class TreeNodeDragHandle {
  // The row's CdkDrag sits on an ancestor rendered by the tree itself; CDK
  // wires handle registration through the hosted CdkDragHandle. This class
  // only lifts the touch lockout — a dedicated handle makes long-press
  // unambiguous, so the context-menu conflict the delay guarded is gone.
  readonly #drag = inject(CdkDrag, { optional: true });

  constructor() {
    if (this.#drag) this.#drag.dragStartDelay = 0;
  }
}
