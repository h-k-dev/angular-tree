import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';

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

/** The consumer who stores keys (`parentKey` strings), not node objects. */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [disableEdit]="noEdit"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  noEdit = (node: DemoNode) => node.id === 'b';
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree byKey facade', () => {
  let fixture: ComponentFixture<Host>;
  let tree: AngularTree<DemoNode>;

  const visibleKeys = () => tree.visibleRows().map((row) => row.key);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    tree = fixture.componentInstance.tree();
  });

  it('expand / collapse / toggle address rows by key', () => {
    tree.byKey.expand('a');
    expect(visibleKeys()).toEqual(['a', 'a1', 'a2', 'b']);
    expect(tree.byKey.isExpanded('a')).toBe(true);

    tree.byKey.toggle('a2');
    expect(visibleKeys()).toContain('a2x');

    tree.byKey.collapse('a');
    expect(visibleKeys()).toEqual(['a', 'b']);
    // Collapsed away, but its own expansion state survives (like nodes).
    expect(tree.byKey.isExpanded('a2')).toBe(true);
  });

  it('unknown keys are a no-op, never a throw', () => {
    expect(() => {
      tree.byKey.expand('nope');
      tree.byKey.edit('nope');
      tree.byKey.focus('nope');
      tree.byKey.scrollTo('nope');
      tree.byKey.invalidateChildren('nope');
    }).not.toThrow();
    expect(visibleKeys()).toEqual(['a', 'b']);
    expect(tree.byKey.isExpanded('nope')).toBe(false);
  });

  it('edit respects the same guards as the node-addressed form', () => {
    tree.byKey.edit('b'); // disableEdit says no
    expect(
      tree.visibleRows().find((row) => row.key === 'b')!.context.isEditing,
    ).toBe(false);

    tree.byKey.edit('a');
    expect(
      tree.visibleRows().find((row) => row.key === 'a')!.context.isEditing,
    ).toBe(true);
  });

  it('expandDescendants walks the loaded subtree from a key', () => {
    tree.byKey.expandDescendants('a');
    expect(visibleKeys()).toEqual(['a', 'a1', 'a2', 'a2x', 'b']);
  });
});
