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
 * The consumer-filter scenario the input exists for: the accessor closes over
 * `filter`, so a cached child list goes stale whenever it changes.
 */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [childrenDeps]="filter()"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  filter = signal('initial');
  /** Counts real fetches; the payload names the filter it was fetched with. */
  fetches = 0;
  /** COLD observable (documented lazy contract): probing is free, only the
   *  expand-intent subscription fetches — so the counter counts real loads. */
  children = (node: DemoNode) => {
    if (!node.lazy) return node.children;
    return defer(() => {
      this.fetches++;
      return Promise.resolve([
        { id: `c-${this.filter()}`, name: `C of ${this.filter()}` },
      ]);
    });
  };
  key = (node: DemoNode) => node.id;
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree childrenDeps (declarative invalidation)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let tree: AngularTree<DemoNode>;

  const visibleKeys = () => tree.visibleRows().map((row) => row.key);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();
  });

  it('the initial value never invalidates (a value is not a change)', async () => {
    tree.expand(DATA[1]);
    await flushMicrotasks();
    await fixture.whenStable();

    // Exactly one subscription (the expand intent) — probes are free.
    expect(host.fetches).toBe(1);
    expect(visibleKeys()).toContain('c-initial');
  });

  it('a change re-runs the accessor for the expanded branch (stale cache dropped)', async () => {
    tree.expand(DATA[1]);
    await flushMicrotasks();
    await fixture.whenStable();
    expect(visibleKeys()).toContain('c-initial');

    host.filter.set('changed');
    await fixture.whenStable(); // effect fires → invalidateChildren()
    await flushMicrotasks(); // accessor re-resolves
    await fixture.whenStable();

    expect(host.fetches).toBe(2);
    expect(visibleKeys()).toContain('c-changed');
    expect(visibleKeys()).not.toContain('c-initial');
  });

  it('a collapsed loaded branch reloads on its next expand, not eagerly', async () => {
    tree.expand(DATA[1]);
    await flushMicrotasks();
    await fixture.whenStable();
    tree.collapse(DATA[1]);
    await fixture.whenStable();

    host.filter.set('later');
    await fixture.whenStable();
    await flushMicrotasks();
    expect(host.fetches).toBe(1); // collapsed: invalidated, NOT refetched

    tree.expand(DATA[1]);
    await flushMicrotasks();
    await fixture.whenStable();
    expect(host.fetches).toBe(2);
    expect(visibleKeys()).toContain('c-later');
  });
});
