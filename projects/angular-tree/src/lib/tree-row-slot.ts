import { computed, Directive, inject, Injector, input } from '@angular/core';

import { TREE_NODE, TreeNodeHandle } from './types';

/**
 * One rendered row slot. Internal — sits on the tree-owned row element.
 *
 * `cdkVirtualFor` recycles row views: the same slot shows a different node
 * after a scroll. `ngTemplateOutlet` rebuilds its whole view whenever its
 * injector changes, so an injector minted per NODE made every recycled row
 * throw away the consumer's content and stamp it again. The slot's injector
 * lives as long as the slot does, and its `TREE_NODE` handle forwards to
 * whichever row the slot shows now — content directives inject it once and
 * keep working across recycles.
 */
@Directive({
  selector: '[treeRowSlot]',
  exportAs: 'treeRowSlot',
})
export class TreeRowSlot {
  /** The handle of the row this slot currently shows. */
  readonly handle = input.required<TreeNodeHandle>({ alias: 'treeRowSlot' });

  readonly injector = Injector.create({
    parent: inject(Injector),
    providers: [
      { provide: TREE_NODE, useValue: forwardingHandle(this.handle) },
    ],
  });
}

/** A handle whose every read and call lands on the row `current` names now. */
function forwardingHandle(current: () => TreeNodeHandle): TreeNodeHandle {
  return {
    get expandable() {
      return current().expandable;
    },
    isSelected: computed(() => current().isSelected()),
    checkState: computed(() => current().checkState()),
    toggle: () => current().toggle(),
    toggleSelection: (range) => current().toggleSelection(range),
    beginEdit: () => current().beginEdit(),
    commitEdit: (name) => current().commitEdit(name),
    cancelEdit: () => current().cancelEdit(),
  };
}
