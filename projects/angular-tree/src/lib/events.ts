/**
 * Intent event payloads (Phase 0 contract, see ROADMAP.md). The tree is
 * controlled: it never mutates consumer data — it emits these intents and the
 * consumer applies them.
 */

/** Emitted when a drop completes. Consumer moves the nodes in its own data. */
export interface MoveEvent<T> {
  /** Plural by contract: multi-drag-ready even if v1 ships single-drag. */
  readonly dragIds: readonly string[];
  readonly dragNodes: readonly T[];
  /** `null` = root level. */
  readonly parentId: string | null;
  readonly parentNode: T | null;
  /**
   * Insertion index into the target parent's children *as they currently
   * are* — dragged nodes are still present. Remove them first, adjusting the
   * index for any removed sibling that sat before it (react-arborist
   * convention, ROADMAP settled 2026-07-05).
   */
  readonly index: number;
  /**
   * `'copy'` when the platform copy modifier was held at drop time (⌥ on
   * macOS, Ctrl elsewhere — the OS file-manager convention) or the keyboard
   * move was armed with Ctrl/Cmd+C instead of Ctrl/Cmd+X. The consumer
   * duplicates instead of moving; `index` semantics are unchanged (v2,
   * ROADMAP2 settled 2026-07-06).
   */
  readonly dropEffect: 'move' | 'copy';
}

/** Emitted when inline editing commits. Consumer renames in its own data. */
export interface RenameEvent<T> {
  readonly id: string;
  readonly node: T;
  readonly name: string;
}

/**
 * Emitted on every selection interaction (checkbox or ctrl/shift semantics).
 * Fires even when the resulting set is unchanged — re-clicking the already
 * selected row under `clickAction="select"` still identifies itself via
 * `trigger` (`added`/`removed` empty), so "active row" consumers (preview
 * panes) can refocus without guessing from the set.
 */
export interface SelectEvent<T> {
  readonly ids: readonly string[];
  readonly nodes: readonly T[];
  /**
   * The row whose interaction caused this write — present for row-addressed
   * gestures (click, Shift/Ctrl-click, checkbox, Space, `'follow'`-mode focus
   * moves, right-click reconciliation; ranges report the row the gesture
   * ended on). Absent for set-level operations: Ctrl/Cmd+A and the Escape /
   * outside-click clears.
   */
  readonly trigger?: T;
  /** Keys that entered the set with this write (empty on a no-op re-click). */
  readonly added: readonly string[];
  /** Keys that left the set with this write. */
  readonly removed: readonly string[];
}

/** Emitted when a node expands or collapses. */
export interface ToggleEvent<T> {
  readonly id: string;
  readonly node: T;
  readonly expanded: boolean;
}

/**
 * Notification of an async `childrenAccessor` resolution — loading is driven
 * by the accessor itself (ROADMAP settled: no separate `loadChildren` output);
 * this only reports the outcome so consumers can react (telemetry, toasts).
 */
export interface LoadChildrenEvent<T> {
  readonly id: string;
  readonly node: T;
  readonly status: 'loaded' | 'error';
  /** Present when `status` is `'error'`; pair with `tree.retryChildren(node)`. */
  readonly error?: unknown;
}

/**
 * Screen-reader messages for the tree's polite live region (v2, ROADMAP2
 * Phase 9 — announced via CDK `LiveAnnouncer`, no DOM shipped). Every field
 * is optional: omitted fields fall back to terse English defaults; pass the
 * whole input as `null` to silence the tree entirely. Returning `''` from a
 * field suppresses just that announcement.
 */
export interface TreeAnnouncements<T> {
  /** After a completed move/copy (pointer or keyboard). */
  moved?: (event: MoveEvent<T>) => string;
  /** After an async `childrenAccessor` resolves or fails. */
  childrenLoaded?: (event: LoadChildrenEvent<T>) => string;
  /** When the search term or its match count changes (term non-empty). */
  searchResults?: (count: number, term: string) => string;
  /** After Escape clears the selection — a mass deselect is otherwise silent. */
  selectionCleared?: () => string;
}

/**
 * Emitted on right-click / ContextMenu key / Shift+F10 (Phase 7). Selection
 * has already been reconciled per OS convention when this fires.
 */
export interface ContextRequestedEvent<T> {
  /** The full selection the menu should act on. */
  readonly ids: readonly string[];
  /** The row that was invoked. */
  readonly node: T;
  /** Viewport coordinates for overlay positioning. */
  readonly position: { readonly x: number; readonly y: number };
}
