import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';

interface DemoNode {
  id: string;
  name: string;
  color?: string;
  children?: DemoNode[];
}

const DATA: DemoNode[] = [
  {
    id: 'a',
    name: 'A',
    color: 'rgb(255, 0, 0)',
    children: [
      { id: 'a1', name: 'A1' },
      { id: 'a2', name: 'A2' },
    ],
  },
  { id: 'b', name: 'B' },
];

/** The PrimeNG parity case: per-node thread-line tint via a rowStyle accessor. */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      style="height: 400px"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [defaultExpandedKeys]="['a']"
      [indentGuides]="true"
      [rowClass]="rowClass"
      [rowStyle]="rowStyle"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  rowClass = (node: DemoNode) =>
    node.children ? ['is-branch', 'has-kids'] : 'is-leaf';
  rowStyle = (node: DemoNode) =>
    node.color ? { '--tree-guide': node.color } : undefined;
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree rowClass / rowStyle', () => {
  let fixture: ComponentFixture<Host>;

  const rowEl = (key: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);

  /** jsdom has no layout — fake the viewport size so cdkVirtualFor renders rows. */
  async function forceViewportSize() {
    const element: HTMLElement = fixture.nativeElement.querySelector(
      'cdk-virtual-scroll-viewport',
    );
    Object.defineProperty(element, 'clientHeight', {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(element, 'clientWidth', {
      value: 400,
      configurable: true,
    });
    element.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 400,
        bottom: 400,
        width: 400,
        height: 400,
        x: 0,
        y: 0,
      }) as DOMRect;

    fixture.debugElement
      .query(By.directive(CdkVirtualScrollViewport))
      .injector.get(CdkVirtualScrollViewport)
      .checkViewportSize();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    await forceViewportSize();
  });

  it('rowClass lands on the row element without displacing tree classes', () => {
    expect(rowEl('a').classList.contains('tree-node')).toBe(true);
    expect(rowEl('a').classList.contains('is-branch')).toBe(true);
    expect(rowEl('a').classList.contains('has-kids')).toBe(true);
    expect(rowEl('b').classList.contains('is-leaf')).toBe(true);
    expect(rowEl('a1').classList.contains('is-leaf')).toBe(true);
  });

  it('rowStyle lands on the row element; tree-owned height/level bindings win', () => {
    expect(rowEl('a').style.getPropertyValue('--tree-guide')).toBe(
      'rgb(255, 0, 0)',
    );
    expect(rowEl('a1').style.getPropertyValue('--tree-guide')).toBe('');
    // The fixed-row contract survives any consumer style map.
    expect(rowEl('a').style.height).toBe('32px');
  });

  it("a guide overlay carries its GROUP PARENT's rowStyle (guides are row siblings)", () => {
    const guide: HTMLElement =
      fixture.nativeElement.querySelector('.tree-guide');
    expect(guide).toBeTruthy();
    expect(guide.style.getPropertyValue('--tree-guide')).toBe('rgb(255, 0, 0)');
    // Tree-owned geometry bindings still win over the consumer map.
    expect(guide.style.top).not.toBe('');
  });
});
