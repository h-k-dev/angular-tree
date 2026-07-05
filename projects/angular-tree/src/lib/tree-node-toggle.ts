import { Directive, inject } from '@angular/core';

import { TREE_NODE } from './types';

/**
 * Wires any element inside a node template to expand/collapse its row.
 * The tree ships no toggle UI — the consumer supplies the element.
 *
 * ```html
 * <button treeNodeToggle>{{ isExpanded ? '▾' : '▸' }}</button>
 * ```
 */
@Directive({
  selector: '[treeNodeToggle]',
  host: {
    '(click)': 'toggle($event)',
    '[attr.data-tree-toggle]': "''",
    // Out of the tab order (APG: treeitem content is not a tab stop) — the
    // keyboard equivalent is ArrowLeft/ArrowRight on the focused row.
    tabindex: '-1',
  },
})
export class TreeNodeToggle {
  readonly #node = inject(TREE_NODE);

  toggle(event: Event) {
    // Row click means "activate" (Gmail semantics) — the toggle must not bubble into it.
    event.stopPropagation();
    this.#node.toggle();
  }
}
