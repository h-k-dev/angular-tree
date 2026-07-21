import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import { TREE_NODE } from './types';
import type { SelectEvent } from './events';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
}

const DATA: DemoNode[] = [
  {
    id: 'a',
    name: 'A',
    children: [
      { id: 'a1', name: 'A1' },
      { id: 'a2', name: 'A2' },
    ],
  },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C' },
];

/** Controlled selection host — the signal-first pattern (Phase 15). */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [(selectedKeys)]="selected"
      [multi]="true"
      (selectionChange)="events.push($event)"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class ControlledHost {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  selected = signal<readonly string[]>([]);
  events: SelectEvent<DemoNode>[] = [];
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree controlled selection (selectedKeys)', () => {
  let fixture: ComponentFixture<ControlledHost>;
  let host: ControlledHost;
  let tree: AngularTree<DemoNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ControlledHost],
    }).compileComponents();

    fixture = TestBed.createComponent(ControlledHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();
  });

  it('an external set selects the named rows without emitting selectionChange', async () => {
    host.selected.set(['b']);
    await fixture.whenStable();

    expect(tree.selectionActive()).toBe(true);
    const b = tree.visibleRows().find((row) => row.key === 'b')!;
    expect(b.context.isSelected).toBe(true);
    expect(host.events).toHaveLength(0);
  });

  it('an external clear empties the selection', async () => {
    host.selected.set(['b', 'c']);
    await fixture.whenStable();
    expect(tree.selectionActive()).toBe(true);

    host.selected.set([]);
    await fixture.whenStable();
    expect(tree.selectionActive()).toBe(false);
  });

  it('a tree interaction writes back into the two-way binding and emits selectionChange', async () => {
    const handle = tree
      .visibleRows()
      .find((row) => row.key === 'b')!
      .injector.get(TREE_NODE);

    handle.toggleSelection();
    await fixture.whenStable();

    expect([...host.selected()]).toEqual(['b']);
    expect(host.events.at(-1)?.ids).toEqual(['b']);
    // Checkbox / handle toggles are pointer-origin (keyboard Space uses the key map).
    expect(host.events.at(-1)?.cause).toBe('pointer');
  });

  it('writing the emitted value back does not re-emit or loop', async () => {
    const handle = tree
      .visibleRows()
      .find((row) => row.key === 'b')!
      .injector.get(TREE_NODE);
    handle.toggleSelection();
    await fixture.whenStable();
    const emissions = host.events.length;

    // The strictly controlled shape: consumer echoes the emission back in.
    host.selected.set(['b']);
    await fixture.whenStable();

    expect(host.events.length).toBe(emissions);
    expect(
      tree.visibleRows().find((row) => row.key === 'b')!.context.isSelected,
    ).toBe(true);
  });
});
