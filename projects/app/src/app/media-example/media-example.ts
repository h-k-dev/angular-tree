import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import {
  AngularTree,
  TreeNodeDef,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

import {
  categoryIds,
  isCategory,
  MEDIA_LIBRARY,
  MediaNode,
  MediaVideo,
  nextVideo,
  parseYouTubeId,
} from './media-data';
import { MediaPlayer } from './media-player/media-player';

/** Card views: the live library or one of the example's real source files. */
type MediaView = 'preview' | 'html' | 'ts' | 'scss' | 'data' | 'player';

const CODE_TABS = [
  {
    id: 'html',
    label: 'HTML',
    file: 'media-example.html',
    lang: 'angular-html',
  },
  { id: 'ts', label: 'TS', file: 'media-example.ts', lang: 'angular-ts' },
  { id: 'scss', label: 'SCSS', file: 'media-example.scss', lang: 'scss' },
  { id: 'data', label: 'Data', file: 'media-data.ts', lang: 'angular-ts' },
  {
    id: 'player',
    label: 'Player',
    file: 'media-player.ts',
    lang: 'angular-ts',
  },
] as const;

/**
 * The Media example: the PLAYER is the canvas — it fills the viewport — and the
 * tree library lives in a glassmorphic panel summoned from a floating button
 * (top-right). Activating a video plays it full-bleed while you keep browsing
 * the library at tree speed; the playing row carries an equalizer badge that
 * survives row recycling (state lives in `nowPlaying`, never in the disposable
 * row — docs/VIRTUALIZATION.md made visible). Focus contract: Enter on the
 * PLAYING row drops focus into the player stage; Escape there pops back to the
 * library (playback continues). When a video ends the playlist advances and
 * the tree scrolls to follow.
 */
@Component({
  selector: 'app-media-example',
  imports: [
    MatButtonModule,
    MatIconModule,
    AngularTree,
    TreeNodeDef,
    TreeNodeToggle,
    MediaPlayer,
  ],
  templateUrl: './media-example.html',
  styleUrl: './media-example.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class MediaExample {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #host: HTMLElement = inject(ElementRef).nativeElement;

  /** Videos added from the paste box (most recent first) — the "History" root. */
  readonly #history = signal<readonly MediaVideo[]>([]);

  /**
   * The tree's data: the curated library, with a "History" category prepended
   * once you've played a pasted URL. Rebuilt only when history changes — the
   * static roots keep their identity (constants), so their accessor memoisation
   * survives (docs/VIRTUALIZATION.md write-back rule, applied to a computed).
   */
  readonly library = computed<readonly MediaNode[]>(() => {
    const history = this.#history();
    return history.length
      ? [
          {
            kind: 'category' as const,
            id: 'history',
            name: 'History',
            children: history,
          },
          ...MEDIA_LIBRARY,
        ]
      : MEDIA_LIBRARY;
  });

  /** Playlist convention: everything open (History too, so a paste is visible). */
  readonly defaultExpanded = [...categoryIds(MEDIA_LIBRARY), 'history'];

  /** The full-bleed video; `null` = the placeholder poster. */
  readonly nowPlaying = signal<MediaVideo | null>(null);

  /** Paste-box state: the current text and whether it failed the URL check. */
  readonly pastedUrl = signal('');
  readonly urlError = signal(false);

  /** A pasted video set playing but not yet committed — History waits for PLAYING. */
  #pendingPaste: MediaVideo | null = null;

  /** The glass library panel — starts open so the library greets you. */
  readonly menuOpen = signal(true);

  /** Player-chrome idle state: pointer/keyboard activity shows it, idle fades it. */
  readonly #chromeVisible = signal(true);
  #idle: ReturnType<typeof setTimeout> | undefined;

  /**
   * Chrome fades ONLY while a video is playing and the library is closed —
   * the poster and the open library always keep their controls. A cross-origin
   * iframe eats pointer moves over the video, so the template overlays a
   * reveal-catcher during the hidden state to bring the chrome back on move.
   */
  readonly chromeHidden = computed(
    () =>
      !this.#chromeVisible() && !this.menuOpen() && this.nowPlaying() != null,
  );

  constructor() {
    // Each new video reveals the chrome, then restarts the idle countdown.
    effect(() => {
      if (this.nowPlaying()) this.revealChrome();
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#idle));
  }

  /** Pointer/keyboard activity: show the chrome, then fade it after a pause. */
  revealChrome(): void {
    this.#chromeVisible.set(true);
    clearTimeout(this.#idle);
    this.#idle = setTimeout(() => this.#chromeVisible.set(false), 2600);
  }

  // TS-private, not #private: Angular query members must be compiler-visible (NG1053).
  private readonly tree = viewChild<AngularTree<MediaNode>>('tree');
  private readonly player = viewChild(MediaPlayer);

  /// Accessors — the tree never learns the MediaNode shape.
  children = (node: MediaNode) =>
    isCategory(node) ? node.children : undefined;
  key = (node: MediaNode) => node.id;
  nodeName = (node: MediaNode) => node.name;
  isCategory = isCategory;

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  onUrlInput(event: Event): void {
    this.pastedUrl.set((event.target as HTMLInputElement).value);
    this.urlError.set(false); // typing clears a previous rejection
  }

  /**
   * Paste-box submit: validate with the simple regex, and if it's a YouTube URL
   * PLAY it — but hold it aside (`#pendingPaste`). It only joins the History
   * root once the player reports PLAYING (`onPlaying`), so a valid-looking but
   * unplayable link never pollutes the tree.
   */
  submitUrl(event: Event): void {
    event.preventDefault();
    const videoId = parseYouTubeId(this.pastedUrl());
    if (!videoId) {
      this.urlError.set(true);
      return;
    }
    this.urlError.set(false);
    const video: MediaVideo = {
      kind: 'video',
      id: `history:${videoId}`,
      name: videoId,
      videoId,
      duration: '—',
    };
    this.#pendingPaste = video;
    this.nowPlaying.set(video);
    this.pastedUrl.set('');
  }

  /** PLAYING fired: commit a pending pasted video to History (dedup, newest first). */
  onPlaying(): void {
    const pending = this.#pendingPaste;
    if (!pending) return;
    this.#pendingPaste = null;
    this.#history.update((list) => [
      pending,
      ...list.filter((video) => video.videoId !== pending.videoId),
    ]);
    void this.#enhanceTitle(pending.videoId);
  }

  /**
   * Best-effort: swap the bare id for the real title via YouTube's key-less
   * oEmbed. If CORS/offline blocks it, the id stays — nothing throws.
   */
  async #enhanceTitle(videoId: string): Promise<void> {
    try {
      const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
      const response = await fetch(url);
      if (!response.ok) return;
      const title = (await response.json())?.title;
      if (typeof title !== 'string' || !title) return;
      this.#history.update((list) =>
        list.map((video) =>
          video.videoId === videoId ? { ...video, name: title } : video,
        ),
      );
      if (this.nowPlaying()?.videoId === videoId)
        this.nowPlaying.update((video) =>
          video ? { ...video, name: title } : video,
        );
    } catch {
      /* oEmbed unreachable — the video id remains the label. */
    }
  }

  /**
   * Enter / double-click. Categories toggle (playlist headers). A NEW video
   * plays full-bleed — focus stays in the library (browse while playing). The
   * PLAYING video drops focus into the player stage — the second half of the
   * roving-tabindex contract (Escape there comes back).
   */
  onActivate(node: MediaNode): void {
    if (isCategory(node)) {
      this.tree()?.toggle(node);
      return;
    }
    if (this.nowPlaying()?.id === node.id) {
      this.player()?.focusStage();
      return;
    }
    this.nowPlaying.set(node);
  }

  /** Player → tree: the ended video advances the playlist and the tree follows. */
  onEnded(): void {
    const current = this.nowPlaying();
    if (!current) return;
    const next = nextVideo(this.library(), current.id);
    if (!next) return;

    this.nowPlaying.set(next);
    const tree = this.tree();
    tree?.scrollTo(next);
    // Polite focus: only chase the playlist when the library is open AND the
    // user is already in the card — never yank focus from elsewhere.
    if (this.menuOpen() && this.#host.contains(document.activeElement))
      tree?.focus(next);
  }

  /** Escape on the stage: reopen the library if needed, then focus the row. */
  onEscaped(): void {
    const current = this.nowPlaying();
    if (!current) return;
    if (this.menuOpen()) {
      this.tree()?.focus(current);
    } else {
      this.menuOpen.set(true);
      // The panel is visibility:hidden until CD flushes the open class — a
      // macrotask lands after it, so the row is focusable by then.
      setTimeout(() => this.tree()?.focus(current));
    }
  }

  /** Close: player instance destroyed (poster returns); focus lands on the row. */
  onClosed(): void {
    const current = this.nowPlaying();
    this.nowPlaying.set(null);
    if (this.menuOpen() && current) this.tree()?.focus(current);
  }

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the example's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [
    { id: 'preview' as const, label: 'Preview' },
    ...CODE_TABS,
  ];

  view = signal<MediaView>('preview');

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({
    html: null,
    ts: null,
    scss: null,
    data: null,
    player: null,
  });

  showView(view: MediaView): void {
    this.view.set(view);
    if (view === 'preview' || this.exampleSource()[view] != null) return;

    const tab = CODE_TABS.find((candidate) => candidate.id === view)!;
    Promise.all([
      fetch(`source/${tab.file}`).then((response) =>
        response.ok
          ? response.text()
          : `// failed to load (${response.status})`,
      ),
      import('shiki'),
    ])
      .then(([code, { codeToHtml }]) =>
        codeToHtml(code, {
          lang: tab.lang,
          themes: { light: 'github-light', dark: 'github-dark' },
        }),
      )
      .then((html) =>
        this.exampleSource.update((sources) => ({
          ...sources,
          // Trusted: generated locally by Shiki from our own source files.
          [view]: this.#sanitizer.bypassSecurityTrustHtml(html),
        })),
      );
  }
}
