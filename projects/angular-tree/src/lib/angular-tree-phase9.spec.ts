import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectionModel } from '@angular/cdk/collections';

import { AngularTree } from './angular-tree';
import { TreeNodeCheckbox } from './tree-node-checkbox';
import { TreeNodeDef } from './tree-node-def';
import type { TreeAnnouncements } from './events';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
  lazy?: boolean;
}

const DATA: DemoNode[] = [
  {
    id: 'a',
    name: 'Alpha',
    children: [
      { id: 'a1', name: 'Alpha One' },
      { id: 'a2', name: 'Alpha Two' },
    ],
  },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Chain lazy', lazy: true },
];

/** Two-level lazy chain — proves the expandAll frontier loop iterates. */
const LAZY_CHILDREN: Record<string, DemoNode[]> = {
  c: [{ id: 'c1', name: 'Chain One', lazy: true }],
  c1: [{ id: 'c1x', name: 'Chain Deep' }],
};

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

@Component({
  imports: [AngularTree, TreeNodeDef, TreeNodeCheckbox],
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
      [announcements]="announcements()"
    >
      <ng-template treeNodeDef let-node>
        <button treeNodeCheckbox class="check">☐</button>
        {{ node.name }}
      </ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) =>
    node.lazy ? Promise.resolve(LAZY_CHILDREN[node.id] ?? []) : node.children;
  key = (node: DemoNode) => node.id;
  selection = new SelectionModel<string>(true);
  term = signal('');
  match = (node: DemoNode, term: string) =>
    node.name.toLowerCase().includes(term.toLowerCase());
  text = (node: DemoNode) => node.name;
  announcements = signal<TreeAnnouncements<DemoNode> | null | undefined>(
    undefined,
  );
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree v2 — Phase 9 sweep', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let tree: AngularTree<DemoNode>;

  const rowEl = (key: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);
  const checkboxOf = (key: string): HTMLElement =>
    rowEl(key).querySelector('.check')!;
  const keydown = (init: KeyboardEventInit, target: HTMLElement) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );
  /** LiveAnnouncer applies its message after an internal ~100ms defer. */
  const announcerText = async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return (
      document.querySelector('.cdk-live-announcer-element')?.textContent ?? ''
    );
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();
  });

  describe('Shift+checkbox range selection', () => {
    it('shift-click ranges additively from the anchor over visible order', async () => {
      tree.expand(DATA[0]);
      await fixture.whenStable();

      checkboxOf('a1').click(); // anchor
      expect(host.selection.selected).toEqual(['a1']);

      checkboxOf('b').dispatchEvent(
        new MouseEvent('click', { bubbles: true, shiftKey: true }),
      );
      // Visible order a, a1, a2, b, c → range a1..b, additive.
      expect([...host.selection.selected].sort()).toEqual(['a1', 'a2', 'b']);
    });
  });

  describe('PageUp / PageDown', () => {
    it('jumps by viewport pages (single-row clamp in layoutless jsdom)', async () => {
      rowEl('a').click();
      await fixture.whenStable();

      keydown({ key: 'PageDown' }, rowEl('a'));
      await fixture.whenStable();
      expect(rowEl('b').tabIndex).toBe(0);

      keydown({ key: 'PageUp' }, rowEl('b'));
      await fixture.whenStable();
      expect(rowEl('a').tabIndex).toBe(0);
    });
  });

  describe('expandAll over lazy subtrees', () => {
    it('default still skips unloaded lazy nodes (v1 behavior)', async () => {
      tree.expandAll();
      await flushMicrotasks();
      await fixture.whenStable();
      expect(tree.visibleRows().map((row) => row.key)).not.toContain('c1');
    });

    it('loadLazy resolves the frontier in waves until exhausted', async () => {
      tree.expandAll({ loadLazy: true });
      // Two lazy levels → two waves; generous settling for both.
      await flushMicrotasks();
      await fixture.whenStable();
      await flushMicrotasks();
      await fixture.whenStable();

      const keys = tree.visibleRows().map((row) => row.key);
      expect(keys).toContain('c1'); // first wave
      expect(keys).toContain('c1x'); // second wave — the loop iterated
    });
  });

  describe('announcements', () => {
    it('announces keyboard moves with the default message', async () => {
      rowEl('b').click();
      keydown({ key: 'x', ctrlKey: true }, rowEl('b'));
      keydown({ key: 'Home' }, rowEl('b'));
      keydown({ key: 'v', ctrlKey: true }, rowEl('a'));

      expect(await announcerText()).toContain('1 item moved');
    });

    it('announces search result counts and respects overrides', async () => {
      host.announcements.set({
        searchResults: (count, term) => `${count}x ${term}`,
      });
      await fixture.whenStable();
      host.term.set('alpha');
      await fixture.whenStable();

      expect(await announcerText()).toBe('3x alpha');
    });

    it('null silences the tree', async () => {
      host.announcements.set(null);
      await fixture.whenStable();
      host.term.set('beta');
      await fixture.whenStable();

      expect(await announcerText()).toBe('');
    });
  });
});
