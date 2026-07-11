/**
 * Keyboard map (ROADMAP Phase 3 + APG optional keys). Pure interpreter:
 * `(event, context) → command union`, dispatched in the component's single
 * exhaustive `switch` — the map is testable without a DOM. RTL arrows are
 * normalized here so the map stays direction-free.
 * CDK touchpoints: none — the component samples `Directionality` and the
 * viewport's page size into the context before calling in.
 */

/** Everything the key map needs to know — values, not signals or `this`. */
export interface TreeKeyContext {
  readonly rtl: boolean;
  readonly multi: boolean;
  readonly enterAction: 'activate' | 'edit';
  /** `selectionMode() === 'follow'` — arrow focus replaces the selection. */
  readonly followSelection: boolean;
  readonly hasMoveMark: boolean;
  readonly hasSelection: boolean;
  /** Focused row's index in the visible flat array. */
  readonly index: number;
  readonly rowCount: number;
  /** Viewport rows per PageUp/Down jump, ≥ 1 (layoutless envs report 0). */
  readonly pageStep: number;
  readonly rowExpandable: boolean;
  readonly rowExpanded: boolean;
  /** The next visible row is a child of the focused one. */
  readonly hasChildBelow: boolean;
}

/**
 * What a keypress means. Every command except `typeahead` consumes the event
 * (`preventDefault`); `null` leaves it entirely to the browser — an
 * unconsumed Escape must bubble so an enclosing dialog still closes.
 */
export type TreeKeyCommand =
  | { readonly kind: 'markMove'; readonly effect: 'move' | 'copy' }
  | { readonly kind: 'keyboardDrop'; readonly zone: 'inside' | 'after' }
  | { readonly kind: 'selectAllVisible' }
  | { readonly kind: 'selectToEdge'; readonly index: number }
  | { readonly kind: 'clearMoveMark' }
  | { readonly kind: 'clearSelection' }
  | { readonly kind: 'focusStep'; readonly index: number; readonly extend: boolean; readonly follow: boolean }
  | { readonly kind: 'focusIndex'; readonly index: number }
  | { readonly kind: 'expandRow' }
  | { readonly kind: 'collapseRow' }
  | { readonly kind: 'focusParent' }
  | { readonly kind: 'openContextMenu' }
  | { readonly kind: 'activate' }
  | { readonly kind: 'beginEdit' }
  | { readonly kind: 'toggleSelection'; readonly range: boolean }
  /** Consume the event without acting (e.g. ArrowRight on an expanded, childless row). */
  | { readonly kind: 'consume' }
  | { readonly kind: 'typeahead'; readonly char: string };

export function interpretTreeKey(event: KeyboardEvent, ctx: TreeKeyContext): TreeKeyCommand | null {
  // Keyboard move: Ctrl+X marks a move, Ctrl+C marks a copy (v2 dropEffect),
  // Ctrl+V drops into, Ctrl+Shift+V drops after. Multi-select (APG optional
  // keys): Ctrl+A selects all visible (again = clear), Ctrl+Shift+Home/End
  // range-selects to the edge and moves focus there.
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const combo = event.key.toLowerCase();
    if (combo === 'x' || combo === 'c') {
      return { kind: 'markMove', effect: combo === 'c' ? 'copy' : 'move' };
    }
    if (combo === 'v') return { kind: 'keyboardDrop', zone: event.shiftKey ? 'after' : 'inside' };
    if (combo === 'a' && ctx.multi) return { kind: 'selectAllVisible' };
    if (event.shiftKey && (combo === 'home' || combo === 'end') && ctx.multi) {
      return { kind: 'selectToEdge', index: combo === 'home' ? 0 : ctx.rowCount - 1 };
    }
    return null;
  }

  // Escape ladder — one layer per press: cancel move-mark, then clear the
  // selection (Finder/Explorer; focus STAYS on the row — APG requires a
  // visible active element).
  if (event.key === 'Escape') {
    if (ctx.hasMoveMark) return { kind: 'clearMoveMark' };
    if (ctx.hasSelection) return { kind: 'clearSelection' };
    return null;
  }

  // Normalize horizontal arrows so the switch stays direction-free (RTL
  // flips expand/collapse — ROADMAP Phase 3).
  const key =
    event.key === 'ArrowRight'
      ? ctx.rtl
        ? 'collapse'
        : 'expand'
      : event.key === 'ArrowLeft'
        ? ctx.rtl
          ? 'expand'
          : 'collapse'
        : event.key;

  switch (key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      // APG: Shift+Arrow extends the selection to the newly focused node.
      const extend = event.shiftKey && ctx.multi;
      return {
        kind: 'focusStep',
        index: key === 'ArrowDown' ? ctx.index + 1 : ctx.index - 1,
        extend,
        follow: !extend && ctx.followSelection,
      };
    }
    case 'expand':
      if (!ctx.rowExpandable) return null;
      if (!ctx.rowExpanded) return { kind: 'expandRow' };
      if (ctx.hasChildBelow) return { kind: 'focusIndex', index: ctx.index + 1 };
      return { kind: 'consume' };
    case 'collapse':
      return ctx.rowExpandable && ctx.rowExpanded ? { kind: 'collapseRow' } : { kind: 'focusParent' };
    case 'ContextMenu':
      // The caller's preventDefault also suppresses the browser's synthetic
      // `contextmenu` event — no double emission with the pointer path.
      return { kind: 'openContextMenu' };
    case 'F10':
      return event.shiftKey ? { kind: 'openContextMenu' } : null;
    case 'Home':
      return { kind: 'focusIndex', index: 0 };
    case 'End':
      return { kind: 'focusIndex', index: ctx.rowCount - 1 };
    case 'PageDown':
      return { kind: 'focusIndex', index: ctx.index + ctx.pageStep };
    case 'PageUp':
      return { kind: 'focusIndex', index: ctx.index - ctx.pageStep };
    case 'Enter':
      return ctx.enterAction === 'edit' ? { kind: 'beginEdit' } : { kind: 'activate' };
    case ' ':
      // APG Shift+Space: contiguous selection from the anchor — same range
      // semantics as shift-click; a plain Space (or no anchor yet) toggles.
      return { kind: 'toggleSelection', range: event.shiftKey };
    default:
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return null;
      return { kind: 'typeahead', char: event.key };
  }
}

/**
 * Type-ahead accumulator — cleared after a pause (aria-tree convention).
 * A class per STYLE.md § Feature Engines: it owns a timer, nothing else.
 */
export class TypeaheadBuffer {
  #buffer = '';
  #timer: ReturnType<typeof setTimeout> | undefined;

  /** Appends a char and returns the accumulated lowercase prefix. */
  push(char: string): string {
    clearTimeout(this.#timer);
    this.#buffer += char.toLowerCase();
    this.#timer = setTimeout(() => (this.#buffer = ''), 500);
    return this.#buffer;
  }
}

/** Prefix match starting after `index`, wrapping over the whole array. */
export function typeaheadTarget<R>(
  rows: readonly R[],
  index: number,
  prefix: string,
  textOf: (row: R) => string,
): R | null {
  for (let offset = 1; offset <= rows.length; offset++) {
    const candidate = rows[(index + offset) % rows.length];
    if (textOf(candidate).toLowerCase().startsWith(prefix)) return candidate;
  }
  return null;
}
