import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectionModel } from '@angular/cdk/collections';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
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
      { id: 'a2', name: 'Alpha Two' },
    ],
  },
  { id: 'b', name: 'Beta' },
];

@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [selection]="selection"
      [multi]="true"
      [clickAction]="clickAction()"
      (activated)="activations.push($event)"
      (moved)="moves.push($event)"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  selection = new SelectionModel<string>(true);
  clickAction = signal<'activate' | 'select'>('activate');
  activations: DemoNode[] = [];
  moves: MoveEvent<DemoNode>[] = [];
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree v2 — clickAction & copy dropEffect', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const rowEl = (key: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);
  const viewport = (): HTMLElement =>
    fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
  const keydown = (init: KeyboardEventInit, target?: HTMLElement) =>
    (target ?? viewport()).dispatchEvent(
      new KeyboardEvent('keydown', { ...init, bubbles: true }),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  describe("clickAction 'activate' (default — v1 lock intact)", () => {
    it('plain click activates and never mutates selection', () => {
      rowEl('b').click();
      expect(host.activations.map((node) => node.id)).toEqual(['b']);
      expect(host.selection.selected).toEqual([]);
    });
  });

  describe("clickAction 'select' (file-manager opt-in)", () => {
    beforeEach(async () => {
      host.clickAction.set('select');
      await fixture.whenStable();
    });

    it('plain click replaces the selection and does not activate', () => {
      rowEl('a').click();
      expect(host.selection.selected).toEqual(['a']);

      rowEl('b').click();
      expect(host.selection.selected).toEqual(['b']); // replace, not add
      expect(host.activations).toEqual([]);
    });

    it('double-click activates', () => {
      rowEl('b').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(host.activations.map((node) => node.id)).toEqual(['b']);
    });

    it('Ctrl/Cmd-click still toggles — power shortcuts identical in both modes', () => {
      rowEl('a').dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      );
      rowEl('b').dispatchEvent(
        new MouseEvent('click', { bubbles: true, ctrlKey: true }),
      );
      expect([...host.selection.selected].sort()).toEqual(['a', 'b']); // additive, unlike plain
    });
  });

  describe('copy dropEffect (keyboard path)', () => {
    it('Ctrl+C arms a copy — paste emits dropEffect "copy" and sources stay marked semantics', () => {
      rowEl('b').focus();
      keydown({ key: 'c', ctrlKey: true }, rowEl('b'));
      keydown({ key: 'Home' });
      keydown({ key: 'v', ctrlKey: true }, rowEl('a'));

      expect(host.moves).toHaveLength(1);
      expect(host.moves[0].dropEffect).toBe('copy');
      expect(host.moves[0].dragIds).toEqual(['b']);
      expect(host.moves[0].parentId).toBe('a');
    });

    it('Ctrl+X keeps emitting dropEffect "move"', () => {
      rowEl('b').focus();
      keydown({ key: 'x', ctrlKey: true }, rowEl('b'));
      keydown({ key: 'Home' });
      keydown({ key: 'v', ctrlKey: true }, rowEl('a'));

      expect(host.moves).toHaveLength(1);
      expect(host.moves[0].dropEffect).toBe('move');
    });
  });
});
