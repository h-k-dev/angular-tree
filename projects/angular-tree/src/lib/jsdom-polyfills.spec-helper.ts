/**
 * jsdom implements neither `Element.scrollTo` nor smooth scrolling — the CDK
 * virtual viewport calls it on `scrollToIndex`. No-op keeps keyboard-nav specs
 * from surfacing unhandled listener errors; scroll *positions* are asserted
 * in the Phase 8 browser matrix, never in jsdom.
 *
 * Exposed as an explicit function (not a bare side-effect module): the test
 * bundler evaluates environment globals per file, and a callable survives
 * that reliably.
 */
export function polyfillJsdomScrolling(): void {
  if (typeof Element.prototype.scrollTo !== 'function') {
    Object.defineProperty(Element.prototype, 'scrollTo', {
      value: function scrollTo(): void {
        /* jsdom no-op */
      },
      writable: true,
      configurable: true,
    });
  }
}
