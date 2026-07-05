import { InjectionToken } from '@angular/core';
import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';

/** Tri-state of a row under `checkboxSelection` (ARIA checkbox-tree pattern). */
export type CheckState = 'checked' | 'unchecked' | 'indeterminate';

/**
 * Template context for `treeNodeDef`. `S` narrows to the union member matched
 * by a type-guard `when` predicate (Phase 0 spike, see ROADMAP.md).
 */
export interface TreeNodeContext<S> {
  $implicit: S;
  /** The node's `expansionKey` — parity with PrimeNG/jsTree templates (v2). */
  key: string;
  /** Zero-based depth in the flattened model. */
  level: number;
  /** Whether the node reports children via `childrenAccessor`. */
  expandable: boolean;
  isExpanded: boolean;
  /** Index within the visible flat array. */
  index: number;
  /** Row is in the `SelectionModel` (checkbox or ctrl/shift semantics). */
  isSelected: boolean;
  /** Row is being renamed — consumer renders its input (tree owns state only). */
  isEditing: boolean;
  /** Async `childrenAccessor` in flight for this node. */
  isLoading: boolean;
  /** Async `childrenAccessor` rejected — pair with `tree.retryChildren(node)`. */
  hasError: boolean;
  /**
   * Tri-state under `checkboxSelection` — drives the icon-as-checkbox swap
   * (icon while `'unchecked'`, checkbox visual otherwise) in consumer templates.
   */
  checkState: CheckState;
}

/**
 * Per-row handle injected into node content (e.g. `treeNodeToggle`).
 * Row-scoped counterpart to the tree-level `TreeApi`.
 */
export interface TreeNodeHandle {
  readonly expandable: boolean;
  /** Per-row signals: equality stops propagation — DOM updates stay O(visible). */
  readonly isSelected: Signal<boolean>;
  readonly checkState: Signal<CheckState>;
  toggle(): void;
  /**
   * Cascades over the loaded subtree when `checkboxSelection` is on.
   * `range = true` (Shift+checkbox, v2): additive range from the selection
   * anchor over visible order instead of a toggle.
   */
  toggleSelection(range?: boolean): void;
  /** Starts inline rename (respects `disableEdit`) — the row-scoped `edit()`. */
  beginEdit(): void;
  /** Ends editing and emits the `renamed` intent (no-op unless editing). */
  commitEdit(name: string): void;
  /** Ends editing without emitting. */
  cancelEdit(): void;
}

/** DI token providing the row's {@link TreeNodeHandle} to content directives. */
export const TREE_NODE = new InjectionToken<TreeNodeHandle>('TREE_NODE');

/**
 * Accessor contracts (Material `CdkTree` pattern — no forced node shape).
 * An async return (`Promise`/`Observable`) marks the node lazy: the tree sets
 * `isLoading` in the row context until it resolves (ROADMAP Phase 3).
 *
 * Cancellation (v2) is opt-in by declaring the second parameter: accessors
 * written as `(node, signal) => fetch(url, { signal })` get an `AbortSignal`
 * the tree aborts on destroy and on `invalidateChildren` while in flight
 * (incl. collapse under `collapseBehavior: 'invalidate'`). Single-parameter
 * accessors are detected via `Function.length` and skip the allocation —
 * note that default/rest parameters reduce `length` and would opt out too.
 */
export type TreeChildrenAccessor<T> = (
  node: T,
  signal?: AbortSignal,
) => readonly T[] | null | undefined | Promise<readonly T[]> | Observable<readonly T[]>;
export type TreeExpansionKey<T> = (node: T) => string;

/** Argument to the `disableDrop` predicate (Phase 4 three-zone drop math). */
export interface TreeDropContext<T> {
  readonly dragNodes: readonly T[];
  /** `null` = root level. */
  readonly parentNode: T | null;
  readonly index: number;
}
