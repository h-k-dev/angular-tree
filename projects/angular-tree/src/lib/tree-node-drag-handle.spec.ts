import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import { TreeNodeDragHandle } from './tree-node-drag-handle';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
}

const DATA: DemoNode[] = [
  { id: 'a', name: 'Alpha', children: [{ id: 'a1', name: 'Alpha One' }] },
  { id: 'b', name: 'Beta' },
];

@Component({
  imports: [AngularTree, TreeNodeDef, TreeNodeDragHandle],
  template: `
    <angular-tree [dataSource]="data" [childrenAccessor]="children" [expansionKey]="key">
      <ng-template treeNodeDef let-node>
        <span treeNodeDragHandle class="grip">::</span>
        {{ node.name }}
      </ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('TreeNodeDragHandle', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('registers as the row CDK drag handle, out of the tab order', () => {
    const grip = fixture.nativeElement.querySelector('.grip') as HTMLElement;
    expect(grip).toBeTruthy();
    expect(grip.tabIndex).toBe(-1); // APG: treeitem content is not a tab stop
    expect(grip.hasAttribute('data-tree-drag-handle')).toBe(true);
    // CDK's handle class proves registration with the row's CdkDrag —
    // presses elsewhere on the row no longer start a drag.
    expect(grip.classList.contains('cdk-drag-handle')).toBe(true);
  });
});
