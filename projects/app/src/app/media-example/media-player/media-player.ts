import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { MediaVideo } from '../media-data';

/**
 * Minimal YouTube IFrame API surface — the untyped external world typed at
 * exactly this boundary (STYLE.md § Boundaries). Loaded key-less from
 * youtube.com; only playback talks to YouTube.
 */
interface YtPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

interface YtNamespace {
  Player: new (
    element: HTMLElement,
    config: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number>;
      events: { onReady(): void; onStateChange(event: { data: number }): void };
    },
  ) => YtPlayer;
  PlayerState: { ENDED: number; PLAYING: number };
}

/** One script load per app — every player instance shares the namespace. */
let iframeApi: Promise<YtNamespace> | null = null;

function loadIframeApi(): Promise<YtNamespace> {
  if (iframeApi) return iframeApi;
  iframeApi = new Promise<YtNamespace>((resolve, reject) => {
    const win = window as unknown as {
      YT?: YtNamespace;
      onYouTubeIframeAPIReady?: () => void;
    };
    if (win.YT?.Player) return resolve(win.YT);
    // The API script calls this global once ready (its documented handshake).
    win.onYouTubeIframeAPIReady = () => resolve(win.YT!);
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () =>
      reject(new Error('YouTube IFrame API failed to load'));
    document.head.append(script);
  });
  return iframeApi;
}

/**
 * The dock's player: ONE YT.Player instance per mount — video changes reuse it
 * via `loadVideoById` (destroy/recreate would lose the user-gesture autoplay
 * grant), and `ngOnDestroy`-time teardown runs through `DestroyRef`. The
 * focusable STAGE around the iframe is the keyboard contract: a cross-origin
 * iframe swallows keydown, so Escape/Space/arrows must be handled on a wrapper
 * we own — Escape pops focus back to the tree (playback continues), Space/K
 * toggles, ←/→ seeks. `focusStage()` is the "Enter drops focus in" target.
 */
@Component({
  selector: 'app-media-player',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './media-player.html',
  styleUrl: './media-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The parent hides the chrome after idle — fade this component's status
  // strip with it (a cross-origin iframe can't tell us its own hover state).
  host: { '[attr.data-chrome]': "chromeHidden() ? 'hidden' : null" },
})
export class MediaPlayer {
  /** What to play — same instance across changes (see class docs). */
  readonly video = input.required<MediaVideo>();

  /** Parent's idle state — true fades the status strip away. */
  readonly chromeHidden = input(false);

  /** Playback finished — the parent advances the playlist (tree scrolls along). */
  readonly ended = output<void>();

  /** Fires on each PLAYING transition — the parent commits a pasted URL to History. */
  readonly playing = output<void>();

  /** Escape on the stage — the parent returns focus to the tree; playback continues. */
  readonly escaped = output<void>();

  /** Close button — the parent tears the dock (and this component) down. */
  readonly closed = output<void>();

  readonly #host: HTMLElement = inject(ElementRef).nativeElement;

  readonly ready = signal(false);

  /** Mirrors the YT player's mute state — drives the volume icon. */
  readonly muted = signal(false);

  #player: YtPlayer | null = null;
  #loadedVideoId: string | null = null;
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#player?.destroy();
    });

    afterNextRender(() => void this.#init());

    // Video switches reuse the live player (autoplay grant survives).
    effect(() => {
      const videoId = this.video().videoId;
      if (this.ready() && this.#player && videoId !== this.#loadedVideoId) {
        this.#loadedVideoId = videoId;
        this.#player.loadVideoById(videoId);
      }
    });
  }

  async #init(): Promise<void> {
    try {
      const yt = await loadIframeApi();
      if (this.#destroyed) return;
      const mount = this.#host.querySelector<HTMLElement>('.player-mount')!;
      this.#loadedVideoId = this.video().videoId;
      this.#player = new yt.Player(mount, {
        videoId: this.#loadedVideoId,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0 },
        events: {
          onReady: () => {
            this.ready.set(true);
            this.muted.set(this.#player?.isMuted() ?? false);
          },
          onStateChange: (event) => {
            if (this.#destroyed) return;
            if (event.data === yt.PlayerState.ENDED) this.ended.emit();
            else if (event.data === yt.PlayerState.PLAYING) this.playing.emit();
          },
        },
      });
    } catch {
      // Offline / test env: the stage keeps its loading poster — nothing throws.
    }
  }

  /** The "Enter drops focus into the player" target (tree keyboard contract). */
  focusStage(): void {
    this.#host.querySelector<HTMLElement>('.player-stage')?.focus();
  }

  protected onStageKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.escaped.emit();
        break;
      case ' ':
      case 'k':
        event.preventDefault(); // Space must not scroll the page
        this.#togglePlayback();
        break;
      case 'm':
        this.toggleMute();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.#seekBy(-5);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.#seekBy(5);
        break;
    }
  }

  toggleMute(): void {
    const player = this.#player;
    if (!player) return;
    const next = !this.muted();
    if (next) player.mute();
    else player.unMute();
    this.muted.set(next);
  }

  #togglePlayback(): void {
    const player = this.#player;
    if (!player) return;
    // PLAYING is the only state Space should pause out of; everything else plays.
    if (player.getPlayerState() === 1) player.pauseVideo();
    else player.playVideo();
  }

  #seekBy(seconds: number): void {
    const player = this.#player;
    if (!player) return;
    player.seekTo(Math.max(0, player.getCurrentTime() + seconds), true);
  }
}
