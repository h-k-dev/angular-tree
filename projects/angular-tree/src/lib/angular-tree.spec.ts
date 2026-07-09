import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Directionality } from '@angular/cdk/bidi';
import { SelectionModel } from '@angular/cdk/collections';
import { Subject } from 'rxjs';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import { TREE_NODE } from './types';
import type { LoadChildrenEvent, MoveEvent, ToggleEvent } from './events';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
  lazy?: boolean;
}

const DATA: DemoNode[] = [
  {
    id: 'a',
    name: 'A',
    children: [
      { id: 'a1', name: 'A1' },
      { id: 'a2', name: 'A2', children: [{ id: 'a2x', name: 'A2X' }] },
    ],
  },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C lazy', lazy: true },
];

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

/** The tree requires at least one def — mount it the way a consumer would. */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [selection]="selection"
      [multi]="true"
      [checkboxSelection]="true"
      [searchTerm]="term()"
      [searchMatch]="match"
      [typeaheadText]="text"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  /** Lazy nodes resolve through a swappable resolver so tests control timing. */
  lazyResolver: () => Promise<DemoNode[]> = () => Promise.resolve([{ id: 'c1', name: 'C1' }]);
  children = (node: DemoNode) => (node.lazy ? this.lazyResolver() : node.children);
  key = (node: DemoNode) => node.id;
  selection = new SelectionModel<string>(true);
  term = signal('');
  match = (node: DemoNode, term: string) => node.name.toLowerCase().includes(term.toLowerCase());
  text = (node: DemoNode) => node.name;
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree', () => {
  let fixture: ComponentFixture<Host>;
  let tree: AngularTree<DemoNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();

    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    tree = fixture.componentInstance.tree();
  });

  it('should create', () => {
    expect(tree).toBeTruthy();
  });

  it('renders only roots while collapsed', () => {
    expect(tree.visibleRows().map((row) => row.key)).toEqual(['a', 'b', 'c']);
  });

  it('expand reveals children; collapse hides them', () => {
    tree.expand(DATA[0]);
    expect(tree.visibleRows().map((row) => row.key)).toEqual(['a', 'a1', 'a2', 'b', 'c']);

    tree.collapse(DATA[0]);
    expect(tree.visibleRows().map((row) => row.key)).toEqual(['a', 'b', 'c']);
  });

  it('expandAll / collapseAll walk the full data set', () => {
    tree.expandAll();
    expect(tree.visibleRows().length).toBe(6);

    tree.collapseAll();
    expect(tree.visibleRows().length).toBe(3);
  });

  it('reports aria set positions from the flat model', () => {
    tree.expandAll();
    const a2 = tree.visibleRows().find((row) => row.key === 'a2');
    expect(a2?.setSize).toBe(2);
    expect(a2?.posInSet).toBe(2);
    expect(a2?.level).toBe(1);
  });

  it('bridges the SelectionModel into reactive tree state', () => {
    const { selection } = fixture.componentInstance;
    expect(tree.selectionActive()).toBe(false);

    selection.select('a1');
    expect(tree.selectionActive()).toBe(true);

    tree.expand(DATA[0]);
    const a1 = tree.visibleRows().find((row) => row.key === 'a1')!;
    expect(a1.context.isSelected).toBe(true);
  });

  it('checkbox toggle cascades over the loaded subtree via the row handle', () => {
    const { selection } = fixture.componentInstance;
    const handle = tree
      .visibleRows()
      .find((row) => row.key === 'a')!
      .injector.get(TREE_NODE);

    handle.toggleSelection();
    expect(new Set(selection.selected)).toEqual(new Set(['a', 'a1', 'a2', 'a2x']));
    expect(handle.checkState()).toBe('checked');

    selection.deselect('a2x'); // external model write flows back in
    expect(handle.checkState()).toBe('indeterminate');

    handle.toggleSelection(); // indeterminate → select the whole subtree again
    expect(handle.checkState()).toBe('checked');
  });

  it('filters rows while searching and restores expansion after', async () => {
    const host = fixture.componentInstance;

    host.term.set('a2x');
    await fixture.whenStable();
    expect(tree.visibleRows().map((row) => row.key)).toEqual(['a', 'a2', 'a2x']);

    host.term.set('');
    await fixture.whenStable();
    expect(tree.visibleRows().map((row) => row.key)).toEqual(['a', 'b', 'c']);
  });

  it('emits the toggled intent once per state change', () => {
    const events: ToggleEvent<DemoNode>[] = [];
    tree.toggled.subscribe((event) => events.push(event));

    tree.expand(DATA[0]);
    tree.expand(DATA[0]); // no-op: already expanded
    tree.collapse(DATA[0]);

    expect(events).toEqual([
      { id: 'a', node: DATA[0], expanded: true },
      { id: 'a', node: DATA[0], expanded: false },
    ]);
  });

  describe('keyboard', () => {
    function keydown(key: string, init: KeyboardEventInit = {}) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport')!.dispatchEvent(event);
      return event;
    }

    const tabIndexes = () => Object.fromEntries(tree.visibleRows().map((row) => [row.key, row.tabIndex()]));

    it('starts with the first row as the roving tab stop', () => {
      expect(tabIndexes()).toEqual({ a: 0, b: -1, c: -1 });
    });

    it('ArrowDown / ArrowUp move focus through the visible flat array', () => {
      keydown('ArrowDown');
      expect(tabIndexes()['b']).toBe(0);
      keydown('ArrowUp');
      expect(tabIndexes()['a']).toBe(0);
    });

    it('ArrowRight expands, then dives into the first child', () => {
      keydown('ArrowRight');
      expect(tree.isExpanded(DATA[0])).toBe(true);
      keydown('ArrowRight');
      expect(tabIndexes()['a1']).toBe(0);
    });

    it('ArrowLeft climbs to the parent from a leaf, collapses from an expanded node', () => {
      tree.expand(DATA[0]);
      keydown('ArrowDown'); // a1
      keydown('ArrowLeft'); // leaf → parent
      expect(tabIndexes()['a']).toBe(0);
      keydown('ArrowLeft'); // expanded parent → collapse
      expect(tree.isExpanded(DATA[0])).toBe(false);
    });

    it('Home and End jump across the whole visible array', () => {
      keydown('End');
      expect(tabIndexes()['c']).toBe(0);
      keydown('Home');
      expect(tabIndexes()['a']).toBe(0);
    });

    it('Enter activates the focused row', () => {
      const activated: DemoNode[] = [];
      tree.activated.subscribe((node) => activated.push(node));
      keydown('Enter');
      expect(activated).toEqual([DATA[0]]);
    });

    it('F2 is NOT built in — rename has no shipped gesture, edit() is the wiring point', () => {
      keydown('F2');
      expect(tree.visibleRows().find((r) => r.key === 'a')!.context.isEditing).toBe(false);
      tree.edit(DATA[0]);
      expect(tree.visibleRows().find((r) => r.key === 'a')!.context.isEditing).toBe(true);
    });

    it('Space toggles selection with cascade semantics', () => {
      keydown(' ');
      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(new Set(['a', 'a1', 'a2', 'a2x']));
    });

    it('Shift+Space range-selects from the anchor over visible order (APG optional)', () => {
      keydown(' '); // anchor on 'a' (selects a + cascade)
      keydown('ArrowDown');
      keydown('ArrowDown'); // focus 'c'
      keydown(' ', { shiftKey: true });
      const selected = new Set(fixture.componentInstance.selection.selected);
      expect(selected.has('b')).toBe(true);
      expect(selected.has('c')).toBe(true);
    });

    it('Ctrl+A selects all visible rows; Ctrl+A again clears (APG optional)', () => {
      keydown('a', { ctrlKey: true });
      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(new Set(['a', 'b', 'c']));
      keydown('a', { ctrlKey: true });
      expect(fixture.componentInstance.selection.selected).toEqual([]);
    });

    it('Ctrl+Shift+End selects to the last node and moves focus there (APG optional)', () => {
      keydown('End', { ctrlKey: true, shiftKey: true });
      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(new Set(['a', 'b', 'c']));
      expect(tabIndexes()['c']).toBe(0);
    });

    it('Ctrl+Shift+Home selects to the first node and moves focus there (APG optional)', () => {
      keydown('End'); // focus 'c' first
      keydown('Home', { ctrlKey: true, shiftKey: true });
      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(new Set(['a', 'b', 'c']));
      expect(tabIndexes()['a']).toBe(0);
    });

    it('tab target falls back to the first selected row before focus ever moves (APG)', async () => {
      fixture.componentInstance.selection.select('b');
      await fixture.whenStable();
      expect(tabIndexes()).toEqual({ a: -1, b: 0, c: -1 });
    });

    it('Escape clears the selection but never focus, and announces the clear', async () => {
      keydown(' '); // select 'a' (+ cascade), focus on 'a'
      expect(fixture.componentInstance.selection.selected.length).toBeGreaterThan(0);

      const escape = keydown('Escape');
      expect(fixture.componentInstance.selection.selected).toEqual([]);
      expect(escape.defaultPrevented).toBe(true);
      expect(tabIndexes()['a']).toBe(0); // focus stays put — clear, not defocus

      // Mass deselects are visually loud but aurally silent without this.
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(document.querySelector('.cdk-live-announcer-element')?.textContent).toBe('Selection cleared');
    });

    it('Escape ladder: cancels a move-mark first, clears selection second, then bubbles', () => {
      keydown(' ');
      keydown('x', { ctrlKey: true }); // mark a move

      keydown('Escape'); // layer 1: unmark, selection intact
      expect(fixture.componentInstance.selection.selected.length).toBeGreaterThan(0);

      keydown('Escape'); // layer 2: clear selection
      expect(fixture.componentInstance.selection.selected).toEqual([]);

      // Nothing left to consume — the event must reach enclosing dialogs.
      expect(keydown('Escape').defaultPrevented).toBe(false);
    });

    it('keyboard move: Ctrl+X marks the focused row, Ctrl+V drops into a folder', () => {
      const moves: MoveEvent<DemoNode>[] = [];
      tree.moved.subscribe((event) => moves.push(event));

      // focus is on 'a' by default; mark it, then drop into... itself is
      // guarded, so move 'b' instead: focus b first.
      keydown('ArrowDown'); // b
      keydown('ArrowDown'); // c — back up to b to keep it deliberate
      keydown('ArrowUp'); // b
      fixture.nativeElement
        .querySelector('cdk-virtual-scroll-viewport')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }));
      expect(
        tree
          .visibleRows()
          .find((r) => r.key === 'b')!
          .moveSource(),
      ).toBe(true);

      keydown('Home'); // a
      fixture.nativeElement
        .querySelector('cdk-virtual-scroll-viewport')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));

      expect(moves).toEqual([
        {
          dragIds: ['b'],
          dragNodes: [DATA[1]],
          parentId: 'a',
          parentNode: DATA[0],
          index: 2,
          dropEffect: 'move',
        },
      ]);
      expect(
        tree
          .visibleRows()
          .find((r) => r.key === 'b')!
          .moveSource(),
      ).toBe(false);
    });

    it('keyboard move respects guards and Escape clears the mark', () => {
      const moves: MoveEvent<DemoNode>[] = [];
      tree.moved.subscribe((event) => moves.push(event));
      const viewport = fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport')!;

      // Mark 'a', try to drop into its own descendant → guarded no-op.
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }));
      tree.expand(DATA[0]);
      keydown('ArrowDown'); // a1... drop after a1 would be inside parent a — guarded
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(moves).toEqual([]);

      keydown('Escape');
      keydown('End'); // c
      viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(moves).toEqual([]); // mark was cleared — nothing to drop
    });

    it('type-ahead prefix-matches typeaheadText, wrapping past the end', () => {
      vi.useFakeTimers();
      try {
        keydown('b');
        expect(tabIndexes()['b']).toBe(0);

        vi.advanceTimersByTime(600); // buffer expires
        keydown('a'); // from b: candidates c, then wraps to a
        expect(tabIndexes()['a']).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('lazy loading', () => {
    it('shows isLoading while resolving, then reveals children and emits childrenLoaded', async () => {
      const events: LoadChildrenEvent<DemoNode>[] = [];
      tree.childrenLoaded.subscribe((event) => events.push(event));

      tree.expand(DATA[2]);
      const row = tree.visibleRows().find((r) => r.key === 'c')!;
      expect(row.context.isLoading).toBe(true);

      await flushMicrotasks();
      expect(tree.visibleRows().map((r) => r.key)).toContain('c1');
      expect(tree.visibleRows().find((r) => r.key === 'c')!.context.isLoading).toBe(false);
      expect(events).toEqual([{ id: 'c', node: DATA[2], status: 'loaded' }]);
    });

    it('exposes hasError on rejection; retryChildren recovers', async () => {
      // Fresh fixture: the resolver must fail *before* the first render —
      // accessor results are memoized per node (no repeat fetches by design).
      const failFixture = TestBed.createComponent(Host);
      const host = failFixture.componentInstance;
      host.lazyResolver = () => Promise.reject(new Error('offline'));
      await failFixture.whenStable();
      const failTree = host.tree();

      failTree.expand(DATA[2]);
      await flushMicrotasks();
      expect(failTree.visibleRows().find((r) => r.key === 'c')!.context.hasError).toBe(true);
      expect(failTree.visibleRows().find((r) => r.key === 'c')!.context.isLoading).toBe(false);

      host.lazyResolver = () => Promise.resolve([{ id: 'c1', name: 'C1' }]);
      failTree.retryChildren(DATA[2]);
      await flushMicrotasks();
      expect(failTree.visibleRows().map((r) => r.key)).toContain('c1');
      expect(failTree.visibleRows().find((r) => r.key === 'c')!.context.hasError).toBe(false);
    });
  });
});

describe('AngularTree (RTL)', () => {
  it('flips ArrowLeft to expand via Directionality', async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: Directionality, useValue: { value: 'rtl', change: new Subject() } }],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const tree = fixture.componentInstance.tree();

    fixture.nativeElement
      .querySelector('cdk-virtual-scroll-viewport')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(tree.isExpanded(DATA[0])).toBe(true);
  });
});
