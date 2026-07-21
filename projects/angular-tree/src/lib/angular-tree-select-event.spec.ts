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

/** The "active row / preview pane" consumer the trigger + cause fields exist for. */
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

describe('AngularTree SelectEvent trigger + cause + deltas', () => {
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
  const contextmenu = (key: string) =>
    rowEl(key).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('a click identifies the row, reports pointer cause, and reports the deltas', () => {
    click('b');
    expect(host.events).toEqual([
      expect.objectContaining({
        ids: ['b'],
        trigger: DATA[1],
        cause: 'pointer',
        added: ['b'],
        removed: [],
      }),
    ]);

    click('a1'); // replace: b leaves, a1 enters
    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        trigger: DATA[0].children![0],
        cause: 'pointer',
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
        cause: 'pointer',
        added: [],
        removed: [],
      }),
    );
  });

  it('Ctrl-click toggle off reports the row in removed with pointer cause', () => {
    click('b', { ctrlKey: true });
    click('b', { ctrlKey: true });

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        trigger: DATA[1],
        cause: 'pointer',
        added: [],
        removed: ['b'],
      }),
    );
  });

  it('a shift-click range reports the end row and pointer cause', () => {
    click('a1'); // anchor
    click('b', { shiftKey: true }); // range a1..b, additive

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({ trigger: DATA[1], cause: 'pointer' }),
    );
    expect(new Set(host.events.at(-1)!.added)).toEqual(new Set(['a2', 'b']));
  });

  it('Space toggle is keyboard-caused', () => {
    click('b'); // focus + select
    keydown(' '); // Space toggles off

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        trigger: DATA[1],
        cause: 'keyboard',
        removed: ['b'],
      }),
    );
  });

  it('set-level operations carry no trigger but still report cause (Ctrl+A, Escape clear)', () => {
    keydown('a', { ctrlKey: true });
    expect(host.events.at(-1)!.trigger).toBeUndefined();
    expect(host.events.at(-1)!.cause).toBe('keyboard');
    expect(new Set(host.events.at(-1)!.added)).toEqual(
      new Set(['a', 'a1', 'a2', 'b']),
    );

    keydown('Escape');
    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        ids: [],
        trigger: undefined,
        cause: 'keyboard',
        added: [],
      }),
    );
    expect(new Set(host.events.at(-1)!.removed)).toEqual(
      new Set(['a', 'a1', 'a2', 'b']),
    );
  });

  it('outside-click clear is pointer-caused with no trigger', () => {
    click('b');
    document.body.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true }),
    );

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        ids: [],
        trigger: undefined,
        cause: 'pointer',
        added: [],
        removed: ['b'],
      }),
    );
  });

  it('right-click reconciliation is contextmenu-caused (preview panes ignore it)', () => {
    click('b');
    contextmenu('a1'); // unselected → replace selection before the menu

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        ids: ['a1'],
        trigger: DATA[0].children![0],
        cause: 'contextmenu',
        added: ['a1'],
        removed: ['b'],
      }),
    );
  });

  it('Shift+F10 reconciliation is also contextmenu (why = menu prep, not the key)', () => {
    click('b');
    // Focus a1 without selecting it — under clickAction 'select', arrow keys
    // move focus without follow-selecting. Home → a, ArrowDown → a1.
    keydown('Home');
    keydown('ArrowDown');
    keydown('F10', { shiftKey: true });

    expect(host.events.at(-1)).toEqual(
      expect.objectContaining({
        ids: ['a1'],
        trigger: DATA[0].children![0],
        cause: 'contextmenu',
      }),
    );
  });
});
