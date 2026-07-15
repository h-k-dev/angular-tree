import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  debounced,

  // Signals
  computed,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import axios from 'axios';

import {
  AngularTree,
  MoveEvent,
  TreeEmptyDef,
  TreeLoadingDef,
  TreeNodeDef,
} from '@h-k-dev/angular-tree';

import {
  AIC_FIELDS,
  AIC_SEARCH_URL,
  AicArtwork,
  applyMove,
  artworkImage,
  countAssets,
  EMPTY_WALL,
  findAsset,
  isCollection,
  mapArtworks,
  WallAsset,
  WallData,
  WallNode,
} from './wall-data';
import { ImageViewer } from './image-viewer/image-viewer';

/** Card views: the live wall or one of the example's real source files. */
type WallView = 'preview' | 'html' | 'ts' | 'scss' | 'data' | 'viewer';

const CODE_TABS = [
  {
    id: 'html',
    label: 'HTML',
    file: 'wall-example.html',
    lang: 'angular-html',
  },
  { id: 'ts', label: 'TS', file: 'wall-example.ts', lang: 'angular-ts' },
  { id: 'scss', label: 'SCSS', file: 'wall-example.scss', lang: 'scss' },
  { id: 'data', label: 'Data', file: 'wall-data.ts', lang: 'angular-ts' },
  {
    id: 'viewer',
    label: 'Viewer',
    file: 'image-viewer.ts',
    lang: 'angular-ts',
  },
] as const;

/** A recognisable, image-rich default so the wall greets you full. */
const DEFAULT_QUERY = 'impressionism';

/**
 * How close (px from the stage's leading edge) the pointer must come before the
 * tree panel extends over the artwork. Roughly the expanded width plus a hair,
 * so the panel is already open by the time you reach it.
 */
const PANEL_REVEAL_X = 480;

/**
 * The Wall example: the tree AS a searchable art moodboard. A `matInput` feeds
 * a `query` SIGNAL; a debounced copy is the `request` of a `resource()` whose
 * loader fetches the Art Institute of Chicago (axios GET in a try/catch). A
 * previous-preserving `linkedSignal` maps the response into department →
 * artwork nodes and keeps the CURRENT wall on screen while the next query loads
 * (STYLE.md § State & Signals — the second legitimate `linkedSignal` use).
 *
 * Every row is a tall 120px image card, folders and leaves alike — the
 * docs/VIRTUALIZATION thesis made literal (UNIFORM rows, not SHORT). However
 * many results a query returns, only the ~dozen on screen ever mount an
 * `<img>`; a live HUD counts the demo's own rendered `.wall-card` rows to prove
 * it. Cards select (bulk-pick) and drag between departments to re-file —
 * controlled: the tree emits `moved`, this component applies it to `roots`.
 */
@Component({
  selector: 'app-wall-example',
  imports: [
    // Material
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,

    // Angular Tree
    AngularTree,
    TreeEmptyDef,
    TreeLoadingDef,
    TreeNodeDef,

    // The canvas
    ImageViewer,
  ],
  templateUrl: './wall-example.html',
  styleUrl: './wall-example.scss',
})
export class WallExample {
  readonly #sanitizer = inject(DomSanitizer);
  readonly #host: HTMLElement = inject(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);

  /** The matInput's value — the "form signal". */
  readonly query = signal(DEFAULT_QUERY);

  /** Debounced so a burst of keystrokes is one fetch, not one per character. */
  readonly #debounced = debounced(this.query, 350);

  /**
   * The raw fetch. axios in a try/catch: a superseded query aborts (rethrown so
   * the resource discards it silently); any other failure becomes a friendly
   * message surfaced in the toolbar, while the previous wall stays on screen.
   */
  readonly results = resource({
    params: () => this.#debounced.value().trim(),
    loader: async ({ params: query, abortSignal }) => {
      if (!query) return [] as AicArtwork[];

      try {
        const { data } = await axios.get<{ data: AicArtwork[] }>(
          AIC_SEARCH_URL,
          {
            params: { q: query, fields: AIC_FIELDS, limit: 100 },
            signal: abortSignal,
          },
        );
        return data.data;
      } catch (error) {
        if (axios.isCancel(error)) throw error; // newer query won — drop quietly
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;
        throw new Error(
          status
            ? `Art Institute API answered ${status}`
            : 'Could not reach the Art Institute API',
        );
      }
    },
  });

  /**
   * Previous-preserving map: while a load is in flight (or failed) the resource
   * has no value — keep the PREVIOUS mapped wall instead of flashing empty. The
   * `previous` parameter is exactly why this is a `linkedSignal` (STYLE.md).
   */
  readonly #wall = linkedSignal<readonly AicArtwork[] | undefined, WallData>({
    source: () => (this.results.hasValue() ? this.results.value() : undefined),
    computation: (artworks, previous) =>
      artworks ? mapArtworks(artworks) : (previous?.value ?? EMPTY_WALL),
  });

  /**
   * The working tree: seeded from each search result, then MUTATED by drag
   * re-files (controlled `moved`). Re-seeding on a new search discards edits by
   * design. Its source is `#wall` (not the raw resource), so a drag never
   * disturbs the department expansion the search set up.
   */
  readonly roots = linkedSignal<WallData, readonly WallNode[]>({
    source: () => this.#wall(),
    computation: (wall) => wall.roots,
  });

  /** Departments to open — changes only per SEARCH, so drags don't re-expand. */
  readonly collectionIds = computed(() => this.#wall().collectionIds);

  /** Total artworks currently in the wall (reflects search + re-files). */
  readonly total = computed(() => countAssets(this.roots()));

  /** Consumer-owned selection (bulk-pick). */
  readonly selectedKeys = signal<readonly string[]>([]);
  readonly selectedCount = computed(() => this.selectedKeys().length);

  /**
   * What the viewer shows: the artwork picked LAST. Deriving from the tail of
   * the selection (rather than a separate "active" signal) means one click both
   * picks and displays, and a multi-select drag still leaves the last-touched
   * work on the canvas.
   */
  readonly current = computed<WallAsset | null>(() => {
    const keys = this.selectedKeys();
    const last = keys.at(-1);
    return last ? (findAsset(this.roots(), last) ?? null) : null;
  });

  /**
   * Pointer near the stage's leading edge → the panel extends over the artwork.
   * Proximity, not hover: the panel is open before you arrive, so browsing never
   * costs a deliberate mouse trip.
   */
  readonly near = signal(false);

  /** Live count of rendered rows in OUR DOM — the virtualization proof. */
  readonly rendered = signal(0);

  /** Last re-file, shown in the HUD — the "consumer applied it" proof. */
  readonly lastMove = signal<string | null>(null);

  constructor() {
    const observer = new MutationObserver(() => this.#count());

    afterNextRender(() => {
      const tree = this.#host.querySelector('angular-tree');
      if (tree) observer.observe(tree, { childList: true, subtree: true });
      this.#count();
    });

    this.#destroyRef.onDestroy(() => observer.disconnect());
  }

  #count(): void {
    this.rendered.set(this.#host.querySelectorAll('.wall-card').length);
  }

  // Accessors — the tree never learns the WallNode shape.
  children = (node: WallNode): readonly WallNode[] | undefined =>
    isCollection(node) ? node.children : undefined;
  key = (node: WallNode) => node.id;
  nodeName = (node: WallNode) => node.name;
  matchesNode = (node: WallNode, term: string) =>
    node.name.toLowerCase().includes(term.toLowerCase());
  isCollection = isCollection;
  image = artworkImage;

  /** Only artworks join a selection — a department click just toggles it. */
  selectable = (node: WallNode) => !isCollection(node);

  /** Retry a failed fetch — the previous wall stayed visible throughout. */
  retry(): void {
    this.results.reload();
  }

  /** Distance from the stage's leading edge decides whether the panel extends. */
  onStagePointer(event: PointerEvent): void {
    const stage = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.near.set(event.clientX - stage.left < PANEL_REVEAL_X);
  }

  /** Controlled: re-file the dragged selection into the target department. */
  onMove({ dragIds, parentId, index }: MoveEvent<WallNode>): void {
    this.roots.update((roots) => applyMove(roots, dragIds, parentId, index));
    this.lastMove.set(
      `re-filed ${dragIds.length} → ${parentId ?? 'wall'} @ ${index}`,
    );
  }

  clearSelection(): void {
    this.selectedKeys.set([]);
  }

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the example's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [
    { id: 'preview' as const, label: 'Preview' },
    ...CODE_TABS,
  ];

  view = signal<WallView>('preview');

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({
    html: null,
    ts: null,
    scss: null,
    data: null,
    viewer: null,
  });

  showView(view: WallView): void {
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
