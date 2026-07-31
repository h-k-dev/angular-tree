import {
  afterNextRender,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

// ---------------------------------------------------------------------------
// Pure core — standalone functions (STYLE.md § Feature Engines): everything
// that computes a string from values lives here, testable with a fake
// measurer; the directive below is only lifecycle (observers, DOM writes).
// ---------------------------------------------------------------------------

/** Width of a single-line string in CSS px, in the label's own font. */
export type TextMeasure = (text: string) => number;

export interface MiddleEllipsisOptions {
  /**
   * `'balanced'` (default) keeps roughly equal halves — AppKit's
   * `NSLineBreakByTruncatingMiddle`. `'extension'` cuts the STEM balanced and
   * keeps everything after the last `.` intact on the tail (Finder never
   * truncates the extension — but both ends of the name still survive:
   * `virtualized-expl…ering.component.spec.ts`, never `virtualized-exp….ts`);
   * names without a `.` fall back to balanced.
   */
  readonly tail?: 'balanced' | 'extension';
}

const ELLIPSIS = '\u2026'; // '…' — one glyph, never three periods (the macOS form)

/** Strong-RTL presence — Hebrew, Arabic + presentation forms, Syriac, Thaana. */
const STRONG_RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

const FSI = '\u2068'; // FIRST STRONG ISOLATE
const PDI = '\u2069'; // POP DIRECTIONAL ISOLATE

const segmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/** Grapheme clusters — a naive slice() bisects emoji ZWJ sequences and
 * combining marks; code points (`[...text]`) are the degraded fallback. */
export function graphemesOf(text: string): readonly string[] {
  return segmenter
    ? [...segmenter.segment(text)].map((segment) => segment.segment)
    : [...text];
}

/**
 * Splicing mixed-direction text can visually reorder the halves around the
 * ellipsis, so each half is pinned in a bidi isolate (FSI…PDI) when strong
 * RTL is present. Applied at composition — the isolates are part of the
 * measured string, so measurement and rendering never disagree.
 */
function compose(head: string, tail: string, isolate: boolean): string {
  const wrap = (part: string) =>
    part && isolate ? `${FSI}${part}${PDI}` : part;
  return `${wrap(head)}${ELLIPSIS}${wrap(tail)}`;
}

/**
 * Largest `count` in [0, max] for which `fits(count)` holds, or -1 for none.
 * Width grows with kept-grapheme count, so the predicate is monotone.
 */
function largestFitting(max: number, fits: (count: number) => boolean): number {
  let low = 0;
  let high = max;
  let best = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (fits(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

/**
 * macOS-style middle truncation: `head…tail` capped at `maxWidth`.
 *
 * Every candidate is measured as the COMPOSED string — summing half-widths
 * lies whenever kerning or ligatures cross the cut. Both tail policies cut
 * BALANCED halves — extension mode cuts the STEM balanced and appends the
 * whole extension (a bare-extension tail would read as end-ellipsis with the
 * extension stapled on, not a middle cut). Collapse ladder as width shrinks:
 * balanced middle cut → (extension mode) the stem gives way around the held
 * extension → the extension gives way too → bare `…`. `maxWidth <= 0` means
 * "layout hasn't happened" (SSR, jsdom, display:none) — the full text returns
 * untouched rather than everything collapsing to `…`.
 */
export function middleEllipsis(
  text: string,
  maxWidth: number,
  measure: TextMeasure,
  options: MiddleEllipsisOptions = {},
): string {
  if (maxWidth <= 0 || measure(text) <= maxWidth) return text;

  const isolate = STRONG_RTL.test(text);
  const fitsComposed = (head: string, tail: string) =>
    measure(compose(head, tail, isolate)) <= maxWidth;

  // Balanced cut over `parts`: keep k graphemes, head ⌈k/2⌉ / tail ⌊k/2⌋,
  // `suffix` (the protected extension) rides along whole on the tail side.
  // Returns null when nothing fits — the caller steps down the ladder.
  const cutBalanced = (
    parts: readonly string[],
    suffix: string,
  ): string | null => {
    const halves = (count: number): [string, string] => [
      parts.slice(0, Math.ceil(count / 2)).join(''),
      (count ? parts.slice(parts.length - (count >> 1)).join('') : '') +
        suffix,
    ];
    const keep = largestFitting(parts.length - 1, (count) =>
      fitsComposed(...halves(count)),
    );
    return keep < 0 ? null : compose(...halves(keep), isolate);
  };

  if (options.tail === 'extension') {
    const dot = text.lastIndexOf('.');
    // A leading dot (".gitignore") or no dot has no extension to protect.
    if (dot > 0) {
      const result = cutBalanced(graphemesOf(text.slice(0, dot)), text.slice(dot));
      if (result !== null) return result;
      // Even `…ext` overflows — the extension itself must give way (ladder).
    }
  }

  return cutBalanced(graphemesOf(text), '') ?? ELLIPSIS; // floor: the glyph alone
}

/** One shared 2D context — measurement is layout-free by design (probing
 * scrollWidth per candidate would force synchronous reflow). */
let sharedContext: CanvasRenderingContext2D | null | undefined;

/**
 * A `TextMeasure` in the element's computed font. The font is (re)applied on
 * every call — the context is shared across all directive instances.
 */
export function cssTextMeasure(element: Element): TextMeasure | null {
  sharedContext ??= document.createElement('canvas').getContext('2d');
  const context = sharedContext;
  if (!context) return null;
  const style = getComputedStyle(element);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const letterSpacing =
    style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  return (text) => {
    context.font = font;
    if ('letterSpacing' in context) context.letterSpacing = letterSpacing;
    return context.measureText(text).width;
  };
}

// ---------------------------------------------------------------------------
// Directive — lifecycle shell
// ---------------------------------------------------------------------------

/**
 * macOS-Finder-style middle truncation for node labels: `head…tail` instead
 * of CSS's end-only `text-overflow`. The directive OWNS the element's text —
 * leave the element empty and bind the full string:
 *
 * ```html
 * <span class="node-name" [middleEllipsis]="node.name"></span>
 * ```
 *
 * Contract:
 * - The element's inline size must be content-independent (`flex: 1 1 auto;
 *   min-inline-size: 0`, or a fixed width) — a shrink-to-content box resizes
 *   when its text is replaced, and the re-truncation loop would chase its own
 *   output. Pair with the tree's `labelOverflow: 'ellipsis'`, which caps rows
 *   at the viewport; without it the row grows with the text and nothing ever
 *   overflows.
 * - The full text stays reachable: `title` (hover tooltip) and `aria-label`
 *   always carry the untruncated string, and the tree's type-ahead reads the
 *   `typeaheadText` accessor, never the rendered DOM.
 * - Re-derives on text change, element resize, and web-font arrival
 *   (`document.fonts` — measuring before the font loads is confidently
 *   wrong). Measurement is canvas-based and layout-free; a ~1px margin
 *   absorbs canvas-vs-DOM rendering drift.
 */
@Directive({
  selector: '[middleEllipsis]',
  host: {
    '[attr.title]': 'middleEllipsis()',
    '[attr.aria-label]': 'middleEllipsis()',
  },
})
export class MiddleEllipsis {
  readonly #element: HTMLElement = inject(ElementRef).nativeElement;

  /** The full, untruncated label text. */
  readonly middleEllipsis = input.required<string>();

  /** Tail policy — see {@link MiddleEllipsisOptions}. */
  readonly middleEllipsisTail = input<'balanced' | 'extension'>('balanced');

  /** Layout-derived inline size; 0 until `afterNextRender` (SSR-safe). */
  readonly #width = signal(0);

  /** Bumped when `document.fonts` finishes a load — metrics changed. */
  readonly #fontsGeneration = signal(0);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Observers exist only in the browser; until layout reports a width the
    // effect below renders the full text (which is also the SSR output).
    afterNextRender(() => {
      // Layout-less environments (jsdom) have no ResizeObserver — without a
      // width the effect keeps rendering the full text, which is correct there.
      if (typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver((entries) =>
        this.#width.set(entries[0].contentRect.width),
      );
      observer.observe(this.#element);
      destroyRef.onDestroy(() => observer.disconnect());

      const fonts = document.fonts;
      if (fonts) {
        const onLoaded = () => this.#fontsGeneration.update((n) => n + 1);
        fonts.addEventListener('loadingdone', onLoaded);
        destroyRef.onDestroy(() =>
          fonts.removeEventListener('loadingdone', onLoaded),
        );
      }
    });

    // DOM sync is a process, not a derivation — hence an effect. The measurer
    // is rebuilt per run: font metrics may have changed (#fontsGeneration).
    effect(() => {
      const text = this.middleEllipsis();
      const width = this.#width();
      this.#fontsGeneration();
      const measure = width > 0 ? cssTextMeasure(this.#element) : null;
      this.#element.textContent = measure
        ? middleEllipsis(text, width - 1, measure, {
            tail: this.middleEllipsisTail(),
          })
        : text;
    });
  }
}
