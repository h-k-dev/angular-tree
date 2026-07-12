import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import type { ToggleEvent } from './events';

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
      { id: 'a2', name: 'A2', children: [{ id: 'a2x', name: 'A2X' }] },
    ],
  },
  { id: 'b', name: 'B' },
];

/** Controlled expansion host — the signal-first pattern (Phase 15). */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [(expandedKeys)]="expanded"
      [defaultExpandedKeys]="defaults()"
      (toggled)="toggles.push($event)"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class ControlledHost {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  expanded = signal<readonly string[]>([]);
  defaults = signal<readonly string[]>([]);
  toggles: ToggleEvent<DemoNode>[] = [];
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree controlled expansion (expandedKeys)', () => {
  let fixture: ComponentFixture<ControlledHost>;
  let host: ControlledHost;
  let tree: AngularTree<DemoNode>;

  const visibleKeys = () => tree.visibleRows().map((row) => row.key);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ControlledHost],
    }).compileComponents();

    fixture = TestBed.createComponent(ControlledHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();
  });

  it('an external set expands the named groups', async () => {
    host.expanded.set(['a', 'a2']);
    await fixture.whenStable();
    expect(visibleKeys()).toEqual(['a', 'a1', 'a2', 'a2x', 'b']);
  });

  it('an external clear collapses everything', async () => {
    host.expanded.set(['a']);
    await fixture.whenStable();
    expect(visibleKeys()).toContain('a1');

    host.expanded.set([]);
    await fixture.whenStable();
    expect(visibleKeys()).toEqual(['a', 'b']);
  });

  it('a tree toggle writes back into the two-way binding and still emits toggled', async () => {
    tree.expand(DATA[0]);
    await fixture.whenStable();

    expect([...host.expanded()]).toEqual(['a']);
    expect(host.toggles).toEqual([{ id: 'a', node: DATA[0], expanded: true }]);
  });

  it('bulk APIs (expandAll / collapseAll) sync the binding too', async () => {
    tree.expandAll();
    await fixture.whenStable();
    expect(new Set(host.expanded())).toEqual(new Set(['a', 'a2']));

    tree.collapseAll();
    await fixture.whenStable();
    expect(host.expanded()).toEqual([]);
  });

  it('writing the emitted value back does not re-emit or reset', async () => {
    tree.expand(DATA[0]);
    await fixture.whenStable();
    const toggles = host.toggles.length;

    // The strictly controlled shape: consumer echoes the emission back in.
    host.expanded.set(['a']);
    await fixture.whenStable();

    expect(host.toggles.length).toBe(toggles);
    expect(visibleKeys()).toContain('a1'); // still expanded, no churn
  });

  it('defaultExpandedKeys is inert while expandedKeys is bound', async () => {
    host.defaults.set(['a', 'a2']);
    await fixture.whenStable();
    expect(visibleKeys()).toEqual(['a', 'b']); // bound [] wins
  });
});
