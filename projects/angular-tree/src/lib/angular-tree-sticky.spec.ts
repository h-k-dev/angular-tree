import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AngularTree } from './angular-tree';
import type { SelectEvent, ToggleEvent } from './events';
import { TreeNodeDef } from './tree-node-def';
import { TreeNodeEditInput } from './tree-node-edit-input';
import { TreeNodeToggle } from './tree-node-toggle';

interface Node {
  id: string;
  children?: Node[];
}

// a (0) › a1 (1) › a1-0…a1-9 (2) · a2…a20 (1) · b (0) — 20px rows, so row i
// spans [20i, 20i + 20) and scrollTop 30 pins a@0 and a1@20 (hand-computed
// against the VS Code algorithm in tree-sticky.spec.ts).
const DATA: Node[] = [
  {
    id: 'a',
    children: [
      {
        id: 'a1',
        children: Array.from({ length: 10 }, (_, i) => ({ id: `a1-${i}` })),
      },
      ...Array.from({ length: 19 }, (_, i) => ({ id: `a${i + 2}` })),
    ],
  },
  { id: 'b' },
];

@Component({
  imports: [AngularTree, TreeNodeDef, TreeNodeToggle, TreeNodeEditInput],
  template: `
    <angular-tree
      style="height: 400px"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [defaultExpandedKeys]="['a', 'a1']"
      [itemSize]="20"
      [multi]="true"
      [stickyScroll]="sticky()"
      [stickyScrollMaxRows]="maxRows()"
      [clickAction]="clickAction()"
      (activated)="activated.push($event.id)"
      (selectionChange)="selections.push($event)"
      (toggled)="toggles.push($event)"
    >
      <ng-template
        treeNodeDef
        let-node
        let-isSticky="isSticky"
        let-isEditing="isEditing"
      >
        @if (node.children) {
          <button class="toggle" treeNodeToggle>▾</button>
        }
        @if (isEditing) {
          <input treeNodeEditInput [value]="node.id" />
        } @else {
          <span class="name"
            >{{ node.id }}{{ isSticky ? ' (sticky)' : '' }}</span
          >
        }
      </ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: Node) => node.children;
  key = (node: Node) => node.id;
  readonly sticky = signal(true);
  readonly maxRows = signal(7);
  readonly clickAction = signal<'activate' | 'select'>('activate');
  activated: string[] = [];
  selections: SelectEvent<Node>[] = [];
  toggles: ToggleEvent<Node>[] = [];
  readonly tree = viewChild.required<AngularTree<Node>>(AngularTree);
}

describe('AngularTree stickyScroll (decision 16)', () => {
  let fixture: ComponentFixture<Host>;
  let viewport: CdkVirtualScrollViewport;
  let offsets: number[];

  const viewportEl = (): HTMLElement =>
    fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
  const band = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('.tree-sticky');
  const stickyKeys = () =>
    [...fixture.nativeElement.querySelectorAll('.tree-sticky-row')].map(
      (row) => (row as HTMLElement).dataset['stickyKey'],
    );
  const stickyRow = (key: string): HTMLElement =>
    fixture.nativeElement.querySelector(`[data-sticky-key="${key}"]`);
  const node = (id: string): Node =>
    id === 'a1'
      ? DATA[0].children![0]
      : (DATA[0].children![0].children!.find((child) => child.id === id) ??
        DATA[0]);

  /** jsdom has no layout: fake the box, then a real scroll event drives the band. */
  async function scrollTo(top: number) {
    Object.defineProperty(viewportEl(), 'scrollTop', {
      value: top,
      configurable: true,
      writable: true,
    });
    viewportEl().dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();

    const element = viewportEl();
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
      }) as DOMRect;
    viewport = fixture.debugElement
      .query(By.directive(CdkVirtualScrollViewport))
      .injector.get(CdkVirtualScrollViewport);
    viewport.checkViewportSize();
    // jsdom's scrollTo is a no-op — record the offsets the tree asks for.
    offsets = [];
    viewport.scrollToOffset = (offset: number) => void offsets.push(offset);
    await fixture.whenStable();
  });

  it('renders nothing at the top or while off', async () => {
    expect(band()).toBeNull();
    fixture.componentInstance.sticky.set(false);
    await scrollTo(30);
    expect(band()).toBeNull();
  });

  it('pins the top row’s ancestors in the consumer’s own def, isSticky set', async () => {
    await scrollTo(30);
    expect(stickyKeys()).toEqual(['a', 'a1']);
    expect(band()!.style.height).toBe('40px');
    expect(stickyRow('a1').style.top).toBe('20px');
    expect(stickyRow('a1').textContent).toContain('a1 (sticky)');
    // The real rows never see the flag.
    expect(
      fixture.nativeElement.querySelector('[data-node-id="a1-5"]').textContent,
    ).not.toContain('sticky');
  });

  it('stays invisible to AT and to row lookups (pointer sugar, like guides)', async () => {
    await scrollTo(30);
    expect(band()!.getAttribute('aria-hidden')).toBe('true');
    expect(
      band()!.querySelector('[role], [data-node-id], [tabindex="0"], [id]'),
    ).toBeNull();
  });

  it('caps by stickyScrollMaxRows, keeping the outermost ancestor', async () => {
    fixture.componentInstance.maxRows.set(1);
    await scrollTo(30);
    expect(stickyKeys()).toEqual(['a']);
  });

  it('a plain click reveals the node under its ancestors, focuses it, then runs the row click (activate)', async () => {
    await scrollTo(30);
    stickyRow('a1').click();
    await fixture.whenStable();
    // a1 = row 1, level 1 → 20 − 1·20 = 0.
    expect(offsets).toContain(0);
    expect(fixture.componentInstance.activated).toEqual(['a1']);
    expect(fixture.componentInstance.selections).toEqual([]); // Gmail lock holds
  });

  it("under clickAction 'select' the click replace-selects exactly like VS Code", async () => {
    fixture.componentInstance.clickAction.set('select');
    await scrollTo(30);
    stickyRow('a1').click();
    await fixture.whenStable();
    const [event] = fixture.componentInstance.selections;
    expect(event.ids).toEqual(['a1']);
    expect(event.trigger?.id).toBe('a1');
    expect(event.cause).toBe('pointer');
  });

  it('a selection-modifier click only changes selection — no reveal', async () => {
    await scrollTo(30);
    stickyRow('a').dispatchEvent(
      new MouseEvent('click', { bubbles: true, ctrlKey: true }),
    );
    await fixture.whenStable();
    expect(offsets).toEqual([]);
    expect(fixture.componentInstance.selections.at(-1)?.ids).toEqual(['a']);
  });

  it('the toggle inside a pinned row collapses it (VS Code twistie) without the row click', async () => {
    await scrollTo(30);
    (stickyRow('a1').querySelector('.toggle') as HTMLElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.toggles.at(-1)).toMatchObject({
      id: 'a1',
      expanded: false,
    });
    expect(fixture.componentInstance.activated).toEqual([]);
  });

  it('never renders a second rename input in the band; edit() reveals the real row first', async () => {
    await scrollTo(30);
    fixture.componentInstance.tree().edit(node('a1'));
    await fixture.whenStable();
    expect(stickyRow('a1').querySelector('input')).toBeNull();
    // a1's top (20) is under the band at scrollTop 30 → align below its parent.
    expect(offsets).toContain(0);
  });

  it('scrollTo() lands the node below its own pinned ancestors', async () => {
    fixture.componentInstance.tree().scrollTo(node('a1-5'));
    // a1-5 = row 7, level 2 → 140 − 2·20.
    expect(offsets).toEqual([100]);
  });

  it('focus moves reveal a row hidden under the band (VS Code reveal padding)', async () => {
    await scrollTo(30);
    fixture.componentInstance.tree().focus(node('a1-0'));
    // Row 2 (top 40) sits under a 40px clearance at scrollTop 30 → 40 − 40.
    expect(offsets).toEqual([0]);
  });

  it('pointer-down on the band is not an outside click', async () => {
    fixture.componentInstance.clickAction.set('select');
    await scrollTo(30);
    stickyRow('a1').click();
    await fixture.whenStable();
    const before = fixture.componentInstance.selections.length;
    stickyRow('a').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    await fixture.whenStable();
    expect(fixture.componentInstance.selections.length).toBe(before);
  });
});
