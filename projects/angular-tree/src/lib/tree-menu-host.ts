import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
  afterNextRender,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  Service,
  signal,
  Signal,
  TemplateRef,
} from '@angular/core';

import { TreeContextMenuContext } from './tree-context-menu';
import { TreeController } from './tree-controller';
import { TreeFocusEngine } from './tree-focus-engine';

/** Signals the host component hands over once at construction. */
export interface TreeMenuHostInputs {
  viewport: Signal<CdkVirtualScrollViewport>;
  /** The `cdkMenu` shell wrapping the projected `treeContextMenu` items. */
  shell: Signal<TemplateRef<unknown>>;
}

/**
 * Built-in context-menu mechanics (ROADMAP Phase 7/8): arming the
 * `CdkContextMenuTrigger` host directive per event, the `_open` quarantine,
 * focus hand-off into the menu, Escape containment (matrix bug #2),
 * close-on-scroll (settled), and the close-time focus reclaim (matrix bugs
 * #3 + #7). Owns the lifecycle: trigger subscriptions, the outside-pointer
 * tracker, and the suppress/closed-by-pointer flags between them.
 * CDK touchpoints: `CdkContextMenuTrigger` (incl. the internal `_open` —
 * the single quarantined cast), overlay container DOM, viewport
 * `elementScrolled` for close-on-scroll.
 * Selection reconciliation and `contextRequested` stay in the component —
 * they are intent, not menu mechanics.
 */
@Service({ autoProvided: false })
export class TreeMenuHost<T = unknown> {
  readonly #controller = inject<TreeController<T>>(TreeController);
  readonly #focus = inject<TreeFocusEngine<T>>(TreeFocusEngine);
  readonly #injector = inject(Injector);
  readonly #destroyRef = inject(DestroyRef);
  readonly #host: HTMLElement = inject(ElementRef).nativeElement;

  /** The built-in menu's trigger (host directive) — armed per-event by `open`. */
  readonly #trigger = inject(CdkContextMenuTrigger, { self: true });

  /** Scroll-dismiss must not reclaim focus (it would scroll right back). */
  #suppressFocusRestore = false;

  /** An outside pointer-down closed the menu — the click target keeps focus. */
  #closedByPointer = false;
  #pointerCleanup: (() => void) | null = null;

  /** Context handed to the projected treeContextMenu template. */
  readonly #context = signal<TreeContextMenuContext<T> | null>(null);
  readonly context = this.#context.asReadonly();

  constructor() {
    // Disabled at rest: `open` un-gates it only for its own synchronous
    // call, so CDK's own contextmenu listener can't open a stale menu on an
    // empty-space click, and every open funnels through the tree.
    this.#trigger.disabled = true;
  }

  /** Must be called exactly once, from the component's constructor. */
  connect(inputs: TreeMenuHostInputs) {
    // afterNextRender, not an effect: viewChild.required throws before the
    // first render, and effects can run that early.
    afterNextRender(
      () => {
        this.#trigger.menuTemplateRef = inputs.shell();

        // Close-on-scroll (settled): under virtualization the anchor row's DOM
        // is destroyed when it leaves the render range — repositioning would
        // track a recycled element. Focus restore is suppressed here: pulling
        // focus back to the row would `scrollToIndex` straight back against
        // the user's scroll.
        const scrollSubscription = inputs
          .viewport()
          .elementScrolled()
          .subscribe(() => {
            if (!this.#trigger.isOpen()) return;
            this.#suppressFocusRestore = true;
            this.#trigger.close();
            this.#suppressFocusRestore = false;
          });

        // Menu close hands focus back to the row (matrix: "restores focus to
        // the row on close") — CDK restores to its trigger host, which is the
        // tree element, not the roving-tabindex row. Microtask: teardown must
        // finish first. Two guards: outside-pointer closes keep the user's
        // click target (tracked in `open`), and an element the close
        // genuinely focused (e.g. rename's edit input) wins — only orphaned
        // focus is reclaimed. "Orphaned" includes tabindex:-1 containers: a
        // MatDialog focus trap re-anchors to its container when the menu DOM
        // vanishes, and leaving focus there strands keyboard users.
        const closedSubscription = this.#trigger.closed.subscribe(() => {
          this.#pointerCleanup?.();
          if (this.#suppressFocusRestore || this.#closedByPointer) return;
          const key = this.#controller.focusedId();
          if (key == null) return;
          queueMicrotask(() => {
            // A menu item that began a rename owns the hand-off: the edit input
            // mounts on the NEXT render, invisible to the orphan check below —
            // reclaiming the row would blur the input the moment it autofocuses,
            // and blur commits: the rename dies untouched before the user types
            // (matrix bug #7).
            if (this.#controller.editingId() != null) return;
            const active = this.#host.ownerDocument.activeElement as HTMLElement | null;
            const orphaned = active == null || active === this.#host.ownerDocument.body || active.tabIndex < 0;
            if (orphaned) this.#focus.focusKey(key);
          });
        });

        this.#destroyRef.onDestroy(() => {
          scrollSubscription.unsubscribe();
          closedSubscription.unsubscribe();
          this.#pointerCleanup?.(); // destroy with the menu still open
        });
      },
      { injector: this.#injector },
    );
  }

  /** Context for the projected items — set by the component before `open`. */
  setContext(context: TreeContextMenuContext<T>) {
    this.#context.set(context);
  }

  /**
   * Opens the built-in menu at `at`. `userEvent` (the triggering
   * `contextmenu`, or `null` for keyboard/API) is threaded into CDK's
   * `_open` so the outside-click stream skips the gesture's own trailing
   * pointer event — the public `open()` omits it and the menu self-closes
   * (the flicker).
   *
   * `_open` is CDK-internal (no public coordinate+event overload) — the
   * single quarantined boundary here.
   */
  open(userEvent: MouseEvent | null, at: { x: number; y: number }) {
    const trigger = this.#trigger as unknown as {
      _open(event: MouseEvent | null, coordinates: { x: number; y: number }): void;
    };
    this.#trigger.disabled = false;
    try {
      trigger._open(userEvent, at);
    } finally {
      // finally: a throw out of the CDK-internal _open (a version bump away)
      // must not leave the trigger armed — its own contextmenu listener would
      // then open stale menus on empty-space clicks. Never closes an open menu.
      this.#trigger.disabled = true;
    }

    // CDK's context trigger leaves focus on the row — in a real browser the
    // menu then ignores Escape and arrow keys until clicked (Phase 8 matrix
    // find; jsdom couldn't see it). Mouse opens focus the shell (Escape +
    // arrow entry work, no item pre-highlight — OS menu behavior);
    // keyboard/API opens land on the first item (APG menu pattern). Overlay
    // attach is synchronous, so the menu DOM exists here; last match wins if
    // several trees render menus into the shared overlay container.
    const menus = this.#host.ownerDocument.querySelectorAll<HTMLElement>('.cdk-overlay-container .tree-menu');
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
    this.#closedByPointer = false;
    this.#pointerCleanup?.();
    const doc = this.#host.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.tree-menu')) {
        this.#closedByPointer = true;
      }
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    this.#pointerCleanup = () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      this.#pointerCleanup = null;
    };
  }
}
