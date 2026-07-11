import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MediaExample } from './media-example';
import {
  flattenVideos,
  isCategory,
  MEDIA_LIBRARY,
  nextVideo,
  parseYouTubeId,
} from './media-data';

// jsdom has no Element.scrollTo; the CDK viewport calls it on scrollToIndex
// (same no-op as the lib's jsdom-polyfills.spec-helper — scroll POSITIONS are
// asserted in the browser matrix, never in jsdom).
if (typeof Element.prototype.scrollTo !== 'function') {
  Object.defineProperty(Element.prototype, 'scrollTo', {
    value: function scrollTo(): void {
      /* jsdom no-op */
    },
    writable: true,
    configurable: true,
  });
}

describe('media-data', () => {
  it('flattens videos in DFS order (the auto-advance playlist)', () => {
    const ids = flattenVideos(MEDIA_LIBRARY).map((video) => video.id);
    expect(ids).toEqual([
      'ed',
      'bbb',
      'sintel',
      'tos',
      'cosmos',
      'spring',
      'coffee',
      'charge',
      'spidey',
    ]);
  });

  it('nextVideo walks the playlist and wraps at the end (endless play)', () => {
    expect(nextVideo(MEDIA_LIBRARY, 'ed')?.id).toBe('bbb');
    expect(nextVideo(MEDIA_LIBRARY, 'tos')?.id).toBe('cosmos'); // crosses categories
    expect(nextVideo(MEDIA_LIBRARY, 'charge')?.id).toBe('spidey'); // crosses top folders
    expect(nextVideo(MEDIA_LIBRARY, 'spidey')?.id).toBe('ed'); // wraps
  });

  it('parseYouTubeId extracts the id from every common URL shape, else null', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(
      parseYouTubeId('https://www.youtube.com/watch?t=30&v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(parseYouTubeId('youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(
      parseYouTubeId('https://example.com/watch?v=dQw4w9WgXcQ'),
    ).toBeNull();
    expect(parseYouTubeId('not a url')).toBeNull();
  });
});

describe('MediaExample', () => {
  let component: MediaExample;
  let fixture: ComponentFixture<MediaExample>;

  const video = (id: string) =>
    flattenVideos(MEDIA_LIBRARY).find((candidate) => candidate.id === id)!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MediaExample],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaExample);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('starts with no video playing (the poster, not the player)', () => {
    expect(component).toBeTruthy();
    expect(component.nowPlaying()).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-media-player'),
    ).toBeNull();
  });

  it('activating a video mounts the player; activating a category only toggles', async () => {
    component.onActivate(MEDIA_LIBRARY[0]); // category → toggle, never plays
    await fixture.whenStable();
    expect(component.nowPlaying()).toBeNull();

    component.onActivate(video('sintel'));
    await fixture.whenStable();
    expect(component.nowPlaying()?.id).toBe('sintel');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-media-player'),
    ).not.toBeNull();
  });

  it('ended advances the playlist; close destroys the player (lifecycle)', async () => {
    component.onActivate(video('spidey')); // the last video (the rickroll)
    await fixture.whenStable();

    component.onEnded();
    await fixture.whenStable();
    expect(component.nowPlaying()?.id).toBe('ed'); // wrapped to the first

    component.onClosed();
    await fixture.whenStable();
    expect(component.nowPlaying()).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-media-player'),
    ).toBeNull();
  });

  it('the library panel starts open and toggles', () => {
    expect(component.menuOpen()).toBe(true);
    component.toggleMenu();
    expect(component.menuOpen()).toBe(false);
  });

  it('a click on the outside scrim closes the library', async () => {
    expect(component.menuOpen()).toBe(true);
    const scrim = (fixture.nativeElement as HTMLElement).querySelector(
      '.media-scrim',
    )!;
    scrim.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(component.menuOpen()).toBe(false);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.media-scrim'),
    ).toBeNull();
  });

  it('chrome never hides while the library is open or nothing is playing', async () => {
    expect(component.chromeHidden()).toBe(false); // nothing playing → poster keeps its controls

    component.onActivate(video('bbb'));
    await fixture.whenStable();
    expect(component.menuOpen()).toBe(true);
    expect(component.chromeHidden()).toBe(false); // playing, but the open library pins the chrome
  });

  it('a pasted URL plays immediately but joins History only once it PLAYS', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); // no oEmbed network

    component.pastedUrl.set('https://youtu.be/dQw4w9WgXcQ');
    component.submitUrl(new Event('submit'));
    await fixture.whenStable();

    // Playing, but still pending — not yet in the tree.
    expect(component.urlError()).toBe(false);
    expect(component.nowPlaying()?.videoId).toBe('dQw4w9WgXcQ');
    expect(component.library().some((node) => node.id === 'history')).toBe(
      false,
    );

    component.onPlaying();
    await fixture.whenStable();

    const history = component.library().find((node) => node.id === 'history');
    expect(history && isCategory(history)).toBe(true);
    expect(
      isCategory(history!) &&
        history.children.some(
          (v) => v.kind === 'video' && v.videoId === 'dQw4w9WgXcQ',
        ),
    ).toBe(true);
  });

  it('an invalid URL is rejected — no play, no History', () => {
    component.pastedUrl.set('https://example.com/not-youtube');
    component.submitUrl(new Event('submit'));

    expect(component.urlError()).toBe(true);
    expect(component.nowPlaying()).toBeNull();
    expect(component.library().some((node) => node.id === 'history')).toBe(
      false,
    );
  });

  it('marks the playing row with the equalizer badge (state outside rows)', async () => {
    component.onActivate(video('bbb'));
    await fixture.whenStable();

    const playingRow = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-node-id="bbb"]',
    );
    expect(playingRow?.querySelector('.media-eq')).not.toBeNull();
    expect(playingRow?.textContent).toContain('(now playing)'); // the AT announcement
  });
});
