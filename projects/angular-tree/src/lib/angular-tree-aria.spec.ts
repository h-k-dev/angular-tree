import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SelectionModel } from '@angular/cdk/collections';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import * as axe from 'axe-core';

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
      { id: 'a2', name: 'A2' },
    ],
  },
  { id: 'b', name: 'B' },
];

@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      style="height: 400px"
      aria-label="Demo documents"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [selection]="selection"
      [multi]="true"
      [checkboxSelection]="checkbox()"
      [selectionMode]="mode()"
      [focusMode]="focus()"
      [deselectOnOutsideClick]="deselect()"
      [indentGuides]="guides()"
      [defaultExpandedKeys]="['a']"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class AriaHost {
  data = DATA;
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  selection = new SelectionModel<string>(true);
  checkbox = signal(false);
  mode = signal<'explicit' | 'follow'>('explicit');
  focus = signal<'roving' | 'activedescendant'>('roving');
  deselect = signal(true);
  guides = signal(false);
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree ARIA', () => {
  let fixture: ComponentFixture<AriaHost>;

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

  const viewportEl = (): HTMLElement =>
    fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
  const rowEl = (key: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);
  const keydown = (init: KeyboardEventInit) =>
    viewportEl().dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, ...init }),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AriaHost],
    }).compileComponents();
    fixture = TestBed.createComponent(AriaHost);
    await fixture.whenStable();
    await forceViewportSize();
  });

  it('renders real rows once the viewport has a size (jsdom sanity)', () => {
    expect(
      fixture.nativeElement.querySelectorAll('[role="treeitem"]').length,
    ).toBe(4);
  });

  it('exposes structure: level, setsize, posinset, expanded-on-parents-only', () => {
    const a = rowEl('a')!;
    const a1 = rowEl('a1')!;
    expect(a.getAttribute('aria-level')).toBe('1');
    expect(a.getAttribute('aria-expanded')).toBe('true');
    expect(a1.getAttribute('aria-level')).toBe('2');
    expect(a1.hasAttribute('aria-expanded')).toBe(false); // leaves omit it
    expect(a1.getAttribute('aria-setsize')).toBe('2');
    expect(a1.getAttribute('aria-posinset')).toBe('1');
    expect(viewportEl().getAttribute('aria-multiselectable')).toBe('true');
  });

  it('republishes [itemSize] as the read-only --tree-row-height host variable', () => {
    const host: HTMLElement =
      fixture.nativeElement.querySelector('angular-tree');
    expect(host.style.getPropertyValue('--tree-row-height')).toBe('32px');
  });

  it('forwards the accessible name to the role="tree" element (APG: trees MUST be labelled)', () => {
    // The role sits on the internal viewport, not the host — the alias inputs
    // exist precisely so `aria-label` on <angular-tree> reaches AT.
    expect(viewportEl().getAttribute('aria-label')).toBe('Demo documents');
  });

  describe('deselectOnOutsideClick', () => {
    const pointerdown = (target: EventTarget) =>
      target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    beforeEach(async () => {
      fixture.componentInstance.selection.select('a1', 'b');
      await fixture.whenStable();
    });

    it('a pointer-down outside the tree clears the selection (default on)', () => {
      pointerdown(document.body);
      expect(fixture.componentInstance.selection.selected).toEqual([]);
    });

    it('a pointer-down on empty viewport space clears too (file-manager semantics)', () => {
      pointerdown(viewportEl());
      expect(fixture.componentInstance.selection.selected).toEqual([]);
    });

    it('rows, indent guides, and CDK overlays never clear — their actions use the selection', () => {
      pointerdown(rowEl('a')!);

      const overlay = document.createElement('div');
      overlay.className = 'cdk-overlay-container';
      const menuItem = overlay.appendChild(document.createElement('button'));
      document.body.appendChild(overlay);
      pointerdown(menuItem);
      overlay.remove();

      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(
        new Set(['a1', 'b']),
      );
    });

    it('opting out leaves outside clicks alone', async () => {
      fixture.componentInstance.deselect.set(false);
      await fixture.whenStable();
      pointerdown(document.body);
      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(
        new Set(['a1', 'b']),
      );
    });
  });

  it('binds aria-selected in plain mode, tri-state aria-checked in checkbox mode', async () => {
    fixture.componentInstance.selection.select('a1');
    await fixture.whenStable();
    expect(rowEl('a1')!.getAttribute('aria-selected')).toBe('true');
    expect(rowEl('a1')!.hasAttribute('aria-checked')).toBe(false);

    fixture.componentInstance.checkbox.set(true);
    await fixture.whenStable();
    expect(rowEl('a1')!.getAttribute('aria-checked')).toBe('true');
    expect(rowEl('a')!.getAttribute('aria-checked')).toBe('mixed'); // one of two children
    expect(rowEl('b')!.getAttribute('aria-checked')).toBe('false');
    expect(rowEl('a1')!.hasAttribute('aria-selected')).toBe(false);
  });

  it('activedescendant mode: focus stays on the tree, rows are not tab stops', async () => {
    fixture.componentInstance.focus.set('activedescendant');
    await fixture.whenStable();

    expect(viewportEl().getAttribute('tabindex')).toBe('0');
    expect(rowEl('a')!.getAttribute('tabindex')).toBe('-1');

    keydown({ key: 'ArrowDown' });
    await fixture.whenStable();
    expect(viewportEl().getAttribute('aria-activedescendant')).toBe(
      rowEl('a1')!.id,
    );
  });

  it('follow mode: arrow focus replaces the selection', async () => {
    fixture.componentInstance.mode.set('follow');
    await fixture.whenStable();

    keydown({ key: 'ArrowDown' }); // a1
    expect(fixture.componentInstance.selection.selected).toEqual(['a1']);
    keydown({ key: 'ArrowDown' }); // a2
    expect(fixture.componentInstance.selection.selected).toEqual(['a2']);
  });

  it('Shift+Arrow extends, Ctrl+click toggles, Shift+click ranges over visible order', async () => {
    keydown({ key: ' ' }); // select a (anchor)
    keydown({ key: 'ArrowDown', shiftKey: true }); // extend to a1
    expect(new Set(fixture.componentInstance.selection.selected)).toEqual(
      new Set(['a', 'a1']),
    );

    rowEl('a1')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, ctrlKey: true }),
    );
    expect(new Set(fixture.componentInstance.selection.selected)).toEqual(
      new Set(['a']),
    );

    rowEl('b')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true }),
    );
    // range anchor (a1, last explicit toggle) → b over visible order
    expect(new Set(fixture.componentInstance.selection.selected)).toEqual(
      new Set(['a', 'a1', 'a2', 'b']),
    );
  });

  describe('indent guides', () => {
    const guideEls = () =>
      viewportEl().querySelectorAll<HTMLElement>('.tree-guide');

    it('renders ONE continuous guide per expanded group and click-collapses it', async () => {
      fixture.componentInstance.guides.set(true);
      await fixture.whenStable();

      // 'a' is expanded with two children → one line, not a segment per row.
      const guides = guideEls();
      expect(guides.length).toBe(1);
      expect(guides[0].style.getPropertyValue('--tree-level')).toBe('0');
      // Connector geometry: parent 'a' (row 0) bottom edge → last direct child
      // a2 (row 2) centre, at itemSize 32. top = 1·32 = 32; height = (2 − 1
      // + 0.5)·32 = 48. The end is rendered, so the elbow turns toward a2.
      expect(guides[0].style.top).toBe('32px');
      expect(guides[0].style.height).toBe('48px');
      expect(guides[0].getAttribute('data-elbow')).toBe('true');

      guides[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await fixture.whenStable();
      expect(fixture.componentInstance.tree().isExpanded(DATA[0])).toBe(false);
      expect(rowEl('a1')).toBeNull(); // group closed
      expect(guideEls().length).toBe(0); // and its line went with it
    });

    it('a guide click is not a row click (no activation)', async () => {
      fixture.componentInstance.guides.set(true);
      await fixture.whenStable();
      const activated: DemoNode[] = [];
      fixture.componentInstance
        .tree()
        .activated.subscribe((node) => activated.push(node));

      guideEls()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(activated).toEqual([]);
    });
  });

  it('plain row click never mutates selection (Gmail semantics, locked)', () => {
    rowEl('a1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.selection.selected).toEqual([]);
  });

  it('exposes checkState through the template context (icon-as-checkbox driver)', async () => {
    fixture.componentInstance.checkbox.set(true);
    fixture.componentInstance.selection.select('a1');
    await fixture.whenStable();

    const rows = fixture.componentInstance.tree().visibleRows();
    expect(rows.find((row) => row.key === 'a1')!.context.checkState).toBe(
      'checked',
    );
    expect(rows.find((row) => row.key === 'a')!.context.checkState).toBe(
      'indeterminate',
    );
    expect(rows.find((row) => row.key === 'b')!.context.checkState).toBe(
      'unchecked',
    );
  });

  describe('context menu contract', () => {
    it('right-click on an unselected row replaces the selection first (OS convention)', () => {
      const events: {
        ids: readonly string[];
        position: { x: number; y: number };
      }[] = [];
      fixture.componentInstance
        .tree()
        .contextRequested.subscribe((e) => events.push(e));
      fixture.componentInstance.selection.select('b');

      rowEl('a1')!.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 40,
          clientY: 60,
        }),
      );

      expect(fixture.componentInstance.selection.selected).toEqual(['a1']);
      expect(events).toEqual([
        expect.objectContaining({ ids: ['a1'], position: { x: 40, y: 60 } }),
      ]);
    });

    it('right-click inside a multi-selection keeps it intact and reports all ids', () => {
      const events: { ids: readonly string[] }[] = [];
      fixture.componentInstance
        .tree()
        .contextRequested.subscribe((e) => events.push(e));
      fixture.componentInstance.selection.select('a1', 'b');

      rowEl('b')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true }),
      );

      expect(new Set(fixture.componentInstance.selection.selected)).toEqual(
        new Set(['a1', 'b']),
      );
      expect(new Set(events[0].ids)).toEqual(new Set(['a1', 'b']));
    });

    it('Shift+F10 and the ContextMenu key request a menu for the focused row', () => {
      const events: { node: DemoNode }[] = [];
      fixture.componentInstance
        .tree()
        .contextRequested.subscribe((e) => events.push(e));

      keydown({ key: 'ArrowDown' }); // focus a1
      keydown({ key: 'F10', shiftKey: true });
      keydown({ key: 'ContextMenu' });

      expect(events.map((e) => e.node.id)).toEqual(['a1', 'a1']);
    });
  });

  it('passes an axe audit (checkbox tree, layout rules excluded for jsdom)', async () => {
    fixture.componentInstance.checkbox.set(true);
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement, {
      rules: {
        // Layout/paint-dependent rules can't run meaningfully in jsdom.
        'color-contrast': { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
