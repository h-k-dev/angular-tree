import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkMenuItem } from '@angular/cdk/menu';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AngularTree } from './angular-tree';
import { TreeContextMenu } from './tree-context-menu';
import { TreeNodeDef } from './tree-node-def';
import { TreeNodeEditInput } from './tree-node-edit-input';
import { RenameEvent } from './events';

interface DemoNode {
  kind: 'folder' | 'file';
  id: string;
  name: string;
  children?: DemoNode[];
}

const DATA: DemoNode[] = [
  {
    kind: 'folder',
    id: 'a',
    name: 'Alpha',
    children: [
      { kind: 'file', id: 'a1', name: 'Alpha One' },
      { kind: 'file', id: 'a2', name: 'Alpha Two' },
    ],
  },
  { kind: 'file', id: 'b', name: 'Beta' },
];

/** Consumer shape: items projected via treeContextMenu, branching per kind. */
@Component({
  imports: [
    AngularTree,
    TreeNodeDef,
    TreeContextMenu,
    TreeNodeEditInput,
    CdkMenuItem,
  ],
  template: `
    <angular-tree
      style="height: 400px"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [(selectedKeys)]="selected"
      [multi]="true"
      [defaultExpandedKeys]="['a']"
      (renamed)="renames.push($event)"
    >
      <ng-template treeNodeDef let-node let-isEditing="isEditing">
        @if (isEditing) {
          <input treeNodeEditInput [value]="node.name" />
        } @else {
          {{ node.name }}
        }
      </ng-template>

      <ng-template treeContextMenu let-node let-ids="ids">
        @if (node.kind === 'folder') {
          <button cdkMenuItem class="menu-folder-action">Expand subtree</button>
        } @else {
          <button
            cdkMenuItem
            class="menu-file-action"
            (cdkMenuItemTriggered)="tree().edit(node)"
          >
            Rename
          </button>
        }
        <button cdkMenuItem class="menu-delete">
          Delete ({{ ids.length }})
        </button>
      </ng-template>
    </angular-tree>
  `,
})
class MenuHost {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  selected = signal<readonly string[]>([]);
  renames: RenameEvent<DemoNode>[] = [];
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

/** Control group: no def projected — the tree must stay hands-off. */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      style="height: 400px"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class BareHost {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
}

describe('AngularTree built-in context menu', () => {
  let fixture: ComponentFixture<MenuHost>;

  async function forceViewportSize(hostFixture: ComponentFixture<unknown>) {
    const element: HTMLElement = (
      hostFixture.nativeElement as HTMLElement
    ).querySelector('cdk-virtual-scroll-viewport')!;
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
    hostFixture.debugElement
      .query(By.directive(CdkVirtualScrollViewport))
      .injector.get(CdkVirtualScrollViewport)
      .checkViewportSize();
    await hostFixture.whenStable();
  }

  const rowEl = (key: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);
  const menuEl = (): HTMLElement | null => document.querySelector('.tree-menu');
  const rightClick = (element: HTMLElement) =>
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 40,
      }),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuHost, BareHost],
    }).compileComponents();
    fixture = TestBed.createComponent(MenuHost);
    await fixture.whenStable();
    await forceViewportSize(fixture);
  });

  it('right-click on a row opens the shell with type-matched items and suppresses the browser menu', async () => {
    const allowed = rightClick(rowEl('a'));
    await fixture.whenStable();

    expect(allowed).toBe(false); // preventDefault: the tree owns the trigger here
    expect(menuEl()).toBeTruthy();
    expect(menuEl()!.querySelector('.menu-folder-action')).toBeTruthy();
    expect(menuEl()!.querySelector('.menu-file-action')).toBeNull();
  });

  it('leaf rows get the leaf branch — same menu, consumer-side @switch', async () => {
    rightClick(rowEl('b'));
    await fixture.whenStable();

    expect(menuEl()!.querySelector('.menu-file-action')).toBeTruthy();
    expect(menuEl()!.querySelector('.menu-folder-action')).toBeNull();
  });

  it('context carries the post-reconciliation selection ids', async () => {
    fixture.componentInstance.selected.set(['a1', 'a2']);
    await fixture.whenStable();

    rightClick(rowEl('a1')); // inside the multi-selection → selection intact
    await fixture.whenStable();
    expect(menuEl()!.querySelector('.menu-delete')!.textContent).toContain(
      '(2)',
    );
  });

  it('Shift+F10 opens the menu for the focused row (keyboard parity)', async () => {
    fixture.nativeElement
      .querySelector('cdk-virtual-scroll-viewport')!
      .dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    await fixture.whenStable();

    expect(menuEl()).toBeTruthy();
    expect(menuEl()!.querySelector('.menu-folder-action')).toBeTruthy(); // focus default: first row 'a'
  });

  it('openContextMenu(node) opens it programmatically (more_vert pattern)', async () => {
    fixture.componentInstance.tree().openContextMenu(DATA[1]);
    await fixture.whenStable();

    expect(menuEl()).toBeTruthy();
    expect(menuEl()!.querySelector('.menu-file-action')).toBeTruthy();
  });

  it('closes on viewport scroll (settled: close-on-scroll, never reposition)', async () => {
    rightClick(rowEl('a'));
    await fixture.whenStable();
    expect(menuEl()).toBeTruthy();

    fixture.nativeElement
      .querySelector('cdk-virtual-scroll-viewport')!
      .dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(menuEl()).toBeNull();
  });

  it('a menu-item rename keeps the edit input alive and focused (close must not reclaim the row)', async () => {
    rightClick(rowEl('b'));
    await fixture.whenStable();

    (menuEl()!.querySelector('.menu-file-action') as HTMLElement).click();
    await fixture.whenStable();
    // Give the (buggy) reclaim's frame-aligned focus chase room to land —
    // regression: it focused the row, blurring the input → instant commit.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fixture.whenStable();

    const input = rowEl('b').querySelector<HTMLInputElement>(
      'input[treeNodeEditInput]',
    );
    expect(input).toBeTruthy(); // editing survived the menu close
    expect(document.activeElement).toBe(input); // …and owns focus (typing works)
    expect(fixture.componentInstance.renames).toEqual([]); // no premature blur-commit
  });

  it('without a treeContextMenu def the tree neither opens nor suppresses anything', async () => {
    const bare = TestBed.createComponent(BareHost);
    await bare.whenStable();
    await forceViewportSize(bare);

    const row: HTMLElement =
      bare.nativeElement.querySelector('[data-node-id="a"]');
    const allowed = row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );
    await bare.whenStable();

    expect(allowed).toBe(true); // browser menu untouched — consumer trigger's job
    expect(menuEl()).toBeNull();
  });
});
