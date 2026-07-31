import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  graphemesOf,
  MiddleEllipsis,
  middleEllipsis,
} from './middle-ellipsis';

/**
 * The pure core is measured with a deterministic fake (10px per grapheme —
 * isolates and the ellipsis count too, mirroring how the real composed-string
 * measurement includes them). Real-font geometry lives in
 * e2e/middle-ellipsis.spec.ts — jsdom has no layout and no canvas.
 */
const measure = (text: string) => graphemesOf(text).length * 10;

describe('middleEllipsis (pure core)', () => {
  it('returns fitting text untouched', () => {
    expect(middleEllipsis('short', 100, measure)).toBe('short');
  });

  it('returns full text when the width is unmeasured (SSR / jsdom / hidden)', () => {
    expect(middleEllipsis('definitely far too long to fit', 0, measure)).toBe(
      'definitely far too long to fit',
    );
  });

  it('cuts the middle, head ⌈k/2⌉ / tail ⌊k/2⌋ (balanced default)', () => {
    // 10 graphemes at 10px each; 60px keeps 5 + the ellipsis.
    expect(middleEllipsis('ABCDEFGHIJ', 60, measure)).toBe('ABC…IJ');
  });

  it('never exceeds maxWidth across the whole collapse ladder', () => {
    const text = 'A rather long playlist entry name.mp4';
    for (let width = 10; width <= 400; width += 10) {
      const result = middleEllipsis(text, width, measure);
      expect(measure(result)).toBeLessThanOrEqual(Math.max(width, 10));
    }
  });

  it('collapses to a bare ellipsis when narrower than the glyph itself', () => {
    expect(middleEllipsis('anything', 5, measure)).toBe('…');
  });

  it("extension mode cuts the STEM balanced and keeps the extension (Finder's rule)", () => {
    const result = middleEllipsis(`${'A'.repeat(20)}.png`, 100, measure, {
      tail: 'extension',
    });
    expect(result).toBe('AAA…AA.png'); // both stem ends survive, ext whole
    expect(measure(result)).toBeLessThanOrEqual(100);

    // The tail is stem-tail + extension — NOT the bare extension (that would
    // read as end-ellipsis with the extension stapled on).
    expect(
      middleEllipsis('ABCDEFGHIJ.md', 80, measure, { tail: 'extension' }),
    ).toBe('AB…IJ.md');
  });

  it('extension gives way when even "…ext" overflows (ladder), and a leading dot is no extension', () => {
    // '.extension' alone is 110px — the ladder falls back to balanced halves.
    expect(
      middleEllipsis('AB.extension', 40, measure, { tail: 'extension' }),
    ).toBe('AB…n');
    // '.gitignore': the dot at index 0 marks a hidden file, not an extension.
    expect(
      middleEllipsis('.gitignore-with-a-long-tail', 60, measure, {
        tail: 'extension',
      }),
    ).toBe('.gi…il');
  });

  it('never bisects a grapheme cluster (emoji ZWJ families survive)', () => {
    const family = '👨‍👩‍👧‍👦';
    const result = middleEllipsis(family.repeat(6), 40, measure);
    for (const grapheme of graphemesOf(result)) {
      expect([family, '…']).toContain(grapheme);
    }
  });

  it('pins mixed-direction halves in bidi isolates (FSI…PDI)', () => {
    const rtl = middleEllipsis('שם קובץ ארוך מאוד בעברית', 100, measure);
    expect(rtl).toContain('\u2068');
    expect(rtl).toContain('\u2069');
    // Pure-LTR text stays free of invisible characters (they'd be copied).
    expect(middleEllipsis('plain latin only here', 100, measure)).not.toMatch(
      /[\u2068\u2069]/,
    );
  });
});

@Component({
  imports: [MiddleEllipsis],
  template: `<span [middleEllipsis]="text()"></span>`,
})
class Host {
  readonly text = signal('An unabridged, fully spelled-out node label');
}

describe('MiddleEllipsis (directive contract)', () => {
  let fixture: ComponentFixture<Host>;
  let label: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    label = fixture.nativeElement.querySelector('span');
  });

  it('renders the full text while unmeasured, with title + aria-label carrying it', () => {
    // jsdom reports no layout — the directive must not truncate blind.
    const full = fixture.componentInstance.text();
    expect(label.textContent).toBe(full);
    expect(label.getAttribute('title')).toBe(full);
    expect(label.getAttribute('aria-label')).toBe(full);
  });

  it('re-derives on text change', async () => {
    fixture.componentInstance.text.set('renamed');
    await fixture.whenStable();
    expect(label.textContent).toBe('renamed');
    expect(label.getAttribute('title')).toBe('renamed');
  });
});
