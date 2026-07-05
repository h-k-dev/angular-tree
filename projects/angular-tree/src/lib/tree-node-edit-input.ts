import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

import { TREE_NODE } from './types';

/**
 * The consumer-rendered rename input (the tree owns editing *state* only —
 * ROADMAP settled). Enter commits → the tree emits `renamed`; Escape cancels;
 * blur commits (file-explorer convention). Auto-focuses and selects on mount.
 */
@Directive({
  selector: 'input[treeNodeEditInput]',
  host: {
    '(keydown.enter)': 'commit()',
    '(keydown.escape)': 'cancel()',
    '(blur)': 'commit()',
  },
})
export class TreeNodeEditInput {
  readonly #node = inject(TREE_NODE);
  readonly #input: HTMLInputElement = inject(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => {
      this.#input.focus();
      this.#input.select();
    });
  }

  protected commit() {
    // cancel() (Escape) destroys the input, firing a trailing blur → the
    // handle ignores commits once editing has ended.
    this.#node.commitEdit(this.#input.value);
  }

  protected cancel() {
    this.#node.cancelEdit();
  }
}
