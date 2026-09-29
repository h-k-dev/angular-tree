import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import { TreeNodeEditInput } from './tree-node-edit-input';
import type {
  ContextRequestedEvent,
  MoveEvent,
  ToggleEvent,
} from './events';

/**
 * Consumer-audit fixes (h-k-dev/angular-tree#4, batch 1): 5b keyboard marks
 * honour disableDrag, 5c expansion during search acts on what's shown, 5d the
 * context menu targets an unselectable row alone, 8 rename reveal + gesture
 * guards + create-then-rename.
 */

interface AuditNode {
  id: string;
  name: string;
  /** disableDrag */
  locked?: boolean;
  /** isSelectable → false */
  blocked?: boolean;
  children?: AuditNode[];
}

const FILLERS: AuditNode[] = Array.from({ length: 50 }, (_, i) => ({
  id: `f${i}`,
  name: `Filler ${i}`,
}));

const DATA: AuditNode[] = [
  {
    id: 'a',
    name: 'Alpha',
    children: [
      { id: 'a1', name: 'Apple' },
      {
        id: 'a2',
        name: 'Box',
        locked: true,
        children: [{ id: 'a2x', name: 'Banana' }],
      },
    ],
  },
  { id: 'b', name: 'Beta' },
  { id: 'blocked', name: 'Blocked', blocked: true },
  ...FILLERS,
];

@Component({
  imports: [AngularTree, TreeNodeDef, TreeNodeEditInput],
  template: `
    <angular-tree
      style="height: 400px"
      [dataSource]="data()"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [(selectedKeys)]="selected"
      [(expandedKeys)]="expanded"
      [multi]="true"
      [clickAction]="clickAction()"
      [searchTerm]="term()"
      [searchMatch]="match"
      [disableDrag]="isLocked"
      [isSelectable]="isSelectable"
      (activated)="activations.push($event)"
      (moved)="moves.push($event)"
      (toggled)="toggles.push($event)"
      (contextRequested)="contexts.push($event)"
    >
      <ng-template treeNodeDef let-node let-isEditing="isEditing">
        @if (isEditing) {
          <input treeNodeEditInput [value]="node.name" />
        } @else {
          {{ node.name }}
        }
      </ng-template>
    </angular-tree>
  `,
})
class Host {
  data = signal<readonly AuditNode[]>(DATA);
  children = (node: AuditNode) => node.children;
  key = (node: AuditNode) => node.id;
  match = (node: AuditNode, term: string) =>
    node.name.toLowerCase().includes(term.toLowerCase());
  isLocked = (node: AuditNode) => node.locked === true;
  isSelectable = (node: AuditNode) => node.blocked !== true;
  selected = signal<readonly string[]>([]);
  expanded = signal<readonly string[] | undefined>([]);
  clickAction = signal<'activate' | 'select'>('activate');
  term = signal('');
  activations: AuditNode[] = [];
  moves: MoveEvent<AuditNode>[] = [];
  toggles: ToggleEvent<AuditNode>[] = [];
  contexts: ContextRequestedEvent<AuditNode>[] = [];
  readonly tree = viewChild.required<AngularTree<AuditNode>>(AngularTree);
}

describe('AngularTree — consumer-audit fixes (#4)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const rowEl = (key: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);
  const renderedKeys = (): string[] =>
    [...fixture.nativeElement.querySelectorAll('[data-node-id]')].map(
      (el: Element) => el.getAttribute('data-node-id')!,
    );
  const viewportEl = (): HTMLElement =>
    fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
  /** Returns whether the tree left the event alone (not defaultPrevented). */
  const keydown = (init: KeyboardEventInit, target?: HTMLElement | null) =>
    (target ?? viewportEl()).dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }),
    );
  const viewport = () =>
    fixture.debugElement
      .query(By.directive(CdkVirtualScrollViewport))
      .injector.get(CdkVirtualScrollViewport);

  /** jsdom measures 0×0 — give the viewport a size so rows render. */
  async function forceViewportSize() {
    const element = viewportEl();
    Object.defineProperty(element, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(element, 'clientWidth', { value: 400, configurable: true });
    element.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0 }) as DOMRect;
    viewport().checkViewportSize();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
    await forceViewportSize();
  });

  describe('5b — Ctrl/Cmd+C/X honour disableDrag', () => {
    beforeEach(async () => {
      host.expanded.set(['a', 'a2']);
      await fixture.whenStable();
    });

    it('a drag-disabled row is not marked and the key stays the browser’s', async () => {
      rowEl('a2')!.focus();
      const untouched = keydown({ key: 'c', ctrlKey: true }, rowEl('a2'));
      expect(untouched).toBe(true); // native copy survives in a read-only row

      // Paste targets the FOCUSED row — move focus like a user would.
      rowEl('b')!.focus();
      keydown({ key: 'v', ctrlKey: true }, rowEl('b'));
      expect(host.moves).toEqual([]); // no invisible mark was planted
    });

    it('a drag-disabled pressed row marks nothing even with draggable rows selected (pointer parity)', async () => {
      host.selected.set(['a2', 'b']);
      await fixture.whenStable();
      rowEl('a2')!.focus();
      expect(keydown({ key: 'x', ctrlKey: true }, rowEl('a2'))).toBe(true);
    });

    it('locked rows drop out of a marked multi-selection', async () => {
      host.selected.set(['b', 'a2']);
      await fixture.whenStable();
      rowEl('b')!.focus();
      expect(keydown({ key: 'x', ctrlKey: true }, rowEl('b'))).toBe(false);
      rowEl('a1')!.focus();
      keydown({ key: 'v', ctrlKey: true, shiftKey: true }, rowEl('a1'));

      expect(host.moves).toHaveLength(1);
      expect(host.moves[0].dragIds).toEqual(['b']);
    });

    it('filters before pruning: a selected child of a locked selected folder still travels', async () => {
      host.selected.set(['a2', 'a2x']);
      await fixture.whenStable();
      rowEl('a2x')!.focus();
      keydown({ key: 'x', ctrlKey: true }, rowEl('a2x'));
      rowEl('b')!.focus();
      keydown({ key: 'v', ctrlKey: true, shiftKey: true }, rowEl('b'));

      expect(host.moves).toHaveLength(1);
      expect(host.moves[0].dragIds).toEqual(['a2x']);
    });
  });

  describe('5c — expand/collapse during search acts on what is shown', () => {
    beforeEach(async () => {
      host.term.set('ban'); // matches Banana → Alpha and Box force-expanded
      await fixture.whenStable();
    });

    it('a force-expanded ancestor reports expanded and collapses on toggle', async () => {
      const tree = host.tree();
      const alpha = host.data()[0];
      expect(renderedKeys()).toEqual(['a', 'a2', 'a2x']);
      expect(tree.isExpanded(alpha)).toBe(true);
      expect(tree.byKey.isExpanded('a')).toBe(true);

      tree.toggle(alpha);
      await fixture.whenStable();
      expect(renderedKeys()).toEqual(['a']);
      expect(rowEl('a')!.getAttribute('aria-expanded')).toBe('false');

      tree.toggle(alpha);
      await fixture.whenStable();
      expect(renderedKeys()).toEqual(['a', 'a2', 'a2x']);
    });

    it('ArrowLeft collapses a force-expanded row instead of a no-op', async () => {
      rowEl('a2')!.focus();
      keydown({ key: 'ArrowLeft' }, rowEl('a2'));
      await fixture.whenStable();
      expect(renderedKeys()).toEqual(['a', 'a2']);
    });

    it('never touches stored expansion — clearing the term restores it intact', async () => {
      host.tree().toggle(host.data()[0]);
      host.tree().toggle(host.data()[0]);
      host.tree().collapse(host.data()[0]);
      await fixture.whenStable();
      expect(host.expanded()).toEqual([]);
      expect(host.toggles).toEqual([]);

      host.term.set('');
      await fixture.whenStable();
      expect(renderedKeys().slice(0, 3)).toEqual(['a', 'b', 'blocked']);
    });

    it('a new term resets the session collapses', async () => {
      host.tree().collapse(host.data()[0]);
      await fixture.whenStable();
      expect(renderedKeys()).toEqual(['a']);

      host.term.set('bana');
      await fixture.whenStable();
      expect(renderedKeys()).toEqual(['a', 'a2', 'a2x']);
    });

    it('expanding a collapsed match still persists (open on demand while searching)', async () => {
      host.term.set('box'); // Box matches; its child Banana doesn't
      await fixture.whenStable();
      expect(rowEl('a2')!.getAttribute('aria-expanded')).toBe('false');

      host.tree().byKey.expand('a2');
      await fixture.whenStable();
      expect(renderedKeys()).toContain('a2x');
      expect(host.expanded()).toContain('a2');
    });
  });

  describe('5d — right-clicking a row that cannot be selected', () => {
    it('targets that row alone and leaves the selection untouched', async () => {
      host.selected.set(['b']);
      await fixture.whenStable();

      rowEl('blocked')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );

      expect(host.contexts).toHaveLength(1);
      expect(host.contexts[0].ids).toEqual(['blocked']);
      expect(host.selected()).toEqual(['b']);
    });
  });

  describe('8 — rename', () => {
    it('edit() reveals an off-screen row so its input actually mounts', async () => {
      const scrollToIndex = vi.spyOn(viewport(), 'scrollToIndex');
      const last = host.data().at(-1)!;
      host.tree().edit(last);

      // Everything collapsed: the flat index IS the root index.
      expect(scrollToIndex).toHaveBeenCalledWith(host.data().length - 1);
    });

    it('byKey.edit for a key inserted in the same tick starts editing once it renders', async () => {
      host.data.update((data) => [{ id: 'new', name: 'Untitled' }, ...data]);
      host.tree().byKey.edit('new'); // the input binding hasn't re-read dataSource yet
      await fixture.whenStable();

      expect(rowEl('new')!.querySelector('input[treeNodeEditInput]')).toBeTruthy();
    });

    it('byKey.edit for a key that never appears expires after one render', async () => {
      host.tree().byKey.edit('ghost');
      await fixture.whenStable();
      host.data.update((data) => [{ id: 'ghost', name: 'Late' }, ...data]);
      await fixture.whenStable();

      expect(rowEl('ghost')!.querySelector('input')).toBeNull();
    });

    it('clicks and double-clicks inside the rename input never reach the row', async () => {
      host.clickAction.set('select');
      host.tree().byKey.edit('b');
      await fixture.whenStable();
      const input = rowEl('b')!.querySelector<HTMLInputElement>('input')!;

      input.click();
      input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(host.selected()).toEqual([]); // no replace-select from a caret click
      expect(host.activations).toEqual([]); // no activation from a word select
    });

    it('the row is not draggable while renaming', async () => {
      expect(rowEl('b')!.classList).not.toContain('cdk-drag-disabled');
      host.tree().byKey.edit('b');
      await fixture.whenStable();
      expect(rowEl('b')!.classList).toContain('cdk-drag-disabled');
    });
  });
});
