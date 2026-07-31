import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { defer } from 'rxjs';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
  lazy?: boolean;
}

const DATA: DemoNode[] = [
  { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1' }] },
  { id: 'c', name: 'C lazy', lazy: true },
];

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

/**
 * Stale-while-revalidate (decision 15): invalidation must never blank the
 * screen — the old children stay rendered until their replacement resolves.
 * The gate lets specs hold the revalidation in flight and look at the tree.
 */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [childrenDeps]="filter()"
      [collapseBehavior]="collapseBehavior()"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  filter = signal('initial');
  collapseBehavior = signal<'keep' | 'invalidate'>('keep');
  fetches = 0;
  fail = false;
  /** Held responses: while set, revalidation stays in flight. */
  gate: Promise<void> | null = null;
  children = (node: DemoNode) => {
    if (!node.lazy) return node.children;
    return defer(async () => {
      this.fetches++;
      await this.gate;
      if (this.fail) throw new Error('backend down');
      return [{ id: `c-${this.filter()}`, name: `C of ${this.filter()}` }];
    });
  };
  key = (node: DemoNode) => node.id;
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree stale-while-revalidate invalidation', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let tree: AngularTree<DemoNode>;

  const visibleKeys = () => tree.visibleRows().map((row) => row.key);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();

    tree.expand(DATA[1]);
    await flushMicrotasks();
    await fixture.whenStable();
    expect(visibleKeys()).toContain('c-initial');
  });

  it('keeps the old children rendered while the revalidation is in flight', async () => {
    let release!: () => void;
    host.gate = new Promise((resolve) => (release = resolve));

    host.filter.set('fresh');
    await fixture.whenStable(); // invalidation landed, refetch gated
    await flushMicrotasks();

    // Mid-flight: the stale subtree is still on screen — no blank frame.
    expect(visibleKeys()).toContain('c-initial');
    expect(host.fetches).toBe(2);

    release();
    host.gate = null;
    await flushMicrotasks();
    await fixture.whenStable();

    expect(visibleKeys()).toContain('c-fresh');
    expect(visibleKeys()).not.toContain('c-initial');
  });

  it('keeps the stale children when the revalidation fails; retry recovers', async () => {
    host.fail = true;
    host.filter.set('fresh');
    await fixture.whenStable();
    await flushMicrotasks();
    await fixture.whenStable();

    // Failed refresh: stale beats blank, and the error is retryable.
    expect(visibleKeys()).toContain('c-initial');

    host.fail = false;
    tree.byKey.retryChildren('c');
    await flushMicrotasks();
    await fixture.whenStable();

    expect(visibleKeys()).toContain('c-fresh');
  });

  it("collapseBehavior 'invalidate': re-expand shows the stale children instantly while refetching", async () => {
    host.collapseBehavior.set('invalidate');
    await fixture.whenStable(); // input binding must propagate before the collapse reads it

    tree.collapse(DATA[1]);
    await fixture.whenStable();
    expect(host.fetches).toBe(1); // collapse invalidates, never fetches

    let release!: () => void;
    host.gate = new Promise((resolve) => (release = resolve));
    tree.expand(DATA[1]);
    await flushMicrotasks();

    // The stale child is back on screen the moment the row opens.
    expect(visibleKeys()).toContain('c-initial');
    expect(host.fetches).toBe(2);

    release();
    host.gate = null;
    await flushMicrotasks();
    await fixture.whenStable();
    expect(visibleKeys()).toContain('c-initial'); // same filter → same child
  });
});
