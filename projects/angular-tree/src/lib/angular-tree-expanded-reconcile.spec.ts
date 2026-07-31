import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal, viewChild } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { defer } from 'rxjs';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import type { LoadChildrenEvent } from './events';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
  lazy?: boolean;
}

/** Re-mintable: every call produces NEW node objects under the SAME keys. */
const makeData = (): DemoNode[] => [
  { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1' }] },
  { id: 'c', name: 'C lazy', lazy: true },
];

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve));

/**
 * The states the toggle funnel can't reach (decision 14): a controlled
 * `expandedKeys` write naming a lazy node, and a `dataSource` replacement
 * re-minting node objects under keys still flagged expanded — both must load
 * as if the node had just been toggled open.
 */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data()"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [(expandedKeys)]="expanded"
      [childrenDeps]="filter()"
      (childrenLoaded)="loads.push($event)"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class Host {
  data = signal(makeData());
  expanded = signal<readonly string[]>([]);
  filter = signal('initial');
  fail = false;
  /** Counts real fetches — the accessor is COLD, so probing stays free. */
  fetches = 0;
  loads: LoadChildrenEvent<DemoNode>[] = [];
  children = (node: DemoNode) => {
    if (!node.lazy) return node.children;
    return defer(() => {
      this.fetches++;
      if (this.fail) return Promise.reject(new Error('backend down'));
      return Promise.resolve([
        { id: `c-${this.filter()}`, name: `C of ${this.filter()}` },
      ]);
    });
  };
  key = (node: DemoNode) => node.id;
  readonly tree = viewChild.required<AngularTree<DemoNode>>(AngularTree);
}

describe('AngularTree expanded ⇒ load reconciliation', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let tree: AngularTree<DemoNode>;

  const visibleKeys = () => tree.visibleRows().map((row) => row.key);

  const settle = async () => {
    await fixture.whenStable(); // effect fires → ensureChildren
    await flushMicrotasks(); // accessor resolves
    await fixture.whenStable(); // overlay lands, rows re-render
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
    tree = host.tree();
  });

  it('does not fetch collapsed lazy nodes (probing stays free)', async () => {
    await settle();
    expect(host.fetches).toBe(0);
  });

  it('a controlled expandedKeys write naming a lazy node loads it', async () => {
    host.expanded.set(['c']);
    await settle();

    expect(host.fetches).toBe(1);
    expect(visibleKeys()).toContain('c-initial');
  });

  it('a toggle-expand still loads and emits exactly once', async () => {
    tree.expand(host.data()[1]);
    await settle();

    expect(host.fetches).toBe(1);
    expect(host.loads).toEqual([
      { id: 'c', node: host.data()[1], status: 'loaded' },
    ]);
  });

  it('reloads a branch left expanded across invalidation + re-minted dataSource', async () => {
    // The refresh flow of a resource-backed consumer: the roots flash empty
    // while reloading, invalidation lands mid-flight, and the fresh roots are
    // NEW objects under the same keys — still flagged expanded.
    tree.expand(host.data()[1]);
    await settle();
    expect(visibleKeys()).toContain('c-initial');

    host.data.set([]);
    await fixture.whenStable();
    host.filter.set('fresh'); // childrenDeps: tree-wide invalidate, empty flat
    await fixture.whenStable();

    host.data.set(makeData());
    await settle();

    expect(host.expanded()).toContain('c'); // never collapsed
    expect(host.fetches).toBe(2);
    expect(visibleKeys()).toContain('c-fresh');
    expect(visibleKeys()).not.toContain('c-initial');
  });

  it('leaves error state parked — retryChildren stays the recovery path', async () => {
    host.fail = true;
    host.expanded.set(['c']);
    await settle();
    expect(host.fetches).toBe(1);

    // A later expansion write re-runs the reconciler; the errored key waits.
    host.expanded.set(['c', 'a']);
    await settle();
    expect(host.fetches).toBe(1);

    host.fail = false;
    tree.byKey.retryChildren('c');
    await settle();
    expect(host.fetches).toBe(2);
    expect(visibleKeys()).toContain('c-initial');
  });
});
