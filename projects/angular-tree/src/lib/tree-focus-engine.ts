import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  Service,
  Signal,
  untracked,
} from '@angular/core';

import { TreeController } from './tree-controller';
import { rowElement } from './tree-dom';

/** Signals the host component hands over once at construction. */
export interface TreeFocusEngineInputs {
  viewport: Signal<CdkVirtualScrollViewport>;
  focusMode: Signal<'roving' | 'activedescendant'>;
}

/**
 * Controller-driven focus (ROADMAP Phase 3 decision): `focusedId` over the
 * flat model — not DOM-driven `FocusKeyManager`, which can't target rows
 * virtualization hasn't rendered. Owns the lifecycle STYLE.md assigns to an
 * engine: frame-aligned focus retry chases (Phase 8 matrix bug #4), the
 * focus-retention effect across data replacement (Phase 9), and the
 * tree-owns-focus flag behind it.
 * CDK touchpoints: `CdkVirtualScrollViewport` (`scrollToIndex`,
 * `getRenderedRange`); `afterNextRender` against this component's injector.
 */
// autoProvided: false — this is per-tree component state, not an app-wide
// singleton. Without it, @Service() lazily registers a root provider, and an
// accidental inject() outside a tree would mint a broken, never-connect()ed
// instance instead of failing fast; the component's providers list is the
// only acquisition path.
@Service({ autoProvided: false })
export class TreeFocusEngine<T = unknown> {
  readonly #controller = inject<TreeController<T>>(TreeController);
  readonly #injector = inject(Injector);
  readonly #host: HTMLElement = inject(ElementRef).nativeElement;

  #inputs!: TreeFocusEngineInputs;

  /** Must be called exactly once, before any signal is read. */
  connect(inputs: TreeFocusEngineInputs) {
    this.#inputs = inputs;
  }

  /** Visible keys as a set — focus fallback + retention lookups (v2). */
  readonly #visibleKeySet = computed(() => new Set(this.#controller.visibleNodes().map((visible) => visible.flat.key)));

  /**
   * Until the user moves focus — also when `focusedId` names a hidden or
   * unknown row (bad `defaultFocusedKey`, collapsed-away ancestor) — the Tab
   * target falls back to the first *selected* visible row (APG: a tree with a
   * selection receives focus on it), then to the first row: the tree must
   * never lose its Tab target.
   */
  readonly effectiveFocusKey = computed(() => {
    const id = this.#controller.focusedId();
    if (id != null && this.#visibleKeySet().has(id)) return id;

    const nodes = this.#controller.visibleNodes();
    const selected = this.#controller.selectedIds();

    if (selected.size > 0) {
      const row = nodes.find((node) => selected.has(node.flat.key));
      if (row) return row.flat.key;
    }

    return nodes[0]?.flat.key ?? null;
  });

  constructor() {
    // Focus retention across data replacement (v2, ROADMAP2 Phase 9): when
    // the consumer swaps dataSource (immutable updates) or overlays change,
    // the focused row's DOM is destroyed and browser focus silently dies.
    // Re-attach it to the same key — or, when the key vanished (delete,
    // move-to-trash), to the nearest survivor in the previous visible order
    // (following first, then preceding — ends at the parent naturally).
    effect(() => {
      const visible = this.#controller.visibleNodes();
      untracked(() => this.#retainFocus(visible));
    });
  }

  /**
   * Focus a row that may not be rendered yet: scroll it into the viewport,
   * then focus its DOM after the next render (ROADMAP: `afterNextRender` +
   * `data-node-id` query).
   */
  focusKey(key: string) {
    this.#controller.focusedId.set(key);

    const index = this.#controller.visibleNodes().findIndex(({ flat }) => flat.key === key);
    if (index < 0) return;
    const viewport = this.#inputs.viewport();
    const range = viewport.getRenderedRange();
    if (index < range.start || index >= range.end) viewport.scrollToIndex(index);

    // activedescendant mode: DOM focus stays on the tree — aria-activedescendant
    // (bound to focusedId) does the announcing; no per-row focus dance.
    if (this.#inputs.focusMode() === 'activedescendant') return;

    // Far jumps (End/Home, `focus()` API) race CDK's re-render: scrollToIndex
    // materializes the target row asynchronously, so a single next-render
    // query can miss it — focus then dies with the recycled source row
    // (Phase 8 matrix find; jsdom's layoutless viewport can't reproduce it).
    // Retry frame-aligned until the row DOM exists; a newer request wins.
    this.#focusAttempt = key;
    afterNextRender(() => this.#attemptFocus(key, 16), { injector: this.#injector });
  }

  /** Keeps `focusedId` + focus ownership in sync when focus arrives via Tab or pointer. */
  handleFocusIn(event: FocusEvent) {
    this.#treeOwnsFocus = true;
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
    if (key != null) this.#controller.focusedId.set(key);
  }

  /**
   * Focus-ownership bookkeeping for retention (v2). Only a focusout with a
   * real outside destination clears the flag: when the browser drops focus
   * because the focused row's DOM was destroyed, no event fires at all —
   * that's exactly the orphaning retention exists to repair. Outside
   * pointer-downs clear it too (`disownFocus`): clicking a non-focusable area
   * emits focusout with a null relatedTarget, which is indistinguishable from
   * destruction by events alone.
   */
  handleFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as HTMLElement | null;
    if (next != null && !this.#host.contains(next)) this.#treeOwnsFocus = false;
  }

  /** An outside pointer-down means the user left the tree — retention stands down. */
  disownFocus() {
    this.#treeOwnsFocus = false;
  }

  #treeOwnsFocus = false;

  /** Previous visible order — the neighborhood a vanished focus falls back into. */
  #prevVisibleKeys: readonly string[] = [];

  #retainFocus(visible: readonly { flat: { key: string } }[]) {
    const keys = visible.map((entry) => entry.flat.key);
    const prev = this.#prevVisibleKeys;
    this.#prevVisibleKeys = keys;

    if (prev.length === 0 || !this.#treeOwnsFocus) return;
    if (this.#inputs.focusMode() === 'activedescendant') return; // DOM focus never leaves the tree
    const focused = this.#controller.focusedId();
    if (focused == null) return;

    const current = new Set(keys);
    let target: string | null = focused;
    if (!current.has(focused)) {
      const at = prev.indexOf(focused);
      if (at < 0) return;
      target = null;
      for (let i = at + 1; i < prev.length && target == null; i++) {
        if (current.has(prev[i])) target = prev[i];
      }
      for (let i = at - 1; i >= 0 && target == null; i--) {
        if (current.has(prev[i])) target = prev[i];
      }
      if (target == null) return; // nothing survived — empty tree, no focus to keep
    }

    const key = target;
    afterNextRender(
      () => {
        if (!this.#treeOwnsFocus) return;
        const doc = this.#host.ownerDocument;
        const active = doc.activeElement as HTMLElement | null;
        const activeKey = active?.closest<HTMLElement>('[data-node-id]')?.dataset['nodeId'];
        // Focus survived on the right row → hands off. Anything else while we
        // own focus is orphaning: body (row destroyed) or a recycled row
        // element now showing a different node under the caret.
        if (active != null && this.#host.contains(active) && activeKey === key) return;
        if (active == null || active === doc.body || this.#host.contains(active)) {
          this.focusKey(key);
        }
      },
      { injector: this.#injector },
    );
  }

  /** The focus target currently being chased across virtual re-renders. */
  #focusAttempt: string | null = null;

  #attemptFocus(key: string, retries: number) {
    if (this.#focusAttempt !== key) return; // superseded
    const row = rowElement(this.#host, key);
    if (row) {
      row.focus();
      this.#focusAttempt = null;
      return;
    }
    if (retries === 0) {
      this.#focusAttempt = null; // row left the visible set (collapse/filter) — give up quietly
      return;
    }
    requestAnimationFrame(() => this.#attemptFocus(key, retries - 1));
  }
}
