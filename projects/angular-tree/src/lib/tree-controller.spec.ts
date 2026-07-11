import { signal } from '@angular/core';
import { of } from 'rxjs';

import {
  dropZoneAt,
  TreeController,
  TreeControllerInputs,
} from './tree-controller';

function deferred<V>() {
  let resolve!: (value: V) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<V>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
  lazy?: boolean;
}

const DATA: DemoNode[] = [
  {
    id: 'a',
    name: 'Alpha',
    children: [
      { id: 'a1', name: 'Alpha One' },
      {
        id: 'a2',
        name: 'Alpha Two',
        children: [{ id: 'a2x', name: 'Deep Match' }],
      },
    ],
  },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Lazy', lazy: true },
];

/** Plain construction — the controller has no DI of its own. */
function createController(
  overrides: Partial<TreeControllerInputs<DemoNode>> = {},
) {
  const controller = new TreeController<DemoNode>();
  const searchTerm = signal('');
  const inputs: TreeControllerInputs<DemoNode> = {
    dataSource: signal(DATA),
    childrenAccessor: signal((node: DemoNode) =>
      node.lazy ? Promise.resolve([]) : node.children,
    ),
    expansionKey: signal((node: DemoNode) => node.id),
    defaultExpandedKeys: signal<readonly string[]>([]),
    defaultFocusedKey: signal<string | undefined>(undefined),
    searchTerm,
    searchMatch: signal<
      ((node: DemoNode, term: string) => boolean) | undefined
    >(undefined),
    ...overrides,
  };
  controller.connect(inputs);
  return { controller, searchTerm, inputs };
}

describe('TreeController', () => {
  describe('flat model', () => {
    it('flattens in DFS pre-order with parent/child links', () => {
      const { controller } = createController();
      const { list, map, rootKeys } = controller.flat();

      expect(list.map((entry) => entry.key)).toEqual([
        'a',
        'a1',
        'a2',
        'a2x',
        'b',
        'c',
      ]);
      expect(rootKeys).toEqual(['a', 'b', 'c']);
      expect(map.get('a2x')?.parentKey).toBe('a2');
      expect(map.get('a')?.childKeys).toEqual(['a1', 'a2']);
    });

    it('reports aria positions per sibling group', () => {
      const { controller } = createController();
      const a2 = controller.flat().map.get('a2')!;
      expect(a2.setSize).toBe(2);
      expect(a2.posInSet).toBe(2);
      expect(a2.level).toBe(1);
    });

    it('marks async children as expandable but not loaded', () => {
      const { controller } = createController();
      const lazy = controller.flat().map.get('c')!;
      expect(lazy.expandable).toBe(true);
      expect(lazy.loaded).toBe(false);
      expect(lazy.childKeys).toEqual([]);
    });
  });

  describe('visibility', () => {
    it('skips children of collapsed nodes', () => {
      const { controller } = createController();
      expect(controller.visibleNodes().map((row) => row.flat.key)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('walks into expanded nodes only', () => {
      const { controller } = createController();
      controller.setExpanded('a', true);
      expect(controller.visibleNodes().map((row) => row.flat.key)).toEqual([
        'a',
        'a1',
        'a2',
        'b',
        'c',
      ]);
    });
  });

  describe('search', () => {
    const match = (node: DemoNode, term: string) =>
      node.name.toLowerCase().includes(term.toLowerCase());

    it('is inert without a matcher', () => {
      const { controller, searchTerm } = createController();
      searchTerm.set('deep');
      expect(controller.searchVisibleIds()).toBeNull();
      expect(controller.visibleNodes().map((row) => row.flat.key)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('keeps the ancestor chain of a match visible and force-expanded', () => {
      const { controller, searchTerm } = createController({
        searchMatch: signal(match),
      });
      searchTerm.set('deep');

      // a2x matches; a and a2 render as its chain, force-expanded, b/c filtered.
      expect(controller.visibleNodes().map((row) => row.flat.key)).toEqual([
        'a',
        'a2',
        'a2x',
      ]);
      expect(
        controller
          .visibleNodes()
          .every((row) => !row.flat.expandable || row.isExpanded),
      ).toBe(true);
    });

    it('never mutates expansion state — clearing the term restores it', () => {
      const { controller, searchTerm } = createController({
        searchMatch: signal(match),
      });
      controller.setExpanded('a', true);

      searchTerm.set('deep');
      expect(controller.expandedIds()).toEqual(new Set(['a']));

      searchTerm.set('');
      expect(controller.visibleNodes().map((row) => row.flat.key)).toEqual([
        'a',
        'a1',
        'a2',
        'b',
        'c',
      ]);
    });
  });

  describe('checkStates', () => {
    it('derives parent tri-state from children (reverse pass)', () => {
      const { controller } = createController();

      controller.selectedIds.set(new Set(['a1']));
      expect(controller.checkStates().get('a')).toBe('indeterminate');

      controller.selectedIds.set(new Set(['a1', 'a2x']));
      expect(controller.checkStates().get('a2')).toBe('checked');
      expect(controller.checkStates().get('a')).toBe('checked');

      controller.selectedIds.set(new Set());
      expect(controller.checkStates().get('a')).toBe('unchecked');
    });

    it('indeterminate child propagates to the root', () => {
      const { controller } = createController();
      controller.selectedIds.set(new Set(['a2x', 'a1']));
      // a2 checked + a1 checked → a checked; drop a2x → a2 unchecked, a indeterminate
      controller.selectedIds.set(new Set(['a1']));
      expect(controller.checkStates().get('a2')).toBe('unchecked');
      expect(controller.checkStates().get('a')).toBe('indeterminate');
    });
  });

  describe('lazy loading', () => {
    const child: DemoNode = { id: 'c1', name: 'Lazy Child' };

    it('resolves async children into the flat model, deduping in-flight loads', async () => {
      const { promise, resolve } = deferred<DemoNode[]>();
      let calls = 0;
      const { controller } = createController({
        childrenAccessor: signal((node: DemoNode) =>
          node.lazy ? ((calls += 1), promise) : node.children,
        ),
      });

      const first = controller.ensureChildren('c');
      const second = controller.ensureChildren('c');
      expect(calls).toBe(1);
      expect(controller.loadStates().get('c')).toBe('loading');

      resolve([child]);
      expect((await first).status).toBe('loaded');
      expect((await second).status).toBe('loaded');
      expect(controller.loadStates().get('c')).toBeUndefined();
      expect(controller.flat().map.get('c')?.loaded).toBe(true);
      expect(controller.flat().map.get('c')?.childKeys).toEqual(['c1']);
    });

    it('survives unmount/remount mid-flight — state is central, not row-local', async () => {
      const { promise, resolve } = deferred<DemoNode[]>();
      const { controller } = createController({
        childrenAccessor: signal((node: DemoNode) =>
          node.lazy ? promise : node.children,
        ),
      });

      controller.setExpanded('c', true);
      const load = controller.ensureChildren('c');
      // "Scroll out of view": the row's DOM is destroyed — collapse mimics
      // the state churn; the load must not be lost or duplicated.
      controller.setExpanded('c', false);

      resolve([child]);
      await load;

      controller.setExpanded('c', true);
      expect(controller.visibleNodes().map((row) => row.flat.key)).toContain(
        'c1',
      );
      expect(controller.loadStates().get('c')).toBeUndefined(); // never stuck
    });

    it('maps rejection to an error state; retry re-runs the accessor', async () => {
      let attempt = 0;
      const { controller } = createController({
        childrenAccessor: signal((node: DemoNode) =>
          node.lazy
            ? (attempt += 1) === 1
              ? Promise.reject(new Error('boom'))
              : Promise.resolve([child])
            : node.children,
        ),
      });

      const result = await controller.ensureChildren('c');
      expect(result.status).toBe('error');
      expect(controller.loadStates().get('c')).toBe('error');

      const retried = await controller.retryChildren('c');
      expect(retried.status).toBe('loaded');
      expect(controller.flat().map.get('c')?.childKeys).toEqual(['c1']);
    });

    it('treats sync accessors as a noop and supports Observables', async () => {
      const { controller } = createController({
        childrenAccessor: signal((node: DemoNode) =>
          node.lazy ? of([child]) : node.children,
        ),
      });

      expect((await controller.ensureChildren('a')).status).toBe('noop');
      expect((await controller.ensureChildren('c')).status).toBe('loaded');
      expect(controller.flat().map.get('c')?.childKeys).toEqual(['c1']);
    });
  });

  describe('drag math', () => {
    it('dropZoneAt splits a row 25/50/25', () => {
      expect(dropZoneAt(0, 32)).toBe('before');
      expect(dropZoneAt(7, 32)).toBe('before');
      expect(dropZoneAt(8, 32)).toBe('inside');
      expect(dropZoneAt(23, 32)).toBe('inside');
      expect(dropZoneAt(24, 32)).toBe('after');
      expect(dropZoneAt(32, 32)).toBe('after');
    });

    it('dragKeysFor: unselected press drags only the pressed row', () => {
      const { controller } = createController();
      controller.selectedIds.set(new Set(['a1', 'b']));
      expect(controller.dragKeysFor('a2')).toEqual(['a2']);
    });

    it('dragKeysFor: selected press drags the pruned selection in DFS order', () => {
      const { controller } = createController();
      // a and its descendant a2x both selected → a2x pruned; b rides along.
      controller.selectedIds.set(new Set(['b', 'a', 'a2x']));
      expect(controller.dragKeysFor('a')).toEqual(['a', 'b']);
    });

    it('dropTargetFor resolves before/after against the sibling group', () => {
      const { controller } = createController();
      expect(controller.dropTargetFor(['b'], 'a', 'before')).toEqual({
        parentKey: null,
        parentNode: null,
        index: 0,
      });
      // after a2 (posInSet 2 of a's children) → parent a, index 2
      expect(controller.dropTargetFor(['b'], 'a2', 'after')).toMatchObject({
        parentKey: 'a',
        index: 2,
      });
    });

    it('dropTargetFor appends on inside; leaf inside degrades to after', () => {
      const { controller } = createController();
      expect(controller.dropTargetFor(['b'], 'a', 'inside')).toMatchObject({
        parentKey: 'a',
        index: 2,
      });
      // a1 is a leaf: inside → after → parent a, index 1
      expect(controller.dropTargetFor(['b'], 'a1', 'inside')).toMatchObject({
        parentKey: 'a',
        index: 1,
      });
    });

    it('dropTargetFor rejects drops onto or into any dragged subtree', () => {
      const { controller } = createController();
      expect(controller.dropTargetFor(['a'], 'a', 'before')).toBeNull(); // onto itself
      expect(controller.dropTargetFor(['a'], 'a2', 'inside')).toBeNull(); // own descendant
      expect(controller.dropTargetFor(['a', 'b'], 'a2x', 'after')).toBeNull(); // inside dragged subtree
      expect(controller.dropTargetFor(['a2'], 'a1', 'after')).toMatchObject({
        parentKey: 'a',
      }); // sibling ok
    });
  });

  describe('selection deltas', () => {
    it('subtreeKeys returns the node plus loaded descendants in DFS order', () => {
      const { controller } = createController();
      expect(controller.subtreeKeys('a')).toEqual(['a', 'a1', 'a2', 'a2x']);
      expect(controller.subtreeKeys('c')).toEqual(['c']); // lazy children not loaded
    });

    it('checkToggleDelta selects from unchecked and indeterminate, deselects from checked', () => {
      const { controller } = createController();

      expect(controller.checkToggleDelta('a', true)).toEqual({
        keys: ['a', 'a1', 'a2', 'a2x'],
        select: true,
      });

      controller.selectedIds.set(new Set(['a1'])); // a → indeterminate
      expect(controller.checkToggleDelta('a', true).select).toBe(true);

      controller.selectedIds.set(new Set(['a', 'a1', 'a2', 'a2x']));
      expect(controller.checkToggleDelta('a', true).select).toBe(false);

      expect(controller.checkToggleDelta('a', false).keys).toEqual(['a']);
    });
  });

  describe('lazy invalidation & cancellation (v2)', () => {
    const child: DemoNode = { id: 'c1', name: 'Lazy Child' };

    it('passes an AbortSignal only to accessors that declare it', async () => {
      const seen: (AbortSignal | undefined)[] = [];
      const twoArg = (node: DemoNode, abort?: AbortSignal) => {
        if (!node.lazy) return node.children;
        seen.push(abort);
        return Promise.resolve([child]);
      };
      const { controller } = createController({
        childrenAccessor: signal(twoArg),
      });
      await controller.ensureChildren('c');
      expect(seen[0]).toBeInstanceOf(AbortSignal);

      // Single-parameter accessor: no signal, no controller allocation.
      let argCount = -1;
      const oneArg = function (node: DemoNode) {
        // eslint-disable-next-line prefer-rest-params
        argCount = arguments.length;
        return node.lazy ? Promise.resolve([child]) : node.children;
      };
      const single = createController({ childrenAccessor: signal(oneArg) });
      await single.controller.ensureChildren('c');
      expect(argCount).toBe(1);
    });

    it('invalidateChildren aborts an in-flight load and clears its state', () => {
      let aborted = 0;
      const accessor = (node: DemoNode, abort?: AbortSignal) => {
        if (!node.lazy) return node.children;
        abort?.addEventListener('abort', () => (aborted += 1));
        return new Promise<DemoNode[]>(() => {}); // never resolves — the abort is the point
      };
      const { controller } = createController({
        childrenAccessor: signal(accessor),
      });

      void controller.ensureChildren('c');
      expect(controller.loadStates().get('c')).toBe('loading');

      expect(controller.invalidateChildren('c')).toEqual(['c']);
      expect(aborted).toBe(1);
      expect(controller.loadStates().get('c')).toBeUndefined(); // never stuck
    });

    it('a stale resolve after invalidation writes nothing (generation guard)', async () => {
      const first = deferred<DemoNode[]>();
      const second = deferred<DemoNode[]>();
      let call = 0;
      const accessor = (node: DemoNode) =>
        node.lazy
          ? (call += 1) === 1
            ? first.promise
            : second.promise
          : node.children;
      const { controller } = createController({
        childrenAccessor: signal(accessor),
      });

      const stale = controller.ensureChildren('c');
      controller.invalidateChildren('c');
      const fresh = controller.ensureChildren('c');

      // The superseded fetch resolves late (consumer ignored the abort) —
      // its result must not overwrite the re-run's.
      first.resolve([{ id: 'stale', name: 'Stale' }]);
      expect((await stale).status).toBe('noop');

      second.resolve([child]);
      expect((await fresh).status).toBe('loaded');
      expect(controller.flat().map.get('c')?.childKeys).toEqual(['c1']);
    });

    it('drops the overlay so the accessor re-runs; tree-wide hits every lazy trace', async () => {
      let calls = 0;
      const accessor = (node: DemoNode) =>
        node.lazy ? ((calls += 1), Promise.resolve([child])) : node.children;
      const { controller } = createController({
        childrenAccessor: signal(accessor),
      });

      await controller.ensureChildren('c');
      expect(controller.flat().map.get('c')?.loaded).toBe(true);
      expect(calls).toBe(1);

      const keys = controller.invalidateChildren();
      expect(keys).toEqual(['c']);
      expect(controller.flat().map.get('c')?.loaded).toBe(false); // overlay gone

      await controller.ensureChildren('c');
      expect(calls).toBe(2); // memo forgotten → fresh accessor run
      expect(controller.flat().map.get('c')?.childKeys).toEqual(['c1']);
    });

    it('abortAll cancels in-flight fetches without touching state', () => {
      let aborted = 0;
      const accessor = (node: DemoNode, abort?: AbortSignal) => {
        if (!node.lazy) return node.children;
        abort?.addEventListener('abort', () => (aborted += 1));
        return new Promise<DemoNode[]>(() => {});
      };
      const { controller } = createController({
        childrenAccessor: signal(accessor),
      });

      void controller.ensureChildren('c');
      controller.abortAll();
      expect(aborted).toBe(1);
      // Destroy-time path: state cleanup is pointless work on a dying tree.
      expect(controller.loadStates().get('c')).toBe('loading');
    });
  });

  describe('defaultFocusedKey (v2)', () => {
    it('seeds focusedId until the first focus write', () => {
      const { controller } = createController({
        defaultFocusedKey: signal<string | undefined>('b'),
      });
      expect(controller.focusedId()).toBe('b');

      controller.focusedId.set('a');
      expect(controller.focusedId()).toBe('a');
    });
  });
});
