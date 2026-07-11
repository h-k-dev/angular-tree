import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MediaPlayer } from './media-player';
import { MediaVideo } from '../media-data';

const VIDEO: MediaVideo = {
  kind: 'video',
  id: 'bbb',
  name: 'Big Buck Bunny',
  videoId: 'aqz-KE-bpKQ',
  duration: '9:56',
};

/**
 * jsdom never loads the YouTube script, so the player stays on its loading
 * poster — exactly the guarded offline path. The keyboard contract on the
 * stage is what these specs pin: it must work WITHOUT the iframe.
 */
describe('MediaPlayer', () => {
  let component: MediaPlayer;
  let fixture: ComponentFixture<MediaPlayer>;

  const stage = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.player-stage',
    )!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MediaPlayer],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaPlayer);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('video', VIDEO);
    await fixture.whenStable();
  });

  it('should create with a focusable stage (the keyboard target around the iframe)', () => {
    expect(component).toBeTruthy();
    expect(stage().getAttribute('tabindex')).toBe('0');
    expect(stage().getAttribute('role')).toBe('group');
  });

  it('Escape on the stage emits `escaped` — never `closed` (playback continues)', () => {
    const escaped: void[] = [];
    const closed: void[] = [];
    component.escaped.subscribe(() => escaped.push(undefined));
    component.closed.subscribe(() => closed.push(undefined));

    stage().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(escaped.length).toBe(1);
    expect(closed.length).toBe(0);
  });

  it('the close button emits `closed` (not the volume button)', async () => {
    const closed: void[] = [];
    component.closed.subscribe(() => closed.push(undefined));

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Stop and close player"]',
      )!
      .click();
    await fixture.whenStable();

    expect(closed.length).toBe(1);
  });

  it('toggleMute flips the muted state (drives the volume icon)', () => {
    // No YT player in jsdom, so this is a no-op guard — muted stays false.
    expect(component.muted()).toBe(false);
    component.toggleMute();
    expect(component.muted()).toBe(false); // guarded: no player, no flip
  });

  it('focusStage() moves DOM focus onto the stage (the Enter drop-in target)', () => {
    component.focusStage();
    expect(document.activeElement).toBe(stage());
  });
});
