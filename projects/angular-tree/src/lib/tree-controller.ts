import { computed, linkedSignal, Service, signal, Signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { CheckState, TreeChildrenAccessor, TreeExpansionKey } from './types';

/** Outcome of `ensureChildren` — the component maps this to `childrenLoaded`. */
export type LoadResult = { status: 'noop' } | { status: 'loaded' } | { status: 'error'; error: unknown };

/** Where in the hovered row the pointer sits (ROADMAP Phase 4 three-zone). */
export type DropZone = 'before' | 'inside' | 'after';

/** A resolved, guard-validated drop destination (MoveEvent-shaped). */
export interface DropTarget<T> {
  readonly parentKey: string | null;
  readonly parentNode: T | null;
  readonly index: number;
}

/** Pure three-zone math: top 25% → before, middle 50% → inside, bottom 25% → after. */
export function dropZoneAt(offsetInRow: number, itemSize: number): DropZone {
  const ratio = Math.min(Math.max(offsetInRow / itemSize, 0), 1);
  return ratio < 0.25 ? 'before' : ratio < 0.75 ? 'inside' : 'after';
}

/**
 * One node of the internal flat model (react-arborist style). Internal —
 * consumers see only `T` and the template context.
 */
export interface FlatTreeNode<T> {
  readonly node: T;
  readonly key: string;
  readonly parentKey: string | null;
  readonly level: number;
  /** Reports children via `childrenAccessor` (incl. lazy, not-yet-loaded). */
  readonly expandable: boolean;
  /** Children resolved synchronously — `false` means lazy-pending or leaf. */
  readonly loaded: boolean;
  /** Sync-loaded children only; empty for leaves and lazy-pending nodes. */
  readonly childKeys: readonly string[];
  readonly setSize: number;
  readonly posInSet: number;
}

/** A render-ready row: flat node + expansion resolved against search state. */
export interface VisibleTreeNode<T> {
  readonly flat: FlatTreeNode<T>;
  readonly isExpanded: boolean;
}

/** Signals the host component hands over once at construction. */
export interface TreeControllerInputs<T> {
  dataSource: Signal<readonly T[]>;
  childrenAccessor: Signal<TreeChildrenAccessor<T>>;
  expansionKey: Signal<TreeExpansionKey<T>>;
  defaultExpandedKeys: Signal<readonly string[]>;
  defaultFocusedKey: Signal<string | undefined>;
  searchTerm: Signal<string>;
  searchMatch: Signal<((node: T, term: string) => boolean) | undefined>;
}

/**
 * The single source of truth (react-arborist `TreeApi` equivalent): one flat
 * model, one place for expansion/selection/editing/focus state — no event
 * bubbling through nested components. Provided on `AngularTree`, internal-only.
 */
@Service()
export class TreeController<T> {
  #inputs!: TreeControllerInputs<T>;

  /** Must be called exactly once, before any signal is read. */
  connect(inputs: TreeControllerInputs<T>) {
    this.#inputs = inputs;
  }

  // ---------------------------------------------------------------------------
  // Core state
  // ---------------------------------------------------------------------------

  /** Derived from `defaultExpandedKeys` until the first expand/collapse write. */
  readonly expandedIds = linkedSignal<ReadonlySet<string>>(() => new Set(this.#inputs.defaultExpandedKeys()));
  /** Mirror of the consumer's `SelectionModel` (bridged by the component). */
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly editingId = signal<string | null>(null);
  /** Derived from `defaultFocusedKey` until the first focus write (v2). */
  readonly focusedId = linkedSignal<string | null>(() => this.#inputs.defaultFocusedKey() ?? null);

  // ---------------------------------------------------------------------------
  // Lazy loading (virtualization-proof by design: everything lives here,
  // keyed by node key — a row unmounting mid-fetch can't lose anything)
  // ---------------------------------------------------------------------------

  /** Children resolved from async accessors, by node key. */
  readonly #loadedChildren = signal<ReadonlyMap<string, readonly T[]>>(new Map());
  readonly #loadStates = signal<ReadonlyMap<string, 'loading' | 'error'>>(new Map());
  /** Rows read this via per-row computeds (`isLoading`/`hasError` context). */
  readonly loadStates = this.#loadStates.asReadonly();
  /** In-flight dedupe registry — repeat expands await the same promise. */
  readonly #inflight = new Map<string, Promise<LoadResult>>();

  /**
   * Cancellation (v2): one controller per accessor invocation, keyed. Created
   * only when the accessor *declares* the signal parameter (`length >= 2`) —
   * sync single-arg accessors cost nothing across a 100k flatten.
   */
  readonly #abortControllers = new Map<string, AbortController>();

  /**
   * Stale-result guard (v2): `invalidateChildren` bumps the generation, so a
   * superseded fetch that resolves late (consumer ignored the abort signal)
   * can't overwrite fresh state.
   */
  readonly #loadGeneration = new Map<string, number>();

  /**
   * Accessor results memoized per node object. Without this, every `flat()`
   * recompute would re-invoke the accessor — and a Promise-returning accessor
   * *starts a fetch per call*. Memoization inside a computed is a deliberate
   * STYLE.md § computed-purity exception: it exists to keep the accessor
   * idempotent; repeated fetches are the side effect being prevented.
   */
  #rawChildren = new WeakMap<object, ReturnType<TreeChildrenAccessor<T>>>();
  #rawChildrenAccessor: TreeChildrenAccessor<T> | null = null;

  #childrenOf(node: T, key?: string): ReturnType<TreeChildrenAccessor<T>> {
    const accessor = this.#inputs.childrenAccessor();
    if (accessor !== this.#rawChildrenAccessor) {
      this.#rawChildren = new WeakMap();
      this.#rawChildrenAccessor = accessor;
    }

    // Cancellation opt-in: accessors that declare `(node, signal)` get an
    // AbortSignal per invocation; the tree aborts it on destroy and on
    // invalidate-while-in-flight. Single-arg accessors skip the allocation.
    const invoke = () => {
      if (accessor.length < 2) return accessor(node);
      const abortKey = key ?? this.#inputs.expansionKey()(node);
      const controller = new AbortController();
      this.#abortControllers.set(abortKey, controller);
      return accessor(node, controller.signal);
    };

    if (typeof node !== 'object' || node === null) return invoke();

    if (this.#rawChildren.has(node)) return this.#rawChildren.get(node);
    const raw = invoke();
    // A probed-but-never-expanded rejection must not surface as a global
    // unhandled rejection; ensureChildren attaches the real handlers.
    if (raw instanceof Promise) raw.catch(() => undefined);
    this.#rawChildren.set(node, raw);
    return raw;
  }

  /**
   * Resolves an async `childrenAccessor` for `key` exactly once. Keyed to the
   * expand *intent* — rendering never triggers or cancels loads (ROADMAP
   * Phase 3, virtualization-proof lazy loading).
   */
  ensureChildren(key: string): Promise<LoadResult> {
    const entry = this.flat().map.get(key);
    if (!entry || entry.loaded || !entry.expandable) return Promise.resolve({ status: 'noop' });

    const pending = this.#inflight.get(key);
    if (pending) return pending;

    const raw = this.#childrenOf(entry.node, key);
    if (raw == null || Array.isArray(raw)) return Promise.resolve({ status: 'noop' });

    // Array.isArray doesn't narrow `readonly T[]` out of the union (TS quirk).
    const async = raw as Promise<readonly T[]> | Observable<readonly T[]>;

    // A later invalidateChildren bumps the generation: this task's handlers
    // then write nothing — the re-run owns the state.
    const generation = this.#loadGeneration.get(key) ?? 0;
    const isCurrent = () => (this.#loadGeneration.get(key) ?? 0) === generation;

    this.#setLoadState(key, 'loading');
    const task: Promise<LoadResult> = (async instanceof Observable ? firstValueFrom(async) : async).then(
      (children: readonly T[]): LoadResult => {
        if (!isCurrent()) return { status: 'noop' };
        this.#loadedChildren.update((current) => new Map(current).set(key, children));
        this.#setLoadState(key, undefined);
        return { status: 'loaded' };
      },
      (error: unknown): LoadResult => {
        if (!isCurrent()) return { status: 'noop' };
        // Never leave a node stuck in `isLoading` (ROADMAP Phase 3).
        this.#setLoadState(key, 'error');
        return { status: 'error', error };
      },
    );
    task.finally(() => {
      if (this.#inflight.get(key) === task) this.#inflight.delete(key);
    });

    this.#inflight.set(key, task);
    return task;
  }

  /**
   * Lazy invalidation (v2, ROADMAP2 Phase 12): drop the keyed children
   * overlay, forget the memoized accessor result, abort any in-flight fetch,
   * and clear load state — the next `ensureChildren` re-runs the accessor
   * fresh. No key = tree-wide (every key with lazy traces). Returns the
   * affected keys so the component can re-trigger loads for expanded nodes.
   * The tree never fetches: refresh policy stays behind the accessor.
   */
  invalidateChildren(key?: string): readonly string[] {
    const keys =
      key != null
        ? [key]
        : [...new Set([...this.#loadedChildren().keys(), ...this.#inflight.keys(), ...this.#loadStates().keys()])];

    for (const invalidKey of keys) {
      this.#loadGeneration.set(invalidKey, (this.#loadGeneration.get(invalidKey) ?? 0) + 1);
      this.#abortControllers.get(invalidKey)?.abort();
      this.#abortControllers.delete(invalidKey);
      this.#inflight.delete(invalidKey);
      const node = this.flat().map.get(invalidKey)?.node;
      if (node != null && typeof node === 'object') this.#rawChildren.delete(node);
      this.#setLoadState(invalidKey, undefined);
    }
    // One overlay write for the batch — a tree-wide invalidate over many
    // loaded subtrees must not re-flatten once per key.
    this.#loadedChildren.update((current) => {
      const next = new Map(current);
      for (const invalidKey of keys) next.delete(invalidKey);
      return next;
    });
    return keys;
  }

  /** Destroy-time cancellation — abort everything, touch no state. */
  abortAll(): void {
    this.#abortControllers.forEach((controller) => controller.abort());
    this.#abortControllers.clear();
  }

  /** Clears the error state and re-runs the accessor with a fresh call. */
  retryChildren(key: string): Promise<LoadResult> {
    const entry = this.flat().map.get(key);
    if (entry && typeof entry.node === 'object' && entry.node !== null) {
      this.#rawChildren.delete(entry.node); // memoized rejection must not be retried into
    }
    this.#setLoadState(key, undefined);
    return this.ensureChildren(key);
  }

  #setLoadState(key: string, state: 'loading' | 'error' | undefined) {
    this.#loadStates.update((current) => {
      const next = new Map(current);
      if (state) next.set(key, state);
      else next.delete(key);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Flat model
  // ---------------------------------------------------------------------------

  /** Full loaded model in DFS pre-order (expansion-independent). */
  readonly flat = computed(() => {
    const key = this.#inputs.expansionKey();
    const asyncLoaded = this.#loadedChildren();
    const list: FlatTreeNode<T>[] = [];
    const map = new Map<string, FlatTreeNode<T>>();

    const visit = (nodes: readonly T[], parentKey: string | null, level: number): string[] =>
      nodes.map((node, i) => {
        const nodeKey = key(node);
        const raw = this.#childrenOf(node, nodeKey);
        // Async accessor results are overlaid by key, so lazy-resolved
        // children flatten exactly like sync ones from here on.
        const childNodes = Array.isArray(raw) ? (raw as readonly T[]) : asyncLoaded.get(nodeKey);
        const loaded = childNodes != null;
        const entry: FlatTreeNode<T> = {
          node,
          key: nodeKey,
          parentKey,
          level,
          expandable: raw != null,
          loaded,
          setSize: nodes.length,
          posInSet: i + 1,
          childKeys: [],
        };
        list.push(entry);
        map.set(nodeKey, entry);
        if (loaded) {
          // Pre-order invariant: children append *after* their parent, so a
          // reverse pass sees children first (checkStates depends on this).
          // Single mutation before the entry is published anywhere.
          (entry as { childKeys: readonly string[] }).childKeys = visit(childNodes, nodeKey, level + 1);
        }
        return nodeKey;
      });

    const rootKeys = visit(this.#inputs.dataSource(), null, 0);
    return { list, map, rootKeys };
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Keys visible under the current search, or `null` when search is inactive.
   * A match keeps its full ancestor chain visible (react-arborist behavior);
   * expansion state is never mutated — clearing the term restores it intact.
   */
  readonly searchVisibleIds = computed<ReadonlySet<string> | null>(() => {
    const term = this.#inputs.searchTerm();
    const match = this.#inputs.searchMatch();
    if (!term || !match) return null; // no matcher = search inert (ROADMAP settled)

    const { list, map } = this.flat();
    const visible = new Set<string>();
    for (const entry of list) {
      if (!match(entry.node, term)) continue;
      for (
        let current: FlatTreeNode<T> | undefined = entry;
        current && !visible.has(current.key);
        current = current.parentKey != null ? map.get(current.parentKey) : undefined
      ) {
        visible.add(current.key);
      }
    }
    return visible;
  });

  /** True matches under the current term (ancestors excluded), or `null` when search is inert. */
  readonly searchMatchCount = computed<number | null>(() => {
    const term = this.#inputs.searchTerm();
    const match = this.#inputs.searchMatch();
    if (!term || !match) return null;
    let count = 0;
    for (const entry of this.flat().list) if (match(entry.node, term)) count += 1;
    return count;
  });

  /** The 1D render array: collapsed subtrees skipped, search filter applied. */
  readonly visibleNodes = computed<readonly VisibleTreeNode<T>[]>(() => {
    const { map, rootKeys } = this.flat();
    const expanded = this.expandedIds();
    const searchIds = this.searchVisibleIds();
    const out: VisibleTreeNode<T>[] = [];

    const visit = (keys: readonly string[]) => {
      for (const key of keys) {
        const flat = map.get(key)!;
        if (searchIds && !searchIds.has(key)) continue;
        // Ancestors of matches render force-expanded while searching.
        const isExpanded = flat.expandable && (searchIds ? true : expanded.has(key));
        out.push({ flat, isExpanded });
        if (isExpanded) visit(flat.childKeys);
      }
    };

    visit(rootKeys);
    return out;
  });

  // ---------------------------------------------------------------------------
  // Checkbox states
  // ---------------------------------------------------------------------------

  /**
   * Single reverse pass, children before parents (DFS pre-order reversed):
   * O(n) per selection change, never per node. Rows must read through a
   * per-row `computed` so string equality stops propagation (ROADMAP Phase 1).
   */
  readonly checkStates = computed<ReadonlyMap<string, CheckState>>(() => {
    const { list } = this.flat();
    const selected = this.selectedIds();
    const states = new Map<string, CheckState>();

    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (entry.childKeys.length === 0) {
        // Leaves and lazy-pending nodes carry their own selection —
        // cascade covers *loaded* nodes only (ROADMAP non-goal).
        states.set(entry.key, selected.has(entry.key) ? 'checked' : 'unchecked');
        continue;
      }

      let checked = 0;
      let indeterminate = false;
      for (const childKey of entry.childKeys) {
        const state = states.get(childKey);
        if (state === 'checked') checked += 1;
        else if (state === 'indeterminate') indeterminate = true;
      }
      states.set(
        entry.key,
        indeterminate || (checked > 0 && checked < entry.childKeys.length)
          ? 'indeterminate'
          : checked === entry.childKeys.length
            ? 'checked'
            : 'unchecked',
      );
    }
    return states;
  });

  // ---------------------------------------------------------------------------
  // Mutations (the component bridges selection to the consumer's SelectionModel)
  // ---------------------------------------------------------------------------

  setExpanded(key: string, value: boolean) {
    this.expandedIds.update((current) => {
      const next = new Set(current);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  expandAll() {
    this.expandedIds.set(
      new Set(
        this.flat()
          .list.filter((entry) => entry.loaded)
          .map((entry) => entry.key),
      ),
    );
  }

  collapseAll() {
    this.expandedIds.set(new Set());
  }

  expandWithDescendants(key: string) {
    const { map } = this.flat();
    const keys = new Set(this.expandedIds());
    const visit = (k: string) => {
      const entry = map.get(k);
      if (!entry?.loaded) return; // lazy subtree: Phase 3 decides load-on-expand-all
      keys.add(k);
      entry.childKeys.forEach(visit);
    };
    visit(key);
    this.expandedIds.set(keys);
  }

  /** `key` + every loaded descendant, in DFS order. */
  subtreeKeys(key: string): readonly string[] {
    const { map } = this.flat();
    const out: string[] = [];
    const visit = (k: string) => {
      const entry = map.get(k);
      if (!entry) return;
      out.push(k);
      entry.childKeys.forEach(visit);
    };
    visit(key);
    return out;
  }

  /**
   * What a checkbox toggle must do given the current tri-state: indeterminate
   * and unchecked both select the subtree (ARIA checkbox-tree convention).
   */
  checkToggleDelta(key: string, cascade: boolean): { keys: readonly string[]; select: boolean } {
    const select = (this.checkStates().get(key) ?? 'unchecked') !== 'checked';
    return { keys: cascade ? this.subtreeKeys(key) : [key], select };
  }

  // ---------------------------------------------------------------------------
  // Drag & drop math (Phase 4)
  // ---------------------------------------------------------------------------

  /**
   * Which keys travel when a drag starts on `pressedKey`: the whole selection
   * if the pressed row is part of it (react-arborist), otherwise just the
   * pressed row (selection untouched — Gmail semantics). Redundancy pruned:
   * a key with a selected ancestor rides along anyway. DFS order — first key
   * is the stable preview representative.
   */
  dragKeysFor(pressedKey: string): readonly string[] {
    const selected = this.selectedIds();
    if (!selected.has(pressedKey)) return [pressedKey];

    const { list, map } = this.flat();
    const out: string[] = [];
    for (const entry of list) {
      if (!selected.has(entry.key)) continue;
      let ancestorSelected = false;
      for (let parent = entry.parentKey; parent != null; parent = map.get(parent)!.parentKey) {
        if (selected.has(parent)) {
          ancestorSelected = true;
          break;
        }
      }
      if (!ancestorSelected) out.push(entry.key);
    }
    return out;
  }

  /**
   * Resolves hovered row + zone into a `MoveEvent`-shaped destination, or
   * `null` when forbidden: dropping onto a dragged row, or anywhere inside a
   * dragged subtree (every dragged id is checked — multi-drag contract).
   * `inside` on a non-expandable row degrades to `after` (react-arborist).
   */
  dropTargetFor(dragKeys: readonly string[], targetKey: string, zone: DropZone): DropTarget<T> | null {
    const { map } = this.flat();
    const target = map.get(targetKey);
    if (!target) return null;

    const dragged = new Set(dragKeys);
    if (dragged.has(target.key)) return null;

    const effectiveZone: DropZone = zone === 'inside' && !target.expandable ? 'after' : zone;
    const parentKey = effectiveZone === 'inside' ? target.key : target.parentKey;
    for (let key: string | null = parentKey; key != null; key = map.get(key)!.parentKey) {
      if (dragged.has(key)) return null;
    }

    if (effectiveZone === 'inside') {
      return { parentKey: target.key, parentNode: target.node, index: target.childKeys.length };
    }

    const parent = target.parentKey != null ? map.get(target.parentKey)! : null;
    const base = target.posInSet - 1; // 0-based among current siblings
    return {
      parentKey: parent?.key ?? null,
      parentNode: parent?.node ?? null,
      index: effectiveZone === 'before' ? base : base + 1,
    };
  }

  nodesForKeys(keys: Iterable<string>): readonly T[] {
    const { map } = this.flat();
    const out: T[] = [];
    for (const key of keys) {
      const entry = map.get(key);
      if (entry) out.push(entry.node);
    }
    return out;
  }
}
