import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
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
];

/** The "active row / preview pane" consumer the trigger field exists for. */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [multi]="true"
      [clickAction]="'select'"
      [defaultExpandedKeys]="['a']"
      (selectionChange)="events.push($event)"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  events: SelectEvent<DemoNode>[] = [];
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree SelectEvent trigger + deltas', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const rowEl = (key: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);
  const click = (key: string, init: MouseEventInit = {}) =>
    rowEl(key).dispatchEvent(
      new MouseEvent('click', { bubbles: true, ...init }),
    );
  const keydown = (key: string, init: KeyboardEventInit = {}) =>
    fixture.nativeElement
      .querySelector('cdk-virtual-scroll-viewport')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, ...init }),
      );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('a click identifies the row and reports the deltas', () => {
    click('b');
    expect(host.events).toEqual([
      expect.objectContaining({
        ids: ['b'],
        trigger: DATA[1],
        added: ['b'],
        removed: [],
      }),
    ]);

    click('a1'); // replace: b leaves, a1 enters
    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        trigger: DATA[0].children![0],
        added: ['a1'],
        removed: ['b'],
      }),
    );
  });

  it('re-clicking the already selected row still emits, with empty deltas (the preview-pane contract)', () => {
    click('b');
    click('b');

    expect(host.events).toHaveLength(2);
    expect(host.events[1]).toEqual(
      expect.objectContaining({
        ids: ['b'],
        trigger: DATA[1],
        added: [],
        removed: [],
      }),
    );
  });

  it('Ctrl-click toggle off reports the row in removed', () => {
    click('b', { ctrlKey: true });
    click('b', { ctrlKey: true });

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({ trigger: DATA[1], added: [], removed: ['b'] }),
    );
  });

  it('set-level operations carry no trigger (Ctrl+A, Escape clear)', () => {
    keydown('a', { ctrlKey: true });
    expect(host.events.at(-1)!.trigger).toBeUndefined();
    expect(new Set(host.events.at(-1)!.added)).toEqual(
      new Set(['a', 'a1', 'a2', 'b']),
    );

    keydown('Escape');
    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({ ids: [], trigger: undefined, added: [] }),
    );
    expect(new Set(host.events.at(-1)!.removed)).toEqual(
      new Set(['a', 'a1', 'a2', 'b']),
    );
  });

  it('a shift-click range reports the row the gesture ended on', () => {
    click('a1'); // anchor
    click('b', { shiftKey: true }); // range a1..b, additive

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({ trigger: DATA[1] }),
    );
    expect(new Set(host.events.at(-1)!.added)).toEqual(new Set(['a2', 'b']));
  });
});
