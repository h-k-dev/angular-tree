import { CdkDragMove } from '@angular/cdk/drag-drop';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  Service,
  signal,
  Signal,
} from '@angular/core';

import type { MoveEvent } from './events';
import { DropTarget, dropZoneAt, TreeController } from './tree-controller';
import type { TreeDropContext } from './types';

/** The row facts a drag needs — structurally satisfied by the component's FlatRow. */
export interface DragRow<T> {
  readonly key: string;
  readonly node: T;
  readonly level: number;
  readonly expandable: boolean;
  readonly context: { readonly isExpanded: boolean };
}

/** Purely visual drop marker — never reorders DOM mid-drag (ROADMAP Phase 4). */
export interface DropIndicator {
  /** Viewport-relative px (the indicator overlays the viewport, not the content). */
  readonly top: number;
  readonly height: number;
  readonly inside: boolean;
  readonly level: number;
}

/** Signals and intent callbacks the host component hands over once at construction. */
export interface TreeDragSessionInputs<T> {
  viewport: Signal<CdkVirtualScrollViewport>;
  itemSize: Signal<number>;
  rows: Signal<readonly DragRow<T>[]>;
  disableDrop: Signal<((ctx: TreeDropContext<T>) => boolean) | undefined>;
  /** Expand intent — must go through the component's single write path (toggled + lazy load). */
  expand: (node: T) => void;
  /** A validated drop was released — the component emits `moved` and announces. */
  drop: (event: MoveEvent<T>) => void;
}

/**
 * Pointer drag & drop (ROADMAP Phase 4) plus the keyboard move mark
 * (WCAG 2.5.7 — every drag has a non-pointer path). The zone/target *math*
 * is pure and lives in the controller (`dropZoneAt`, `dropTargetFor`); this
 * engine owns only the session lifecycle STYLE.md assigns to a class: the
 * drag/indicator/mark signals, the edge auto-scroll rAF loop, the
 * hover-expand timer, the mid-drag Escape listener, and the wheel-scroll
 * re-target subscription.
 * CDK touchpoints: `cdkDrag` events (start/move/end — the component's
 * template binds them through), `CdkVirtualScrollViewport`
 * (`measureScrollOffset`/`scrollToOffset` for manual auto-scroll: standard
 * `cdkDropList` auto-scroll doesn't know the virtual viewport).
 */
@Service({ autoProvided: false })
export class TreeDragSession<T = unknown> {
  readonly #controller = inject<TreeController<T>>(TreeController);
  readonly #injector = inject(Injector);
  readonly #destroyRef = inject(DestroyRef);
  readonly #host: HTMLElement = inject(ElementRef).nativeElement;

  #inputs!: TreeDragSessionInputs<T>;

  /**
   * Touch decision (ROADMAP): context menu owns long-press, so touch-initiated
   * drags are effectively disabled; keyboard move is the non-pointer path.
   */
  readonly dragStartDelay = { mouse: 0, touch: 1 << 30 };

  readonly #drag = signal<{
    keys: readonly string[];
    nodes: readonly T[];
  } | null>(null);
  readonly dragCount = computed(() => this.#drag()?.keys.length ?? 0);

  readonly #dropIndicator = signal<DropIndicator | null>(null);
  readonly dropIndicator = this.#dropIndicator.asReadonly();

  /** The validated destination the next release commits to (plain field: read once). */
  #pendingDrop: DropTarget<T> | null = null;
  #lastPointerY = 0;
  #autoScrollStep = 0;
  #autoScrollFrame: number | undefined;
  #hoverExpand:
    { key: string; timer: ReturnType<typeof setTimeout> } | undefined;

  /** Cut/paste-style keyboard move — rows read this for their `data-move-source` affordance. */
  readonly #marked = signal<{
    keys: ReadonlySet<string>;
    nodes: readonly T[];
    effect: 'move' | 'copy';
  } | null>(null);
  readonly marked = this.#marked.asReadonly();

  /** Must be called exactly once, from the component's constructor. */
  connect(inputs: TreeDragSessionInputs<T>) {
    this.#inputs = inputs;

    // afterNextRender, not an effect: viewChild.required throws before the
    // first render, and effects can run that early.
    afterNextRender(
      () => {
        // Wheel-scroll mid-drag (v2): the pointer is stationary, so no
        // pointermove re-targets the drop — re-run it from the last known
        // pointer position or the indicator tracks a recycled row.
        const subscription = inputs
          .viewport()
          .elementScrolled()
          .subscribe(() => {
            if (this.#drag()) this.#updateDropTarget(this.#lastPointerY);
          });
        this.#destroyRef.onDestroy(() => subscription.unsubscribe());
      },
      { injector: this.#injector },
    );
    // Destroy mid-drag: timers, the rAF loop, and the Escape listener must
    // not outlive the tree.
    this.#destroyRef.onDestroy(() => this.#reset());
  }

  /** Marks the pressed row's pruned drag set for a keyboard drop (Ctrl+X / Ctrl+C). */
  mark(pressedKey: string, effect: 'move' | 'copy') {
    const keys = this.#controller.dragKeysFor(pressedKey);
    this.#marked.set({
      keys: new Set(keys),
      nodes: this.#controller.nodesForKeys(keys),
      effect,
    });
  }

  clearMark() {
    this.#marked.set(null);
  }

  /** Same validation and `MoveEvent` as a pointer drop — only the input differs. */
  keyboardDrop(row: DragRow<T>, zone: 'inside' | 'after') {
    const marked = this.#marked();
    if (!marked) return;

    const keys = [...marked.keys];
    const target = this.#controller.dropTargetFor(keys, row.key, zone);
    if (!target) return;
    if (
      this.#inputs.disableDrop()?.({
        dragNodes: marked.nodes,
        parentNode: target.parentNode,
        index: target.index,
      })
    ) {
      return;
    }

    this.#marked.set(null);
    this.#inputs.drop({
      dragIds: keys,
      dragNodes: marked.nodes,
      parentId: target.parentKey,
      parentNode: target.parentNode,
      index: target.index,
      dropEffect: marked.effect,
    });
  }

  dragStart(row: DragRow<T>) {
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

  dragMove(event: CdkDragMove<unknown>) {
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
    const isApple = /Mac|iP(hone|ad|od)/.test(
      globalThis.navigator?.platform ?? '',
    );
    return isApple ? event.altKey : event.ctrlKey;
  }

  /** Copy modifier state at the latest drag move — read at drop. */
  #dragCopy = false;

  dragEnd() {
    const drag = this.#drag();
    const drop = this.#pendingDrop;
    if (drag && drop && !this.#dragCancelled) {
      this.#inputs.drop({
        dragIds: drag.keys,
        dragNodes: drag.nodes,
        parentId: drop.parentKey,
        parentNode: drop.parentNode,
        index: drop.index,
        dropEffect: this.#dragCopy ? 'copy' : 'move',
      });
    }
    this.#reset();
  }

  /** Fixed `itemSize` makes hovered row + zone pure arithmetic — no hit testing. */
  #updateDropTarget(clientY: number) {
    const drag = this.#drag();
    if (!drag) return;

    const viewport = this.#inputs.viewport();
    const viewportTop =
      viewport.elementRef.nativeElement.getBoundingClientRect().top;
    const size = this.#inputs.itemSize();
    const contentY = clientY - viewportTop + viewport.measureScrollOffset();
    const rows = this.#inputs.rows();
    const index = Math.floor(contentY / size);

    if (index < 0 || index >= rows.length) {
      this.#clearDropTarget();
      return;
    }

    const row = rows[index];
    const zone = dropZoneAt(contentY - index * size, size);
    // The 'after' line under an EXPANDED row sits visually between the row and
    // its first child — resolve to that slot (first child, react-arborist
    // parity). Sibling-after would land the drop below the row's entire
    // subtree, far from the line. Keyboard 'after' (Ctrl+Shift+V) keeps
    // sibling semantics: no indicator justifies the remap there.
    const insideFirst =
      zone === 'after' && row.expandable && row.context.isExpanded;
    const resolved = this.#controller.dropTargetFor(
      drag.keys,
      row.key,
      insideFirst ? 'inside' : zone,
    );
    const target =
      insideFirst && resolved ? { ...resolved, index: 0 } : resolved;
    const forbidden =
      target != null &&
      (this.#inputs.disableDrop()?.({
        dragNodes: drag.nodes,
        parentNode: target.parentNode,
        index: target.index,
      }) ??
        false);

    this.#scheduleHoverExpand(
      zone === 'inside' && target != null && !forbidden ? row : null,
    );

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
            // First-child remap: the line indents one level deeper so it
            // reads as "will become a child", not a sibling.
            level: insideFirst ? row.level + 1 : row.level,
          },
    );
  }

  /** Hovering the make-child zone auto-expands after a delay (ROADMAP). */
  #scheduleHoverExpand(row: DragRow<T> | null) {
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
        this.#inputs.expand(row.node);
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
    const rect = this.#inputs
      .viewport()
      .elementRef.nativeElement.getBoundingClientRect();
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
    const viewport = this.#inputs.viewport();
    viewport.scrollToOffset(
      viewport.measureScrollOffset() + this.#autoScrollStep,
    );
    this.#updateDropTarget(this.#lastPointerY);
    this.#autoScrollFrame = requestAnimationFrame(this.#autoScrollTick);
  };

  #clearDropTarget() {
    this.#pendingDrop = null;
    this.#dropIndicator.set(null);
  }

  #reset() {
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
}
