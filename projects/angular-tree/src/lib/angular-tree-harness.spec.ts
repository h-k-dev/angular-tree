import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SelectionModel } from '@angular/cdk/collections';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TreeHarness } from 'angular-tree/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeCheckbox } from './tree-node-checkbox';
import { TreeNodeDef } from './tree-node-def';
import { TreeNodeToggle } from './tree-node-toggle';
import type { MoveEvent } from './events';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
}

const DATA: DemoNode[] = [
  {
    id: 'a',
    name: 'Alpha',
    children: [
      { id: 'a1', name: 'Alpha One' },
      { id: 'a2', name: 'Alpha Two', children: [{ id: 'a2x', name: 'Deep' }] },
    ],
  },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
];

/** Consumer-shaped host: toggle + checkbox come from the template, as designed. */
@Component({
  imports: [AngularTree, TreeNodeDef, TreeNodeToggle, TreeNodeCheckbox],
  template: `
    <angular-tree
      style="height: 400px"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [selection]="selection"
      [multi]="true"
      [checkboxSelection]="true"
      [typeaheadText]="text"
      (moved)="moves.push($event)"
      (activated)="activations.push($event)"
    >
      <ng-template treeNodeDef let-node let-expandable="expandable">
        @if (expandable) {
          <button treeNodeToggle aria-label="toggle"></button>
        }
        <input type="checkbox" treeNodeCheckbox aria-label="select" />
        <span>{{ node.name }}</span>
      </ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  selection = new SelectionModel<string>(true);
  text = (node: DemoNode) => node.name;
  moves: MoveEvent<DemoNode>[] = [];
  activations: DemoNode[] = [];
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('TreeHarness', () => {
  let fixture: ComponentFixture<Host>;
  let loader: HarnessLoader;
  let tree: TreeHarness;

  /** jsdom has no layout — fake the viewport size so cdkVirtualFor renders rows. */
  async function forceViewportSize() {
    const element: HTMLElement = fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
    Object.defineProperty(element, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(element, 'clientWidth', { value: 400, configurable: true });
    element.getBoundingClientRect = () =>
      ({ top: 0, left: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0 }) as DOMRect;

    fixture.debugElement
      .query(By.directive(CdkVirtualScrollViewport))
      .injector.get(CdkVirtualScrollViewport)
      .checkViewportSize();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    await forceViewportSize();

    loader = TestbedHarnessEnvironment.loader(fixture);
    tree = await loader.getHarness(TreeHarness);
  });

  it('finds the tree and lists rendered roots in order', async () => {
    expect(await tree.getVisibleTexts()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('expandNode reveals children; collapseNode hides them again', async () => {
    await tree.expandNode({ text: 'Alpha' });
    expect(await tree.getVisibleTexts()).toEqual(['Alpha', 'Alpha One', 'Alpha Two', 'Beta', 'Gamma']);

    await tree.collapseNode({ text: 'Alpha' });
    expect(await tree.getVisibleTexts()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('expand/collapse are idempotent no-ops at their end states', async () => {
    await tree.collapseNode({ text: 'Alpha' }); // already collapsed
    await tree.expandNode({ text: 'Beta' }); // leaf: not expandable
    expect(await tree.getVisibleTexts()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('filters nodes by key, level, text regex, and expansion state', async () => {
    await tree.expandNode({ key: 'a' });

    const byKey = await tree.getNode({ key: 'a2' });
    expect(await byKey.getText()).toBe('Alpha Two');
    expect(await byKey.getLevel()).toBe(1);
    expect(await byKey.isExpandable()).toBe(true);

    const roots = await tree.getVisibleNodes({ level: 0 });
    expect(roots.length).toBe(3);

    const expanded = await tree.getVisibleNodes({ expanded: true });
    expect(await Promise.all(expanded.map((node) => node.getKey()))).toEqual(['a']);

    expect(await (await tree.getNode({ text: /alpha one/i })).getKey()).toBe('a1');
  });

  it('toggleSelection drives cascade + tri-state, visible through the harness', async () => {
    await tree.expandNode({ key: 'a' });
    await (await tree.getNode({ key: 'a1' })).toggleSelection();

    expect(await (await tree.getNode({ key: 'a1' })).isSelected()).toBe(true);
    expect(await (await tree.getNode({ key: 'a1' })).getCheckState()).toBe('checked');
    // One of two children selected → parent folds to indeterminate.
    expect(await (await tree.getNode({ key: 'a' })).getCheckState()).toBe('indeterminate');
    expect(await tree.getVisibleNodes({ selected: true })).toHaveLength(1);
  });

  it('activate clicks the row without touching selection (Gmail semantics)', async () => {
    await (await tree.getNode({ text: 'Beta' })).activate();
    expect(fixture.componentInstance.activations.map((node) => node.id)).toEqual(['b']);
    expect(fixture.componentInstance.selection.isEmpty()).toBe(true);
  });

  it('dragTo inside a folder emits the moved intent with that parent', async () => {
    await tree.dragTo({ text: 'Beta' }, { text: 'Alpha' }, 'inside');

    expect(fixture.componentInstance.moves).toEqual([
      {
        dragIds: ['b'],
        dragNodes: [DATA[1]],
        parentId: 'a',
        parentNode: DATA[0],
        index: 2,
        dropEffect: 'move',
      },
    ]);
  });

  it('dragTo after a row emits a root-level moved intent', async () => {
    await tree.dragTo({ text: 'Beta' }, { text: 'Gamma' }, 'after');

    expect(fixture.componentInstance.moves).toEqual([
      {
        dragIds: ['b'],
        dragNodes: [DATA[1]],
        parentId: null,
        parentNode: null,
        index: 3,
        dropEffect: 'move',
      },
    ]);
  });

  it('dragTo respects the descendant guard: no moved intent into your own subtree', async () => {
    await tree.expandNode({ key: 'a' });
    await tree.dragTo({ key: 'a' }, { key: 'a1' }, 'inside');

    expect(fixture.componentInstance.moves).toEqual([]);
  });
});
