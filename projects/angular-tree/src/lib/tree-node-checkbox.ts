import { Directive, effect, ElementRef, inject } from '@angular/core';

import { TREE_NODE } from './types';

/**
 * Wires any element to the row's derived tri-state and toggle — the tree
 * ships no checkbox UI (ROADMAP settled). Writes native `checked`/
 * `indeterminate` properties (host binding can't target them on a directive:
 * NG8002). For `mat-checkbox`, bind its inputs from the template context
 * instead — see docs/RECIPES.md (settled 2026-07-07: pattern, not adapter).
 *
 * Shift+click range-selects from the selection anchor over visible order
 * (Gmail semantics). The host leaves the tab order: `Space` on the focused
 * row is the keyboard equivalent (APG — treeitem content is not a tab stop).
 */
@Directive({
  selector: '[treeNodeCheckbox]',
  host: {
    '(click)': 'onClick($event)',
    tabindex: '-1',
  },
})
export class TreeNodeCheckbox {
  readonly #node = inject(TREE_NODE);
  readonly #element: HTMLInputElement = inject(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const state = this.#node.checkState();
      this.#element.checked = state === 'checked';
      // `indeterminate` is property-only (no HTML attribute) — the reason
      // this is an effect, not a template binding.
      this.#element.indeterminate = state === 'indeterminate';
    });
  }

  protected onClick(event: MouseEvent) {
    // Gmail semantics: checkbox toggles selection, row click activates —
    // without this stop, one click would do both.
    event.stopPropagation();
    this.#node.toggleSelection(event.shiftKey);
  }
}
