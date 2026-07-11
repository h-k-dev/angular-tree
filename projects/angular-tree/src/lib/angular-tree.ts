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
import { LoadResult, TreeController } from './tree-controller';
import { rowElement } from './tree-dom';
import { TreeDragSession } from './tree-drag-session';
import { TreeFocusEngine } from './tree-focus-engine';
import { clampGuideOverlays, computeGuideGroups, GuideOverlay } from './tree-guides';
import { interpretTreeKey, TypeaheadBuffer, typeaheadTarget } from './tree-keyboard';
import { TreeMenuHost } from './tree-menu-host';
import { TreeContextMenu } from './tree-context-menu';
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
  providers: [TreeController, TreeFocusEngine, TreeMenuHost, TreeDragSession],
  // The built-in context-menu trigger (ROADMAP 2026-07-06). TreeMenuHost
  // drives it explicitly (threading the triggering event so it can't
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
  readonly #focus = inject<TreeFocusEngine<T>>(TreeFocusEngine);

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

  /** Menu mechanics live in the engine (tree-menu-host.ts). */
  readonly #menu = inject<TreeMenuHost<T>>(TreeMenuHost);

  /** Context handed to the projected treeContextMenu template. */
  protected readonly contextMenuContext = this.#menu.context;

  /** Gmail-style icon↔checkbox swap driver — reactive via the bridged mirror. */
  readonly selectionActive = computed(() => this.#controller.selectedIds().size > 0);

  /** Type-ahead accumulator (tree-keyboard.ts) — cleared after a pause. */
  readonly #typeahead = new TypeaheadBuffer();

  // ---------------------------------------------------------------------------
  // Drag & drop (Phase 4) — session lifecycle lives in tree-drag-session.ts
  // ---------------------------------------------------------------------------

  readonly #dnd = inject<TreeDragSession<T>>(TreeDragSession);

  protected readonly dragStartDelay = this.#dnd.dragStartDelay;
  protected readonly dragCount = this.#dnd.dragCount;
  protected readonly dropIndicator = this.#dnd.dropIndicator;

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
    const key = this.#focus.effectiveFocusKey();
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
    // afterNextRender, not an effect: viewChild.required throws before the
    // first render, and effects can run that early.
    afterNextRender(() => {
      const viewport = this.viewport();
      this.#renderedRange.set(viewport.getRenderedRange());
      const subscription = viewport.renderedRangeStream.subscribe((range) => this.#renderedRange.set(range));
      this.#destroyRef.onDestroy(() => subscription.unsubscribe());
    });
    this.#menu.connect({ viewport: this.viewport, shell: this.contextMenuShell });
    this.#dnd.connect({
      viewport: this.viewport,
      itemSize: this.itemSize,
      rows: this.visibleRows,
      disableDrop: this.disableDrop,
      expand: (node) => this.expand(node),
      drop: (event) => {
        this.moved.emit(event);
        this.#announce((messages) => messages.moved?.(event));
      },
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
    this.#focus.connect({ viewport: this.viewport, focusMode: this.focusMode });
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
      if (!insideHost) this.#focus.disownFocus();

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
      const tabIndex = computed(() => (this.#focus.effectiveFocusKey() === key ? 0 : -1));
      const moveSource = computed(() => this.#dnd.marked()?.keys.has(key) ?? false);

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

  /** Recomputes only on visibility changes (expand/collapse/search/data) — never on scroll. */
  readonly #guideGroups = computed(() => computeGuideGroups(this.#controller.visibleNodes()));

  /** Guides clamped to the rendered range, in content-wrapper px (see template). */
  protected readonly guideOverlays = computed<readonly GuideOverlay[]>(() =>
    this.indentGuides() ? clampGuideOverlays(this.#guideGroups(), this.#renderedRange(), this.itemSize()) : [],
  );

  /** A guide click collapses — and focuses — the group's expanded parent. */
  protected onGuideClick(parentKey: string) {
    const parent = this.#controller.flat().map.get(parentKey);
    if (!parent) return;
    this.collapse(parent.node);
    this.#focus.focusKey(parentKey);
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
    // via the menu host, threading THIS event so the gesture's trailing pointer
    // event doesn't self-close the menu (the flicker).
    event.preventDefault();
    this.#menu.open(event, at);
  }

  /** Focus bookkeeping lives in the engine (tree-focus-engine.ts). */
  protected onFocusIn(event: FocusEvent) {
    this.#focus.handleFocusIn(event);
  }

  protected onFocusOut(event: FocusEvent) {
    this.#focus.handleFocusOut(event);
  }

  /**
   * One handler over the whole viewport (controller-driven focus — ROADMAP
   * Phase 3 decision): works for targets virtualization hasn't rendered.
   * The key map itself is the pure `interpretTreeKey` (tree-keyboard.ts);
   * this is only the exhaustive dispatch.
   */
  protected onKeydown(event: KeyboardEvent) {
    // Keys inside a rename input belong to the input (Enter/Escape handled
    // by treeNodeEditInput), not to tree navigation.
    if ((event.target as HTMLElement).closest('input[treeNodeEditInput]')) return;

    const rows = this.visibleRows();
    if (rows.length === 0) return;

    const focusKey = this.#focus.effectiveFocusKey();
    const index = Math.max(
      0,
      rows.findIndex((row) => row.key === focusKey),
    );
    const row = rows[index];

    const command = interpretTreeKey(event, {
      rtl: this.#dir.value === 'rtl',
      multi: this.multi(),
      enterAction: this.enterAction(),
      followSelection: this.selectionMode() === 'follow',
      hasMoveMark: this.#dnd.marked() != null,
      hasSelection: this.#controller.selectedIds().size > 0,
      index,
      rowCount: rows.length,
      // Viewport-height jumps (APG optional keys, v2). Layoutless
      // environments report size 0 — clamp to a single-row step.
      pageStep: Math.max(1, Math.floor(this.viewport().getViewportSize() / this.itemSize())),
      rowExpandable: row.expandable,
      rowExpanded: row.context.isExpanded,
      hasChildBelow: rows[index + 1] != null && rows[index + 1].level > row.level,
    });
    if (command == null) return;

    switch (command.kind) {
      case 'markMove':
        this.#dnd.mark(row.key, command.effect);
        break;
      case 'keyboardDrop':
        this.#dnd.keyboardDrop(row, command.zone);
        break;
      case 'selectAllVisible':
        this.#selectAllVisible();
        break;
      case 'selectToEdge':
        this.#selectRange(row.key, rows[command.index].key);
        this.#focusIndex(command.index);
        break;
      case 'clearMoveMark':
        this.#dnd.clearMark();
        break;
      case 'clearSelection':
        this.#selectionAnchor = null;
        this.#writeSelection([], 'replace');
        this.#announce((messages) => messages.selectionCleared?.());
        break;
      case 'focusStep': {
        const focused = this.#focusIndex(command.index);
        if (!focused) break;
        if (command.extend) this.#extendSelection(focused);
        else if (command.follow) this.#followFocus(focused);
        break;
      }
      case 'focusIndex':
        this.#focusIndex(command.index);
        break;
      case 'expandRow':
        this.expand(row.node);
        break;
      case 'collapseRow':
        this.collapse(row.node);
        break;
      case 'focusParent': {
        const parentKey = this.#controller.flat().map.get(row.key)?.parentKey;
        if (parentKey != null) this.#focus.focusKey(parentKey);
        break;
      }
      case 'openContextMenu':
        this.#openContextMenuAt(row);
        break;
      case 'activate':
        this.activated.emit(row.node);
        break;
      case 'beginEdit':
        this.edit(row.node);
        break;
      case 'toggleSelection':
        this.#toggleSelection(row.key, row.node, command.range);
        break;
      case 'consume':
        break;
      case 'typeahead': {
        const text = this.typeaheadText();
        if (!text) return; // inert without the accessor (ROADMAP settled)
        const prefix = this.#typeahead.push(command.char);
        const match = typeaheadTarget(rows, index, prefix, (candidate) => text(candidate.node));
        if (match) this.#focus.focusKey(match.key);
        return; // type-ahead never consumes the event
      }
      default:
        command satisfies never;
    }
    event.preventDefault();
  }

  // ---------------------------------------------------------------------------
  // Pointer drag & drop (Phase 4)
  // ---------------------------------------------------------------------------

  protected previewLabel(node: T): string {
    return this.typeaheadText()?.(node) ?? '';
  }

  /// cdkDrag template bindings — the session lives in tree-drag-session.ts.

  protected onDragStart(row: FlatRow<T>) {
    this.#dnd.dragStart(row);
  }

  protected onDragMove(event: CdkDragMove<unknown>) {
    this.#dnd.dragMove(event);
  }

  protected onDragEnd() {
    this.#dnd.dragEnd();
  }

  /** Focuses the row at `index` (clamped) and returns it — callers must not re-clamp. */
  #focusIndex(index: number): FlatRow<T> | null {
    const rows = this.visibleRows();
    if (rows.length === 0) return null;
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    this.#focus.focusKey(row.key);
    return row;
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
    const rect = rowElement(this.#host, row.key)?.getBoundingClientRect();
    const at = position ?? { x: rect?.left ?? 0, y: rect?.bottom ?? 0 };

    this.contextRequested.emit({ ids, node: row.node, position: at });

    if (!this.contextMenuDef()) return null;
    this.#menu.setContext({
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
    // Without a caller position the anchor comes from the row's rect — but a
    // row outside the rendered range has no DOM (activedescendant keyboard
    // opens, openContextMenu() on a scrolled-away node), and a missed query
    // would anchor the menu — and the contextRequested position — at (0,0).
    // Same race as #focusKey: scroll it into the window, then retry
    // frame-aligned until its DOM exists.
    if (position == null && rowElement(this.#host, row.key) == null) {
      const index = this.visibleRows().findIndex((candidate) => candidate.key === row.key);
      if (index < 0) return;
      this.viewport().scrollToIndex(index);
      this.#menuAttempt = row.key;
      afterNextRender(() => this.#attemptOpenMenu(row.key, 16), { injector: this.#injector });
      return;
    }
    const at = this.#prepareContext(row, position);
    if (at != null) this.#menu.open(null, at);
  }

  /** The menu-anchor target being chased across virtual re-renders. */
  #menuAttempt: string | null = null;

  #attemptOpenMenu(key: string, retries: number) {
    if (this.#menuAttempt !== key) return; // superseded
    if (rowElement(this.#host, key)) {
      this.#menuAttempt = null;
      // Re-resolve by key: the FlatRow from the initiating call may be stale
      // if the data changed while the scroll materialized the row.
      const row = this.visibleRows().find((candidate) => candidate.key === key);
      if (!row) return;
      const at = this.#prepareContext(row);
      if (at != null) this.#menu.open(null, at);
      return;
    }
    if (retries === 0) {
      this.#menuAttempt = null; // row left the visible set (collapse/filter) — give up quietly
      return;
    }
    requestAnimationFrame(() => this.#attemptOpenMenu(key, retries - 1));
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
          (entry) => entry.expandable && !entry.loaded && this.#controller.loadStates().get(entry.key) !== 'error',
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
    this.#focus.focusKey(this.expansionKey()(node));
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
      void this.#controller.ensureChildren(key).then((result) => this.#emitLoad(key, entry.node, result));
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
      return event.status === 'error' ? `Loading ${name ?? 'children'} failed` : `${name ?? 'Children'} loaded`;
    },
    searchResults: (count, term) => `${count} ${count === 1 ? 'result' : 'results'} for ${term}`,
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
