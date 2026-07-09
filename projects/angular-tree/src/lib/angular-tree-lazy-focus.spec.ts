import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
  lazy?: boolean;
}

const makeData = (): DemoNode[] => [
  {
    id: 'a',
    name: 'A',
    children: [
      { id: 'a1', name: 'A1' },
      { id: 'a2', name: 'A2' },
    ],
  },
  { id: 'b', name: 'B' },
  { id: 'c', name: 'C lazy', lazy: true },
];

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data()"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [defaultFocusedKey]="defaultFocusedKey()"
      [collapseBehavior]="collapseBehavior()"
    >
      <!-- "key" from the context — the Phase 14 template-parity contract -->
      <ng-template treeNodeDef let-node let-key="key">{{ key }}:{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = signal<DemoNode[]>(makeData());
  defaultFocusedKey = signal<string | undefined>(undefined);
  collapseBehavior = signal<'keep' | 'invalidate'>('keep');

  lazyCalls = 0;
  children = (node: DemoNode) => {
    if (!node.lazy) return node.children;
    this.lazyCalls += 1;
    return Promise.resolve<DemoNode[]>([{ id: 'c1', name: 'C1' }]);
  };
  key = (node: DemoNode) => node.id;

  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree v2 — lazy invalidation & focus', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let tree: AngularTree<DemoNode>;

  const rowEl = (key: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-node-id="${key}"]`);

  const settle = async () => {
    await fixture.whenStable();
    await flushMicrotasks();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();
  });

  it('exposes the node key in the template context', () => {
    expect(rowEl('a')?.textContent).toContain('a:A');
    expect(rowEl('b')?.textContent).toContain('b:B');
  });

  it('defaultFocusedKey seeds the roving tabindex target', async () => {
    host.defaultFocusedKey.set('b');
    await settle();
    expect(rowEl('b')?.tabIndex).toBe(0);
    expect(rowEl('a')?.tabIndex).toBe(-1);
  });

  it('an unknown or hidden focused key falls back to the first row (Tab target never lost)', async () => {
    host.defaultFocusedKey.set('missing');
    await settle();
    expect(rowEl('a')?.tabIndex).toBe(0);
  });

  it("collapseBehavior 'keep' reuses resolved children; 'invalidate' re-runs the accessor", async () => {
    const node = host.data()[2];

    tree.expand(node);
    await settle();
    expect(host.lazyCalls).toBe(1);

    tree.collapse(node);
    tree.expand(node);
    await settle();
    expect(host.lazyCalls).toBe(1); // 'keep' (default): overlay survives collapse

    host.collapseBehavior.set('invalidate');
    await settle();
    tree.collapse(node);
    tree.expand(node);
    await settle();
    expect(host.lazyCalls).toBe(2); // overlay dropped on collapse → fresh run
    expect(tree.visibleRows().map((row) => row.key)).toContain('c1');
  });

  it('invalidateChildren(node) reloads an expanded lazy subtree immediately', async () => {
    const node = host.data()[2];
    tree.expand(node);
    await settle();
    expect(host.lazyCalls).toBe(1);

    tree.invalidateChildren(node);
    await settle();
    expect(host.lazyCalls).toBe(2);
    expect(tree.visibleRows().map((row) => row.key)).toContain('c1');
  });

  it('focus retention: a data swap that destroys the focused row re-attaches focus by key', async () => {
    tree.expand(host.data()[0]);
    await settle();
    rowEl('a1')!.focus();
    expect(document.activeElement).toBe(rowEl('a1'));

    // Immutable-update pattern: same keys, all-new objects and array identity.
    host.data.set(makeData());
    await settle();
    await flushMicrotasks();

    expect(
      (document.activeElement as HTMLElement | null)?.closest('[data-node-id]')?.getAttribute('data-node-id'),
    ).toBe('a1');
  });

  it('focus retention: a vanished focused key falls back to the nearest visible survivor', async () => {
    tree.expand(host.data()[0]);
    await settle();
    rowEl('a1')!.focus();

    // Delete the focused node — the survivor right after it in the old
    // visible order is its following sibling a2.
    const next = makeData();
    next[0].children = next[0].children!.filter((child) => child.id !== 'a1');
    host.data.set(next);
    await settle();
    await flushMicrotasks();
    await settle();

    expect(
      (document.activeElement as HTMLElement | null)?.closest('[data-node-id]')?.getAttribute('data-node-id'),
    ).toBe('a2');
  });

  it('focus retention never steals focus back after the user left the tree', async () => {
    tree.expand(host.data()[0]);
    await settle();
    rowEl('a1')!.focus();

    // The user clicks a non-focusable area outside the tree: no focus event
    // fires, only the pointer-down marks the departure.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();

    const next = makeData();
    next[0].children = next[0].children!.filter((child) => child.id !== 'a1');
    host.data.set(next);
    await settle();
    await flushMicrotasks();
    await settle();

    expect(document.activeElement).toBe(document.body);
  });
});
