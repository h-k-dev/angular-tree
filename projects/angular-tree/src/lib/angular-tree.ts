import { NgTemplateOutlet } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Directionality } from '@angular/cdk/bidi';
import { SelectionModel } from '@angular/cdk/collections';
import { CdkDrag, CdkDragMove, CdkDragPreview, CdkDropList } from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger, CdkMenu } from '@angular/cdk/menu';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  Signal,
  signal,
  TemplateRef,
  TrackByFunction,
  untracked,
  viewChild,
} from '@angular/core';
import type { ListRange } from '@angular/cdk/collections';

import type {
  ContextRequestedEvent,
  LoadChildrenEvent,
  MoveEvent,
  RenameEvent,
  SelectEvent,
  ToggleEvent,
  TreeAnnouncements,
} from './events';
import { DropTarget, dropZoneAt, LoadResult, TreeController } from './tree-controller';
import { TreeContextMenu, TreeContextMenuContext } from './tree-context-menu';
import { TreeNodeDef } from './tree-node-def';
import { TreeEmptyDef, TreeLoadingDef } from './tree-state-def';
import {
  TREE_NODE,
  TreeChildrenAccessor,
  TreeDropContext,
  TreeExpansionKey,
  TreeNodeContext,
  TreeNodeHandle,
} from './types';

/** DOM-id mint for aria-activedescendant (static #private + decorators = TS18036). */
let nextTreeUid = 0;

/** Attribute-value escape for `[data-node-id="…"]` queries — CSS.escape is absent in jsdom. */
function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** One entry of the visible flat render array. Internal. */
interface FlatRow<T> {
  readonly node: T;
  readonly key: string;
  readonly level: number;
  readonly expandable: boolean;
  readonly setSize: number;
  readonly posInSet: number;
  /** Roving tabindex: 0 on the (effective) focused row, -1 elsewhere. */
  readonly tabIndex: Signal<number>;
  /** Row is marked by Ctrl+X, awaiting a keyboard drop. */
  readonly moveSource: Signal<boolean>;
  /** Tri-state for `aria-checked` under `checkboxSelection`. */
  readonly checkState: Signal<'checked' | 'unchecked' | 'indeterminate'>;
  readonly dragDisabled: boolean;
  readonly context: TreeNodeContext<T>;
  readonly injector: Injector;
}

/** One expanded group's guide span over the *visible* flat array. Internal. */
interface GuideGroup {
  /** Key of the expanded parent the guide belongs to. */
  readonly key: string;
  readonly level: number;
  /** First / last visible-row index the guide spans (the parent's descendants). */
  readonly start: number;
  readonly end: number;
}

/** A guide clamped to the rendered range, in content-wrapper px. Internal. */
interface GuideOverlay {
  readonly key: string;
  readonly level: number;
  readonly top: number;
  readonly height: number;
}

/** Purely visual drop marker — never reorders DOM mid-drag (ROADMAP Phase 4). */
interface DropIndicator {
  /** Viewport-relative px (the indicator overlays the viewport, not the content). */
  readonly top: number;
  readonly height: number;
  readonly inside: boolean;
  readonly level: number;
}

/**
 * Virtualized tree. Consumer data stays untouched — `childrenAccessor` +
 * `expansionKey` describe it (Material `CdkTree` pattern). Rendering is a flat
 * virtual list (react-arborist internals); all state lives in the internal
 * `TreeController` (one source of truth, no event bubbling). See ROADMAP.md.
 */
@Component({
  selector: 'angular-tree',
  exportAs: 'angularTree',
  imports: [ScrollingModule, NgTemplateOutlet, CdkDrag, CdkDragPreview, CdkDropList, CdkMenu],
  providers: [TreeController],
  // The built-in context-menu trigger (ROADMAP 2026-07-06). The tree drives it
  // explicitly via #openMenu (threading the triggering event so it can't
  // self-close); the trigger stays disabled at rest so its own contextmenu
  // listener never opens a stale menu. Inert without a projected treeContextMenu.
  hostDirectives: [CdkContextMenuTrigger],
  host: {
    // Row height, republished as a read-only CSS variable: consumer templates
    // size their row content (toggle targets, spacers) from the SAME source
    // as the scroll strategy instead of repeating the number in CSS.
    '[style.--tree-row-height]': 'itemSize() + "px"',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './angular-tree.html',
  styleUrl: './angular-tree.scss',
})
export class AngularTree<T> {
  readonly #injector = inject(Injector);
  readonly #controller = inject<TreeController<T>>(TreeController);

  /** Roots of the nested consumer data. The consumer owns it (controlled). */
  readonly dataSource = input.required<readonly T[]>();
  /** Returns a node's children; `null`/`undefined` marks a leaf, async = lazy. */
  readonly childrenAccessor = input.required<TreeChildrenAccessor<T>>();
  /** Stable string key per node — expansion, trackBy, DOM marking. */
  readonly expansionKey = input.required<TreeExpansionKey<T>>();
  /** Fixed row height in px — required for virtualization. */
  readonly itemSize = input(32);
  /** Keys expanded on first render (restore-on-load, ROADMAP settled). */
  readonly defaultExpandedKeys = input<readonly string[]>([]);

  /** Initial roving-tabindex target (v2) — unknown keys fall back to row 1. */
  readonly defaultFocusedKey = input<string | undefined>(undefined);

  /**
   * What collapse does to a lazy node's resolved children (v2): `'keep'`
   * reuses them on re-expand; `'invalidate'` drops the overlay and aborts an
   * in-flight load, so the next expand re-runs the accessor.
   */
  readonly collapseBehavior = input<'keep' | 'invalidate'>('keep');

  /**
   * Consumer-owned CDK `SelectionModel` over node keys. The tree drives
   * range/cascade semantics (only it knows the visible flat order) but never
   * owns the model — changes flow both ways through the bridge effect.
   */
  readonly selection = input<SelectionModel<string> | undefined>(undefined);
  /** Multi-selection (naming aligned with `@angular/aria/tree`). */
  readonly multi = input(false);
  /**
   * Clear the selection when the user clicks outside any row — empty viewport
   * space or outside the tree (file-manager semantics). Clicks inside CDK
   * overlays (context menu, dialogs) never clear: their actions operate ON
   * the selection. Turn off when a toolbar outside the tree acts on the
   * selection, or manage clearing yourself.
   */
  readonly deselectOnOutsideClick = input(true);
  /** Cascade checkbox semantics over *loaded* nodes (ROADMAP settled). */
  readonly checkboxSelection = input(false);
  /** Matching child keeps its ancestor chain visible (react-arborist behavior). */
  readonly searchTerm = input('');
  /** Required for search — `T` has no shape to match against (ROADMAP settled). */
  readonly searchMatch = input<((node: T, term: string) => boolean) | undefined>(undefined);
  /** Required for type-ahead — same rationale as `searchMatch`; inert without it. */
  readonly typeaheadText = input<((node: T) => string) | undefined>(undefined);
  /** What Enter does on the focused row. */
  readonly enterAction = input<'activate' | 'edit'>('activate');

  /**
   * Accessible name for the `role="tree"` element (APG: a tree MUST be
   * labelled). Forwarded to the internal viewport — the role doesn't sit on
   * the host, so a plain host attribute would be invisible to AT. Prefer
   * `aria-labelledby` pointing at a visible heading; `aria-label` otherwise.
   */
  readonly ariaLabel = input<string | undefined>(undefined, { alias: 'aria-label' });
  /** id of a visible element labelling the tree — wins over `aria-label`. */
  readonly ariaLabelledby = input<string | undefined>(undefined, { alias: 'aria-labelledby' });

  /**
   * What a plain row click does (v2, reopened v1 lock — ROADMAP2 decisions
   * table). `'activate'` (default, v1 behavior): click activates, selection
   * only via checkbox/Ctrl/Shift. `'select'`: file-manager semantics — click
   * replaces the selection with the row, double-click activates. Ctrl/Shift
   * power shortcuts are identical in both modes.
   */
  readonly clickAction = input<'activate' | 'select'>('activate');

  /**
   * Screen-reader messages for moves, lazy-load outcomes, and search result
   * counts (v2) — announced politely via CDK `LiveAnnouncer`, so the tree
   * ships no live-region DOM. Omitted = terse English defaults; partial
   * objects override per message; `null` silences everything.
   */
  readonly announcements = input<TreeAnnouncements<T> | null | undefined>(undefined);
  /** `'follow'` = selection tracks focus (aria alignment); default explicit. */
  readonly selectionMode = input<'explicit' | 'follow'>('explicit');
  /**
   * `'activedescendant'` keeps DOM focus on the tree and points
   * `aria-activedescendant` at the focused row — the virtualization-friendly
   * mode (no focus loss when the focused row's DOM is recycled).
   */
  readonly focusMode = input<'roving' | 'activedescendant'>('roving');
  /** One guide line per ancestor level; clicking a guide collapses that group. */
  readonly indentGuides = input(false);
  /**
   * Root-level load in flight — shows the projected `treeLoadingDef` over the
   * tree. Consumer-driven (the data is controlled); distinct from a lazy
   * *child* load, which drives per-row `isLoading`.
   */
  readonly loading = input(false);

  /// Behavior per type via predicates — the tree never interprets a type field.
  readonly disableDrag = input<((node: T) => boolean) | undefined>(undefined);
  readonly disableDrop = input<((ctx: TreeDropContext<T>) => boolean) | undefined>(undefined);
  readonly disableEdit = input<((node: T) => boolean) | undefined>(undefined);
  readonly isSelectable = input<((node: T) => boolean) | undefined>(undefined);

  /// Intent outputs — the consumer applies them to its own data (controlled).

  /** Plain row click = activate; never mutates selection (Gmail semantics). */
  readonly activated = output<T>();
  /** Drop completed (Phase 4). */
  readonly moved = output<MoveEvent<T>>();
  /** Inline edit committed (Phase 3). */
  readonly renamed = output<RenameEvent<T>>();
  /** Selection set changed through tree interaction. */
  readonly selectionChange = output<SelectEvent<T>>();
  /** Node expanded or collapsed. */
  readonly toggled = output<ToggleEvent<T>>();
  /** Async `childrenAccessor` resolved or rejected (Phase 3). */
  readonly childrenLoaded = output<LoadChildrenEvent<T>>();
  /** Right-click / ContextMenu key / Shift+F10 (Phase 7). */
  readonly contextRequested = output<ContextRequestedEvent<T>>();

  // TS-private, not #private: Angular query members must be compiler-visible (NG1053).
  private readonly defs = contentChildren<TreeNodeDef<T, T>>(TreeNodeDef);
  private readonly viewport = viewChild.required(CdkVirtualScrollViewport);
  protected readonly contextMenuDef = contentChild<TreeContextMenu<T>>(TreeContextMenu);
  private readonly contextMenuShell = viewChild.required<TemplateRef<unknown>>('contextMenuShell');
  private readonly emptyDef = contentChild(TreeEmptyDef);
  private readonly loadingDef = contentChild(TreeLoadingDef);

  readonly #dir = inject(Directionality);
  readonly #host: HTMLElement = inject(ElementRef).nativeElement;

  /** The built-in menu's trigger (host directive) — armed per-event by the tree. */
  readonly #menuTrigger = inject(CdkContextMenuTrigger, { self: true });

  /** Scroll-dismiss must not reclaim focus (it would scroll right back). */
  #suppressMenuFocusRestore = false;

  /** An outside pointer-down closed the menu — the click target keeps focus. */
  #menuClosedByPointer = false;
  #menuPointerCleanup: (() => void) | null = null;

  /** Context handed to the projected treeContextMenu template. */
  readonly #contextMenuContext = signal<TreeContextMenuContext<T> | null>(null);
  protected readonly contextMenuContext = this.#contextMenuContext.asReadonly();

  /** Gmail-style icon↔checkbox swap driver — reactive via the bridged mirror. */
  readonly selectionActive = computed(() => this.#controller.selectedIds().size > 0);

  /** Visible keys as a set — focus fallback + retention lookups (v2). */
  readonly #visibleKeySet = computed(
    () => new Set(this.#controller.visibleNodes().map((visible) => visible.flat.key)),
  );

  /**
   * Until the user moves focus — also when `focusedId` names a hidden or
   * unknown row (bad `defaultFocusedKey`, collapsed-away ancestor) — the Tab
   * target falls back to the first *selected* visible row (APG: a tree with a
   * selection receives focus on it), then to the first row: the tree must
   * never lose its Tab target.
   */
  readonly #effectiveFocusKey = computed(() => {
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

  /** Type-ahead accumulator — cleared after a pause, aria-tree convention. */
  #typeBuffer = '';
  #typeTimer: ReturnType<typeof setTimeout> | undefined;

  // ---------------------------------------------------------------------------
  // Drag & drop state (Phase 4)
  // ---------------------------------------------------------------------------

  /**
   * Touch decision (ROADMAP): context menu owns long-press, so touch-initiated
   * drags are effectively disabled; keyboard move is the non-pointer path.
   */
  protected readonly dragStartDelay = { mouse: 0, touch: 1 << 30 };

  readonly #drag = signal<{ keys: readonly string[]; nodes: readonly T[] } | null>(null);
  protected readonly dragCount = computed(() => this.#drag()?.keys.length ?? 0);

  readonly #dropIndicator = signal<DropIndicator | null>(null);
  protected readonly dropIndicator = this.#dropIndicator.asReadonly();

  /** The validated destination the next release commits to (plain field: read once). */
  #pendingDrop: DropTarget<T> | null = null;
  #lastPointerY = 0;
  #autoScrollStep = 0;
  #autoScrollFrame: number | undefined;
  #hoverExpand: { key: string; timer: ReturnType<typeof setTimeout> } | undefined;

  /** Cut/paste-style keyboard move (WCAG 2.5.7 — every drag has a non-pointer path). */
  readonly #moveMarked = signal<{
    keys: ReadonlySet<string>;
    nodes: readonly T[];
    effect: 'move' | 'copy';
  } | null>(null);

  // ---------------------------------------------------------------------------
  // ARIA (Phase 6)
  // ---------------------------------------------------------------------------

  /** Minted once (STYLE.md) — prefixes row DOM ids for aria-activedescendant. */
  readonly #uid = `angular-tree-${nextTreeUid++}`;

  /** Range-selection anchor: the last explicitly selected row. */
  #selectionAnchor: string | null = null;

  protected rowId(key: string): string {
    // encodeURIComponent keeps ids unique + free of spaces/quotes for any key.
    return `${this.#uid}-${encodeURIComponent(key)}`;
  }

  protected readonly activeDescendantId = computed(() => {
    const key = this.#effectiveFocusKey();
    return key != null ? this.rowId(key) : null;
  });

  readonly #destroyRef = inject(DestroyRef);

  /**
   * Mirror of the viewport's rendered range — the guide overlays live in the
   * scroll content and must be clamped to it (an unclamped guide over 100k
   * expanded rows would be a megapixel-tall element).
   */
  readonly #renderedRange = signal<ListRange>({ start: 0, end: 0 });

  constructor() {
    // Disabled at rest: #openMenu un-gates it only for its own synchronous
    // call, so CDK's own contextmenu listener can't open a stale menu on an
    // empty-space click, and every open funnels through the tree.
    this.#menuTrigger.disabled = true;

    // afterNextRender, not an effect: viewChild.required throws before the
    // first render, and effects can run that early.
    afterNextRender(() => {
      this.#menuTrigger.menuTemplateRef = this.contextMenuShell();

      const viewport = this.viewport();
      this.#renderedRange.set(viewport.getRenderedRange());
      const subscription = viewport.renderedRangeStream.subscribe((range) =>
        this.#renderedRange.set(range),
      );
      // Close-on-scroll (settled): under virtualization the anchor row's DOM
      // is destroyed when it leaves the render range — repositioning would
      // track a recycled element. Focus restore is suppressed here: pulling
      // focus back to the row would `scrollToIndex` straight back against
      // the user's scroll.
      const scrollSubscription = viewport.elementScrolled().subscribe(() => {
        // Wheel-scroll mid-drag (v2): the pointer is stationary, so no
        // pointermove re-targets the drop — re-run it from the last known
        // pointer position or the indicator tracks a recycled row.
        if (this.#drag()) this.#updateDropTarget(this.#lastPointerY);

        if (!this.#menuTrigger.isOpen()) return;
        this.#suppressMenuFocusRestore = true;
        this.#menuTrigger.close();
        this.#suppressMenuFocusRestore = false;
      });
      // Menu close hands focus back to the row (matrix: "restores focus to
      // the row on close") — CDK restores to its trigger host, which is the
      // tree element, not the roving-tabindex row. Microtask: teardown must
      // finish first. Two guards: outside-pointer closes keep the user's
      // click target (tracked in #openMenu), and an element the close
      // genuinely focused (e.g. rename's edit input) wins — only orphaned
      // focus is reclaimed. "Orphaned" includes tabindex:-1 containers: a
      // MatDialog focus trap re-anchors to its container when the menu DOM
      // vanishes, and leaving focus there strands keyboard users.
      const closedSubscription = this.#menuTrigger.closed.subscribe(() => {
        this.#menuPointerCleanup?.();
        if (this.#suppressMenuFocusRestore || this.#menuClosedByPointer) return;
        const key = this.#controller.focusedId();
        if (key == null) return;
        queueMicrotask(() => {
          const active = this.#host.ownerDocument.activeElement as HTMLElement | null;
          const orphaned =
            active == null || active === this.#host.ownerDocument.body || active.tabIndex < 0;
          if (orphaned) this.#focusKey(key);
        });
      });
      this.#destroyRef.onDestroy(() => {
        subscription.unsubscribe();
        scrollSubscription.unsubscribe();
        closedSubscription.unsubscribe();
        this.#menuPointerCleanup?.(); // destroy with the menu still open
      });
    });

    this.#controller.connect({
      dataSource: this.dataSource,
      childrenAccessor: this.childrenAccessor,
      expansionKey: this.expansionKey,
      defaultExpandedKeys: this.defaultExpandedKeys,
      defaultFocusedKey: this.defaultFocusedKey,
      searchTerm: this.searchTerm,
      searchMatch: this.searchMatch,
    });
    // In-flight accessor fetches must not outlive the tree (v2 cancellation).
    this.#destroyRef.onDestroy(() => this.#controller.abortAll());

    // ONE document listener, two duties (cheapest possible outside-click
    // handling — no per-row listeners, no effects):
    // 1. Focus-ownership: an outside pointer-down means the user left the
    //    tree — retention must not yank focus back on the next data change.
    //    Document level because clicking a non-focusable area fires no focus
    //    events.
    // 2. deselectOnOutsideClick: a pointer-down on no row clears the
    //    selection (file-manager semantics). Guards run cheapest-first; the
    //    DOM walks only happen with a non-empty selection.
    const onDocPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const insideHost = this.#host.contains(target);
      if (!insideHost) this.#treeOwnsFocus = false;

      if (!this.deselectOnOutsideClick()) return;
      if (this.#controller.selectedIds().size === 0) return;
      // Row clicks manage selection themselves; guide clicks collapse groups;
      // overlay clicks (context menu, dialogs) act ON the selection.
      if (target.closest('[data-node-id], .tree-guide, .cdk-overlay-container')) return;
      if (insideHost) {
        // Scrollbar drags are not deselect gestures (layoutless envs skip this).
        const viewport = this.viewport().elementRef.nativeElement;
        if (
          viewport.clientWidth > 0 &&
          (event.offsetX >= viewport.clientWidth || event.offsetY >= viewport.clientHeight)
        ) {
          return;
        }
      }
      this.#selectionAnchor = null;
      this.#writeSelection([], 'replace');
    };
    this.#host.ownerDocument.addEventListener('pointerdown', onDocPointerDown, true);
    this.#destroyRef.onDestroy(() =>
      this.#host.ownerDocument.removeEventListener('pointerdown', onDocPointerDown, true),
    );

    // Search announcements (v2): result counts reach screen readers as the
    // term or the data changes; the count is true matches, not the ancestor
    // chains rendered around them.
    effect(() => {
      const count = this.#controller.searchMatchCount();
      const term = this.searchTerm();
      untracked(() => {
        if (count != null) this.#announce((messages) => messages.searchResults?.(count, term));
      });
    });

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

    // SelectionModel bridge: the model stays the consumer's source of truth;
    // the controller holds a Set mirror so reads are signal-reactive.
    effect((onCleanup) => {
      const model = this.selection();
      if (!model) {
        this.#controller.selectedIds.set(new Set());
        return;
      }
      this.#controller.selectedIds.set(new Set(model.selected));
      const subscription = model.changed.subscribe(() => {
        this.#controller.selectedIds.set(new Set(model.selected));
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /** The 1D array actually rendered — built from the controller's walk. */
  readonly visibleRows = computed<readonly FlatRow<T>[]>(() =>
    this.#controller.visibleNodes().map(({ flat, isExpanded }, index) => {
      const key = flat.key;
      // Per-row computeds: value equality stops propagation, so a selection
      // change re-renders only rows whose state actually flipped (O(visible)).
      const isSelected = computed(() => this.#controller.selectedIds().has(key));
      const checkState = computed(() => this.#controller.checkStates().get(key) ?? 'unchecked');
      const isEditing = computed(() => this.#controller.editingId() === key);
      const isLoading = computed(() => this.#controller.loadStates().get(key) === 'loading');
      const hasError = computed(() => this.#controller.loadStates().get(key) === 'error');
      const tabIndex = computed(() => (this.#effectiveFocusKey() === key ? 0 : -1));
      const moveSource = computed(() => this.#moveMarked()?.keys.has(key) ?? false);

      const handle: TreeNodeHandle = {
        expandable: flat.expandable,
        isSelected,
        checkState,
        toggle: () => this.toggle(flat.node),
        toggleSelection: (range?: boolean) => this.#toggleSelection(key, flat.node, range),
        beginEdit: () => this.edit(flat.node),
        commitEdit: (name) => this.#commitEdit(key, flat.node, name),
        cancelEdit: () => this.#cancelEdit(key),
      };

      return {
        node: flat.node,
        key,
        level: flat.level,
        expandable: flat.expandable,
        setSize: flat.setSize,
        posInSet: flat.posInSet,
        tabIndex,
        moveSource,
        checkState,
        dragDisabled: this.disableDrag()?.(flat.node) ?? false,
        context: {
          $implicit: flat.node,
          key,
          level: flat.level,
          expandable: flat.expandable,
          isExpanded,
          index,
          // Getters defer to per-row computeds: reading them during template
          // execution registers the row's view — not the whole list — as the
          // reactive consumer.
          get isSelected() {
            return isSelected();
          },
          get isEditing() {
            return isEditing();
          },
          get isLoading() {
            return isLoading();
          },
          get hasError() {
            return hasError();
          },
          get checkState() {
            return checkState();
          },
        },
        injector: Injector.create({
          parent: this.#injector,
          providers: [{ provide: TREE_NODE, useValue: handle }],
        }),
      };
    }),
  );

  readonly trackByKey: TrackByFunction<FlatRow<T>> = (_index, row) => row.key;

  /**
   * The empty/loading overlay content, or `null` for neither. Loading wins
   * over empty (a root load in flight shouldn't flash "no items"); each shows
   * only when its def is projected.
   */
  protected readonly stateTemplate = computed<TemplateRef<unknown> | null>(() => {
    if (this.loading()) return this.loadingDef()?.template ?? null;
    if (this.visibleRows().length === 0) return this.emptyDef()?.template ?? null;
    return null;
  });

  /**
   * `'activate'` (default): plain click activates, never mutates selection —
   * Gmail. `'select'` (v2 opt-in): plain click replaces the selection —
   * file manager; activation moves to double-click. Ctrl/Cmd+click toggles,
   * Shift+click range-selects over visible order in both modes (power-user
   * shortcuts, ROADMAP settled).
   */
  protected onRowClick(row: FlatRow<T>, event: MouseEvent) {
    this.#controller.focusedId.set(row.key);

    if ((event.ctrlKey || event.metaKey) && this.multi()) {
      this.#toggleSelection(row.key, row.node);
      return;
    }
    if (event.shiftKey && this.multi()) {
      this.#selectRange(this.#selectionAnchor ?? row.key, row.key);
      return;
    }

    if (this.clickAction() === 'select') {
      // Single replace-select with anchor — same write as 'follow' focus
      // (respects isSelectable); activation belongs to double-click here.
      this.#followFocus(row);
      return;
    }

    if (this.selectionMode() === 'follow') this.#followFocus(row);
    this.activated.emit(row.node);
  }

  /**
   * Activation gesture under `clickAction: 'select'` — inert otherwise so
   * double-click stays entirely the consumer's (v1 rename-gesture decision).
   */
  protected onRowDoubleClick(row: FlatRow<T>) {
    if (this.clickAction() !== 'select') return;
    this.activated.emit(row.node);
  }

  /**
   * One guide span per expanded row with visible descendants, over the whole
   * visible flat array. Stack-based single pass: a row at a level ≤ an open
   * parent's closes that parent's group. Recomputes only when visibility
   * changes (expand/collapse/search/data) — never on scroll.
   */
  readonly #guideGroups = computed<readonly GuideGroup[]>(() => {
    const rows = this.#controller.visibleNodes();
    const groups: GuideGroup[] = [];
    const open: { key: string; level: number; start: number }[] = [];

    const close = (until: number, end: number) => {
      while (open.length > 0 && until <= open[open.length - 1].level) {
        const group = open.pop()!;
        // Expanded but childless (e.g. lazy load in flight) → no line yet.
        if (end >= group.start) groups.push({ ...group, end });
      }
    };

    for (let index = 0; index < rows.length; index++) {
      const { flat, isExpanded } = rows[index];
      close(flat.level, index - 1);
      if (flat.expandable && isExpanded) {
        open.push({ key: flat.key, level: flat.level, start: index + 1 });
      }
    }
    close(-Infinity, rows.length - 1);
    return groups;
  });

  /** Guides clamped to the rendered range, in content-wrapper px (see template). */
  protected readonly guideOverlays = computed<readonly GuideOverlay[]>(() => {
    if (!this.indentGuides()) return [];
    const range = this.#renderedRange();
    const size = this.itemSize();
    const overlays: GuideOverlay[] = [];

    for (const group of this.#guideGroups()) {
      const start = Math.max(group.start, range.start);
      const end = Math.min(group.end, range.end - 1);
      if (start > end) continue; // group entirely outside the rendered window
      overlays.push({
        key: group.key,
        level: group.level,
        top: (start - range.start) * size,
        height: (end - start + 1) * size,
      });
    }
    return overlays;
  });

  /** A guide click collapses — and focuses — the group's expanded parent. */
  protected onGuideClick(parentKey: string) {
    const parent = this.#controller.flat().map.get(parentKey);
    if (!parent) return;
    this.collapse(parent.node);
    this.#focusKey(parentKey);
  }

  /**
   * Right-click contract (OS convention, ROADMAP Phase 7): an unselected row
   * is selected first (replace); a row inside a multi-selection keeps the
   * selection intact. With a projected treeContextMenu the tree owns the
   * trigger, so it suppresses the browser menu on rows — but never inside
   * inputs (a rename field keeps its paste menu). Without a def, suppression
   * stays the consumer trigger's job (the tree never assumes a menu exists).
   */
  protected onContextMenu(row: FlatRow<T>, event: MouseEvent) {
    this.#controller.focusedId.set(row.key);

    // Inside a rename input, leave the browser's paste menu alone.
    if (this.contextMenuDef() && (event.target as HTMLElement).closest('input')) return;

    const at = this.#prepareContext(row, { x: event.clientX, y: event.clientY });
    if (at == null) return; // no projected def → the consumer's trigger's call

    // Drive the open ourselves — do NOT lean on CDK's own `contextmenu` host
    // listener (its firing through hostDirectives proved unreliable on real
    // trackpads: the browser menu won). We suppress the native menu and open
    // via #openMenu, threading THIS event so the gesture's trailing pointer
    // event doesn't self-close the menu (the flicker).
    event.preventDefault();
    this.#openMenu(event, at);
  }

  /** Keeps `focusedId` in sync when focus arrives via Tab or pointer. */
  protected onFocusIn(event: FocusEvent) {
    this.#treeOwnsFocus = true;
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')?.dataset[
      'nodeId'
    ];
    if (key != null) this.#controller.focusedId.set(key);
  }

  /**
   * Focus-ownership bookkeeping for retention (v2). Only a focusout with a
   * real outside destination clears the flag: when the browser drops focus
   * because the focused row's DOM was destroyed, no event fires at all —
   * that's exactly the orphaning retention exists to repair. Outside
   * pointer-downs clear it too (listener in the constructor): clicking a
   * non-focusable area emits focusout with a null relatedTarget, which is
   * indistinguishable from destruction by events alone.
   */
  protected onFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as HTMLElement | null;
    if (next != null && !this.#host.contains(next)) this.#treeOwnsFocus = false;
  }

  #treeOwnsFocus = false;

  /**
   * One handler over the whole viewport (controller-driven focus — ROADMAP
   * Phase 3 decision): works for targets virtualization hasn't rendered.
   */
  protected onKeydown(event: KeyboardEvent) {
    // Keys inside a rename input belong to the input (Enter/Escape handled
    // by treeNodeEditInput), not to tree navigation.
    if ((event.target as HTMLElement).closest('input[treeNodeEditInput]')) return;

    const rows = this.visibleRows();
    if (rows.length === 0) return;

    const focusKey = this.#effectiveFocusKey();
    const index = Math.max(
      0,
      rows.findIndex((row) => row.key === focusKey),
    );
    const row = rows[index];
    const rtl = this.#dir.value === 'rtl';

    // Keyboard move: Ctrl+X marks a move, Ctrl+C marks a copy (v2 dropEffect),
    // Ctrl+V drops into, Ctrl+Shift+V drops after. Multi-select (APG optional
    // keys): Ctrl+A selects all visible (again = clear), Ctrl+Shift+Home/End
    // range-selects to the edge and moves focus there.
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const combo = event.key.toLowerCase();
      if (combo === 'x' || combo === 'c') {
        const keys = this.#controller.dragKeysFor(row.key);
        this.#moveMarked.set({
          keys: new Set(keys),
          nodes: this.#controller.nodesForKeys(keys),
          effect: combo === 'c' ? 'copy' : 'move',
        });
        event.preventDefault();
      } else if (combo === 'v') {
        this.#keyboardDrop(row, event.shiftKey ? 'after' : 'inside');
        event.preventDefault();
      } else if (combo === 'a' && this.multi()) {
        this.#selectAllVisible();
        event.preventDefault();
      } else if (event.shiftKey && (combo === 'home' || combo === 'end') && this.multi()) {
        const edge = combo === 'home' ? 0 : rows.length - 1;
        this.#selectRange(row.key, rows[edge].key);
        this.#focusIndex(edge);
        event.preventDefault();
      }
      return;
    }
    // Escape ladder — one layer per press: cancel move-mark, then clear the
    // selection (Finder/Explorer; focus STAYS on the row — APG requires a
    // visible active element). An unconsumed Escape bubbles untouched so an
    // enclosing dialog still closes.
    if (event.key === 'Escape') {
      if (this.#moveMarked()) {
        this.#moveMarked.set(null);
        event.preventDefault();
      } else if (this.#controller.selectedIds().size > 0) {
        this.#selectionAnchor = null;
        this.#writeSelection([], 'replace');
        this.#announce((messages) => messages.selectionCleared?.());
        event.preventDefault();
      }
      return;
    }

    // Normalize horizontal arrows so the switch stays direction-free (RTL
    // flips expand/collapse — ROADMAP Phase 3).
    const key =
      event.key === 'ArrowRight'
        ? rtl
          ? 'collapse'
          : 'expand'
        : event.key === 'ArrowLeft'
          ? rtl
            ? 'expand'
            : 'collapse'
          : event.key;

    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const next = key === 'ArrowDown' ? index + 1 : index - 1;
        this.#focusIndex(next);
        const focused = rows[Math.max(0, Math.min(rows.length - 1, next))];
        // APG: Shift+Arrow extends the selection to the newly focused node.
        if (event.shiftKey && this.multi()) this.#extendSelection(focused);
        else if (this.selectionMode() === 'follow') this.#followFocus(focused);
        break;
      }
      case 'expand':
        if (!row.expandable) return;
        if (!row.context.isExpanded) this.expand(row.node);
        else if (rows[index + 1] && rows[index + 1].level > row.level) this.#focusIndex(index + 1);
        break;
      case 'collapse':
        if (row.expandable && row.context.isExpanded) {
          this.collapse(row.node);
        } else {
          const parentKey = this.#controller.flat().map.get(row.key)?.parentKey;
          if (parentKey != null) this.#focusKey(parentKey);
        }
        break;
      case 'ContextMenu':
        // preventDefault (below) also suppresses the browser's synthetic
        // `contextmenu` event — no double emission with onContextMenu.
        this.#openContextMenuAt(row);
        break;
      case 'F10':
        if (!event.shiftKey) return;
        this.#openContextMenuAt(row);
        break;
      case 'Home':
        this.#focusIndex(0);
        break;
      case 'End':
        this.#focusIndex(rows.length - 1);
        break;
      case 'PageDown':
      case 'PageUp': {
        // Viewport-height jumps (APG optional keys, v2). Layoutless
        // environments report size 0 — clamp to a single-row step.
        const step = Math.max(1, Math.floor(this.viewport().getViewportSize() / this.itemSize()));
        this.#focusIndex(key === 'PageDown' ? index + step : index - step);
        break;
      }
      case 'Enter':
        if (this.enterAction() === 'edit') this.edit(row.node);
        else this.activated.emit(row.node);
        break;
      case ' ':
        // APG Shift+Space: contiguous selection from the anchor — same range
        // semantics as shift-click; a plain Space (or no anchor yet) toggles.
        this.#toggleSelection(row.key, row.node, event.shiftKey);
        break;
      default:
        this.#typeahead(event, rows, index);
        return;
    }
    event.preventDefault();
  }

  /** Prefix match over `typeaheadText`, starting after the focused row, wrapping. */
  #typeahead(event: KeyboardEvent, rows: readonly FlatRow<T>[], index: number) {
    const text = this.typeaheadText();
    if (!text || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;

    clearTimeout(this.#typeTimer);
    this.#typeBuffer += event.key.toLowerCase();
    this.#typeTimer = setTimeout(() => (this.#typeBuffer = ''), 500);

    for (let offset = 1; offset <= rows.length; offset++) {
      const candidate = rows[(index + offset) % rows.length];
      if (text(candidate.node).toLowerCase().startsWith(this.#typeBuffer)) {
        this.#focusKey(candidate.key);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer drag & drop (Phase 4)
  // ---------------------------------------------------------------------------

  protected previewLabel(node: T): string {
    return this.typeaheadText()?.(node) ?? '';
  }

  /** Same validation and `MoveEvent` as a pointer drop — only the input differs. */
  #keyboardDrop(row: FlatRow<T>, zone: 'inside' | 'after') {
    const marked = this.#moveMarked();
    if (!marked) return;

    const keys = [...marked.keys];
    const target = this.#controller.dropTargetFor(keys, row.key, zone);
    if (!target) return;
    if (
      this.disableDrop()?.({
        dragNodes: marked.nodes,
        parentNode: target.parentNode,
        index: target.index,
      })
    ) {
      return;
    }

    this.#moveMarked.set(null);
    const event: MoveEvent<T> = {
      dragIds: keys,
      dragNodes: marked.nodes,
      parentId: target.parentKey,
      parentNode: target.parentNode,
      index: target.index,
      dropEffect: marked.effect,
    };
    this.moved.emit(event);
    this.#announce((messages) => messages.moved?.(event));
  }

  protected onDragStart(row: FlatRow<T>) {
    const keys = this.#controller.dragKeysFor(row.key);
    this.#dragCopy = false;
    this.#dragCancelled = false;
    this.#drag.set({ keys, nodes: this.#controller.nodesForKeys(keys) });

    // Escape cancels the drag (v2 — CDK has no public mid-drag cancel): flag
    // the drop as dead, then end CDK's sequence with a synthetic mouseup.
    // Mouse drags only — DragRef reads coordinates off the up-event, and a
    // fabricated TouchEvent can't carry them; touch cancels by lifting.
    const doc = this.#host.ownerDocument;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      this.#dragCancelled = true;
      this.#clearDropTarget();
      event.stopPropagation(); // a hosting dialog must not close on the same press
      doc.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };
    doc.addEventListener('keydown', onKeydown, true);
    this.#dragEscapeCleanup = () => {
      doc.removeEventListener('keydown', onKeydown, true);
      this.#dragEscapeCleanup = null;
    };
  }

  #dragCancelled = false;
  #dragEscapeCleanup: (() => void) | null = null;

  protected onDragMove(event: CdkDragMove<unknown>) {
    // Copy modifier is sampled continuously and used at drop time — pressing
    // or releasing it mid-drag must count (OS file-manager behavior).
    this.#dragCopy = this.#isCopyModifierHeld(event.event);
    this.#lastPointerY = event.pointerPosition.y;
    this.#updateDropTarget(event.pointerPosition.y);
    this.#updateAutoScroll(event.pointerPosition.y);
  }

  /** ⌥ copies on macOS, Ctrl elsewhere — Ctrl-drag is a context-menu gesture on mac. */
  #isCopyModifierHeld(event: MouseEvent | TouchEvent): boolean {
    if (!(event instanceof MouseEvent)) return false; // touch has no modifiers
    const isApple = /Mac|iP(hone|ad|od)/.test(globalThis.navigator?.platform ?? '');
    return isApple ? event.altKey : event.ctrlKey;
  }

  /** Copy modifier state at the latest drag move — read at drop. */
  #dragCopy = false;

  protected onDragEnd() {
    const drag = this.#drag();
    const drop = this.#pendingDrop;
    if (drag && drop && !this.#dragCancelled) {
      const event: MoveEvent<T> = {
        dragIds: drag.keys,
        dragNodes: drag.nodes,
        parentId: drop.parentKey,
        parentNode: drop.parentNode,
        index: drop.index,
        dropEffect: this.#dragCopy ? 'copy' : 'move',
      };
      this.moved.emit(event);
      this.#announce((messages) => messages.moved?.(event));
    }
    this.#resetDragState();
  }

  /** Fixed `itemSize` makes hovered row + zone pure arithmetic — no hit testing. */
  #updateDropTarget(clientY: number) {
    const drag = this.#drag();
    if (!drag) return;

    const viewport = this.viewport();
    const viewportTop = viewport.elementRef.nativeElement.getBoundingClientRect().top;
    const size = this.itemSize();
    const contentY = clientY - viewportTop + viewport.measureScrollOffset();
    const rows = this.visibleRows();
    const index = Math.floor(contentY / size);

    if (index < 0 || index >= rows.length) {
      this.#clearDropTarget();
      return;
    }

    const row = rows[index];
    const zone = dropZoneAt(contentY - index * size, size);
    const target = this.#controller.dropTargetFor(drag.keys, row.key, zone);
    const forbidden =
      target != null &&
      (this.disableDrop()?.({
        dragNodes: drag.nodes,
        parentNode: target.parentNode,
        index: target.index,
      }) ??
        false);

    this.#scheduleHoverExpand(zone === 'inside' && target != null && !forbidden ? row : null);

    if (target == null || forbidden) {
      this.#clearDropTarget();
      return;
    }

    this.#pendingDrop = target;
    const rowTop = index * size - viewport.measureScrollOffset();
    this.#dropIndicator.set(
      zone === 'inside' && row.expandable
        ? { top: rowTop, height: size, inside: true, level: row.level }
        : {
            top: zone === 'before' ? rowTop - 1 : rowTop + size - 1,
            height: 2,
            inside: false,
            level: row.level,
          },
    );
  }

  /** Hovering the make-child zone auto-expands after a delay (ROADMAP). */
  #scheduleHoverExpand(row: FlatRow<T> | null) {
    if (this.#hoverExpand && this.#hoverExpand.key === row?.key) return;
    if (this.#hoverExpand) {
      clearTimeout(this.#hoverExpand.timer);
      this.#hoverExpand = undefined;
    }
    if (!row || !row.expandable || row.context.isExpanded) return;

    this.#hoverExpand = {
      key: row.key,
      timer: setTimeout(() => {
        this.#hoverExpand = undefined;
        this.expand(row.node);
      }, 600),
    };
  }

  /**
   * Manual edge auto-scroll: standard `cdkDropList` auto-scroll doesn't know
   * the virtual viewport (ROADMAP). A rAF loop keeps scrolling — and keeps
   * re-targeting rows that virtualization materializes mid-drag — while the
   * pointer holds still inside an edge band.
   */
  #updateAutoScroll(clientY: number) {
    const rect = this.viewport().elementRef.nativeElement.getBoundingClientRect();
    const band = 32;
    this.#autoScrollStep =
      clientY < rect.top + band ? -8 : clientY > rect.bottom - band ? 8 : 0;

    if (this.#autoScrollStep !== 0 && this.#autoScrollFrame === undefined) {
      this.#autoScrollFrame = requestAnimationFrame(this.#autoScrollTick);
    }
  }

  readonly #autoScrollTick = () => {
    this.#autoScrollFrame = undefined;
    if (!this.#drag() || this.#autoScrollStep === 0) return;
    const viewport = this.viewport();
    viewport.scrollToOffset(viewport.measureScrollOffset() + this.#autoScrollStep);
    this.#updateDropTarget(this.#lastPointerY);
    this.#autoScrollFrame = requestAnimationFrame(this.#autoScrollTick);
  };

  #clearDropTarget() {
    this.#pendingDrop = null;
    this.#dropIndicator.set(null);
  }

  #resetDragState() {
    this.#drag.set(null);
    this.#dragCopy = false;
    this.#dragEscapeCleanup?.();
    this.#clearDropTarget();
    this.#scheduleHoverExpand(null);
    this.#autoScrollStep = 0;
    if (this.#autoScrollFrame !== undefined) {
      cancelAnimationFrame(this.#autoScrollFrame);
      this.#autoScrollFrame = undefined;
    }
  }

  #focusIndex(index: number) {
    const rows = this.visibleRows();
    if (rows.length === 0) return;
    this.#focusKey(rows[Math.max(0, Math.min(rows.length - 1, index))].key);
  }

  /**
   * Focus a row that may not be rendered yet: scroll it into the viewport,
   * then focus its DOM after the next render (ROADMAP: `afterNextRender` +
   * `data-node-id` query).
   */
  #focusKey(key: string) {
    this.#controller.focusedId.set(key);

    const index = this.visibleRows().findIndex((row) => row.key === key);
    if (index < 0) return;
    const range = this.viewport().getRenderedRange();
    if (index < range.start || index >= range.end) this.viewport().scrollToIndex(index);

    // activedescendant mode: DOM focus stays on the tree — aria-activedescendant
    // (bound to focusedId) does the announcing; no per-row focus dance.
    if (this.focusMode() === 'activedescendant') return;

    // Far jumps (End/Home, `focus()` API) race CDK's re-render: scrollToIndex
    // materializes the target row asynchronously, so a single next-render
    // query can miss it — focus then dies with the recycled source row
    // (Phase 8 matrix find; jsdom's layoutless viewport can't reproduce it).
    // Retry frame-aligned until the row DOM exists; a newer request wins.
    this.#focusAttempt = key;
    afterNextRender(() => this.#attemptFocus(key, 16), { injector: this.#injector });
  }

  /** Previous visible order — the neighborhood a vanished focus falls back into. */
  #prevVisibleKeys: readonly string[] = [];

  #retainFocus(visible: readonly { flat: { key: string } }[]) {
    const keys = visible.map((entry) => entry.flat.key);
    const prev = this.#prevVisibleKeys;
    this.#prevVisibleKeys = keys;

    if (prev.length === 0 || !this.#treeOwnsFocus) return;
    if (this.focusMode() === 'activedescendant') return; // DOM focus never leaves the tree
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
          this.#focusKey(key);
        }
      },
      { injector: this.#injector },
    );
  }

  /** The focus target currently being chased across virtual re-renders. */
  #focusAttempt: string | null = null;

  #attemptFocus(key: string, retries: number) {
    if (this.#focusAttempt !== key) return; // superseded
    const row = this.#host.querySelector<HTMLElement>(
      `[data-node-id="${escapeAttributeValue(key)}"]`,
    );
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

  /**
   * Selection reconciliation (OS convention) + `contextRequested` emit +
   * building the projected menu's context. Returns the anchor position when a
   * `treeContextMenu` def exists (so the caller opens it), or `null` when none
   * is projected (external hosting: the tree touches nothing else).
   */
  #prepareContext(row: FlatRow<T>, position?: { x: number; y: number }) {
    if (!row.context.isSelected && this.isSelectable()?.(row.node) !== false) {
      this.#selectionAnchor = row.key;
      this.#writeSelection([row.key], 'replace');
    }

    const model = this.selection();
    const selected = [...(model ? model.selected : this.#controller.selectedIds())];
    const ids = selected.length > 0 ? selected : [row.key];
    const rect = this.#host
      .querySelector(`[data-node-id="${escapeAttributeValue(row.key)}"]`)
      ?.getBoundingClientRect();
    const at = position ?? { x: rect?.left ?? 0, y: rect?.bottom ?? 0 };

    this.contextRequested.emit({ ids, node: row.node, position: at });

    if (!this.contextMenuDef()) return null;
    this.#contextMenuContext.set({
      $implicit: row.node,
      node: row.node,
      nodes: this.#controller.nodesForKeys(ids),
      ids,
      position: at,
    });
    return at;
  }

  /** Keyboard / programmatic open — no pointer event to thread (and none to self-close). */
  #openContextMenuAt(row: FlatRow<T>, position?: { x: number; y: number }) {
    const at = this.#prepareContext(row, position);
    if (at != null) this.#openMenu(null, at);
  }

  /**
   * Opens the built-in menu at `at`. `userEvent` (the triggering
   * `contextmenu`, or `null` for keyboard/API) is threaded into CDK's
   * `_open` so the outside-click stream skips the gesture's own trailing
   * pointer event — the public `open()` omits it and the menu self-closes
   * (the flicker).
   *
   * The trigger stays `disabled` at rest so its own `contextmenu` host
   * listener never opens a stale menu on empty-space clicks; we un-gate it
   * only for this synchronous call. `_open` is CDK-internal (no public
   * coordinate+event overload) — the single quarantined boundary here.
   */
  #openMenu(userEvent: MouseEvent | null, at: { x: number; y: number }) {
    const trigger = this.#menuTrigger as unknown as {
      _open(event: MouseEvent | null, coordinates: { x: number; y: number }): void;
    };
    this.#menuTrigger.disabled = false;
    trigger._open(userEvent, at);
    this.#menuTrigger.disabled = true; // re-arm the gate; never closes an open menu

    // CDK's context trigger leaves focus on the row — in a real browser the
    // menu then ignores Escape and arrow keys until clicked (Phase 8 matrix
    // find; jsdom couldn't see it). Mouse opens focus the shell (Escape +
    // arrow entry work, no item pre-highlight — OS menu behavior);
    // keyboard/API opens land on the first item (APG menu pattern). Overlay
    // attach is synchronous, so the menu DOM exists here; last match wins if
    // several trees render menus into the shared overlay container.
    const menus = this.#host.ownerDocument.querySelectorAll<HTMLElement>(
      '.cdk-overlay-container .tree-menu',
    );
    const menu = menus.item(menus.length - 1);
    if (!menu) return;
    if (userEvent) menu.focus();
    else (menu.querySelector<HTMLElement>('[cdkmenuitem]') ?? menu).focus();

    // One Escape, one layer (OS menus): CdkMenu handles Escape on the menu
    // element itself, but the event then bubbles to the document where the
    // overlay keyboard dispatcher hands it to the *dialog* hosting the tree —
    // both close on a single keypress. stopPropagation here still lets
    // CdkMenu's same-element listener run; the listener dies with the menu
    // DOM on close.
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });

    // Track whether the eventual close comes from an outside pointer-down —
    // then the user's click target keeps focus and the close handler must
    // not reclaim it for the row. Capture phase: CDK's own outside-click
    // close runs on the same event.
    this.#menuClosedByPointer = false;
    this.#menuPointerCleanup?.();
    const doc = this.#host.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.tree-menu')) {
        this.#menuClosedByPointer = true;
      }
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    this.#menuPointerCleanup = () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      this.#menuPointerCleanup = null;
    };
  }

  /// Selection writes (Phase 6 interaction modes) — one funnel, one event.

  /** `'follow'` selection: focus movement replaces the selection (aria alignment). */
  #followFocus(row: FlatRow<T>) {
    if (this.isSelectable()?.(row.node) === false) return;
    this.#selectionAnchor = row.key;
    this.#writeSelection([row.key], 'replace');
  }

  /** Shift+Arrow: the newly focused row joins the selection (APG tree pattern). */
  #extendSelection(row: FlatRow<T>) {
    if (this.isSelectable()?.(row.node) === false) return;
    this.#writeSelection([row.key], 'add');
  }

  /** Shift+click: additive range over the *visible* flat order. */
  #selectRange(fromKey: string, toKey: string) {
    const rows = this.visibleRows();
    const from = rows.findIndex((row) => row.key === fromKey);
    const to = rows.findIndex((row) => row.key === toKey);
    if (from < 0 || to < 0) return;

    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const keys = rows
      .slice(lo, hi + 1)
      .filter((row) => this.isSelectable()?.(row.node) !== false)
      .map((row) => row.key);
    this.#writeSelection(keys, 'add');
  }

  /**
   * Ctrl/Cmd+A (APG optional key): selects every visible selectable row —
   * or clears the selection when they're already all selected.
   */
  #selectAllVisible() {
    const keys = this.visibleRows()
      .filter((row) => this.isSelectable()?.(row.node) !== false)
      .map((row) => row.key);
    const selected = this.#controller.selectedIds();
    const allSelected = keys.length > 0 && keys.every((key) => selected.has(key));
    this.#writeSelection(allSelected ? [] : keys, 'replace');
  }

  #writeSelection(keys: readonly string[], mode: 'add' | 'replace') {
    const model = this.selection();
    if (model) {
      if (mode === 'replace') model.clear();
      if (keys.length > 0) model.select(...keys);
    } else {
      this.#controller.selectedIds.update((current) => {
        const next = mode === 'replace' ? new Set<string>() : new Set(current);
        for (const key of keys) next.add(key);
        return next;
      });
    }

    const ids = [...(model ? model.selected : this.#controller.selectedIds())];
    this.selectionChange.emit({ ids, nodes: this.#controller.nodesForKeys(ids) });
  }

  /** First def whose `when` matches wins; a def without `when` is the fallback. */
  templateFor(row: FlatRow<T>): TemplateRef<TreeNodeContext<T>> {
    const defs = this.defs();
    const match = defs.find((def) => def.when()?.(row.node)) ?? defs.find((def) => !def.when());

    if (!match) throw new Error('angular-tree: no treeNodeDef matches this node.');
    return match.template;
  }

  /// TreeApi (exportAs "angularTree" / viewChild) — CdkTree-compatible names.

  isExpanded(node: T): boolean {
    return this.#controller.expandedIds().has(this.expansionKey()(node));
  }

  expand(node: T) {
    this.#applyExpansion(node, true);
  }

  collapse(node: T) {
    this.#applyExpansion(node, false);
  }

  toggle(node: T) {
    this.#applyExpansion(node, !this.isExpanded(node));
  }

  /** Expands `node` and every (sync-loaded) descendant beneath it. */
  expandDescendants(node: T) {
    this.#controller.expandWithDescendants(this.expansionKey()(node));
  }

  /**
   * Expands every loaded node. `loadLazy` (v2, opt-in — a 100k lazy tree
   * must never fetch-storm by accident): additionally resolves unloaded lazy
   * subtrees in batched frontier waves, expanding each wave as it lands;
   * per-load `childrenLoaded` events fire as usual. Nodes in `error` state
   * are left alone — `retryChildren` stays the explicit recovery path.
   */
  expandAll(options?: { loadLazy?: boolean }) {
    this.#controller.expandAll();
    if (options?.loadLazy) void this.#expandLazyFrontier();
  }

  async #expandLazyFrontier(): Promise<void> {
    for (;;) {
      const frontier = this.#controller
        .flat()
        .list.filter(
          (entry) =>
            entry.expandable &&
            !entry.loaded &&
            this.#controller.loadStates().get(entry.key) !== 'error',
        );
      if (frontier.length === 0) return;

      const results = await Promise.all(
        frontier.map((entry) =>
          this.#controller.ensureChildren(entry.key).then((result) => {
            this.#emitLoad(entry.key, entry.node, result);
            return result;
          }),
        ),
      );
      // No wave resolved anything (all errors/noops) → stop rather than spin.
      if (!results.some((result) => result.status === 'loaded')) return;
      this.#controller.expandAll();
    }
  }

  collapseAll() {
    this.#controller.collapseAll();
  }

  /** Lazily materialized snapshot for persistence — hot paths never pay for it. */
  expandedKeys(): ReadonlySet<string> {
    return new Set(this.#controller.expandedIds());
  }

  setExpanded(keys: Iterable<string>) {
    this.#controller.expandedIds.set(new Set(keys));
  }

  /**
   * Starts inline rename; the consumer renders the input (`isEditing` context).
   * The tree ships NO rename gesture — wire this to your own trigger (a
   * keybinding on the tree element, a context-menu item, a row button, …).
   * Respects `disableEdit`.
   */
  edit(node: T) {
    if (this.disableEdit()?.(node)) return;
    this.#controller.editingId.set(this.expansionKey()(node));
  }

  focus(node: T): void {
    this.#focusKey(this.expansionKey()(node));
  }

  scrollTo(node: T): void {
    const key = this.expansionKey()(node);
    const index = this.visibleRows().findIndex((row) => row.key === key);
    if (index >= 0) this.viewport().scrollToIndex(index);
  }

  /**
   * Opens the projected `treeContextMenu` anchored to the node's row — the
   * `more_vert` row-button pattern. No-op when the node isn't visible or no
   * def is projected.
   */
  openContextMenu(node: T): void {
    const key = this.expansionKey()(node);
    const row = this.visibleRows().find((candidate) => candidate.key === key);
    if (row) this.#openContextMenuAt(row);
  }

  /** Re-runs a failed async `childrenAccessor` (never leave a node stuck). */
  retryChildren(node: T): void {
    const key = this.expansionKey()(node);
    void this.#controller.retryChildren(key).then((result) => this.#emitLoad(key, node, result));
  }

  /**
   * Lazy invalidation (v2): drop resolved children and re-ask the accessor.
   * Expanded nodes reload immediately (per-row `isLoading` shows while the
   * subtree is gone); collapsed nodes reload on their next expand. No
   * argument invalidates tree-wide. The tree still never fetches — it only
   * re-runs *your* accessor; batching and caching stay on your side of it.
   */
  invalidateChildren(node?: T): void {
    const keys =
      node === undefined
        ? this.#controller.invalidateChildren()
        : this.#controller.invalidateChildren(this.expansionKey()(node));

    const expanded = this.#controller.expandedIds();
    const { map } = this.#controller.flat();
    for (const key of keys) {
      const entry = map.get(key);
      if (!entry || !expanded.has(key)) continue; // collapsed: next expand reloads
      void this.#controller
        .ensureChildren(key)
        .then((result) => this.#emitLoad(key, entry.node, result));
    }
  }

  /** Single write path for expansion — emits the `toggled` intent on change. */
  #applyExpansion(node: T, value: boolean) {
    if (this.isExpanded(node) === value) return;
    const key = this.expansionKey()(node);
    this.#controller.setExpanded(key, value);
    this.toggled.emit({ id: key, node, expanded: value });

    // Expand intent triggers the lazy load — rendering never does (ROADMAP:
    // virtualization-proof lazy loading).
    if (value) {
      void this.#controller.ensureChildren(key).then((result) => this.#emitLoad(key, node, result));
    } else if (this.collapseBehavior() === 'invalidate') {
      // Collapse drops the overlay and aborts an in-flight resolve — the next
      // expand re-runs the accessor (v2; `'keep'` preserves v1 semantics).
      this.#controller.invalidateChildren(key);
    }
  }

  #emitLoad(key: string, node: T, result: LoadResult) {
    if (result.status === 'noop') return;
    const event: LoadChildrenEvent<T> =
      result.status === 'loaded'
        ? { id: key, node, status: 'loaded' }
        : { id: key, node, status: 'error', error: result.error };
    this.childrenLoaded.emit(event);
    this.#announce((messages) => messages.childrenLoaded?.(event));
  }

  // ---------------------------------------------------------------------------
  // Live announcements (v2) — polite, via CDK LiveAnnouncer (no DOM shipped)
  // ---------------------------------------------------------------------------

  readonly #liveAnnouncer = inject(LiveAnnouncer);

  /** Instance-bound so defaults can name nodes through `typeaheadText`. */
  readonly #defaultAnnouncements: Required<TreeAnnouncements<T>> = {
    moved: (event) =>
      `${event.dragIds.length} ${event.dragIds.length === 1 ? 'item' : 'items'} ${
        event.dropEffect === 'copy' ? 'copied' : 'moved'
      }`,
    childrenLoaded: (event) => {
      const name = this.typeaheadText()?.(event.node);
      return event.status === 'error'
        ? `Loading ${name ?? 'children'} failed`
        : `${name ?? 'Children'} loaded`;
    },
    searchResults: (count, term) =>
      `${count} ${count === 1 ? 'result' : 'results'} for ${term}`,
    selectionCleared: () => 'Selection cleared',
  };

  #announce(select: (messages: Required<TreeAnnouncements<T>>) => string | undefined) {
    const config = this.announcements();
    if (config === null) return; // consumer-silenced
    const message = select({ ...this.#defaultAnnouncements, ...config });
    if (message) void this.#liveAnnouncer.announce(message, 'polite');
  }

  #commitEdit(key: string, node: T, name: string) {
    // Escape-then-blur double fire: only the first commit/cancel counts.
    if (this.#controller.editingId() !== key) return;
    this.#controller.editingId.set(null);
    this.renamed.emit({ id: key, node, name });
  }

  #cancelEdit(key: string) {
    if (this.#controller.editingId() === key) this.#controller.editingId.set(null);
  }

  /**
   * Checkbox/row selection toggle. Writes go through the consumer's
   * `SelectionModel` when present (the bridge mirrors them back); the
   * controller's Set is only written directly in model-less mode.
   */
  #toggleSelection(key: string, node: T, range = false) {
    if (this.isSelectable()?.(node) === false) return;

    // Shift+checkbox (v2): additive range from the anchor over visible order —
    // the anchor survives so a further shift-click re-ranges from the same spot.
    if (range && this.multi() && this.#selectionAnchor != null && this.#selectionAnchor !== key) {
      this.#selectRange(this.#selectionAnchor, key);
      return;
    }

    this.#selectionAnchor = key;
    const cascade = this.checkboxSelection() && this.multi();
    const { keys, select } = this.#controller.checkToggleDelta(key, cascade);
    const model = this.selection();

    if (model) {
      if (!this.multi()) model.clear();
      if (select) model.select(...keys);
      else model.deselect(...keys);
    } else {
      this.#controller.selectedIds.update((current) => {
        const next = this.multi() ? new Set(current) : new Set<string>();
        for (const k of keys) {
          if (select) next.add(k);
          else next.delete(k);
        }
        return next;
      });
    }

    const ids = [...(model ? model.selected : this.#controller.selectedIds())];
    this.selectionChange.emit({ ids, nodes: this.#controller.nodesForKeys(ids) });
  }
}
