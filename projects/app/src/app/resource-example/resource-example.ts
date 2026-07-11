import {
  Component,
  inject,

  // Singal
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// Material
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Angular Tree
import {
  AngularTree,
  TreeEmptyDef,
  TreeNodeDef,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

import { FileSize } from '../file-size';
import {
  buildGitTree,
  GitNode,
  GitTreeEntry,
  isGitFolder,
} from './git-tree-data';

/** Public, CORS-enabled, no auth — switching repos re-runs the loader. */
const REPOS = [
  'brimdata/react-arborist',
  'chenglou/pretext',
  'angular/components',
] as const;
type Repo = (typeof REPOS)[number];

/** Card views: the live example or one of its real source files. */
type ResourceView = 'preview' | 'html' | 'ts' | 'scss' | 'data';

/**
 * Source tabs (PrimeNG-style). Each maps to a REAL file copied to `source/`
 * by the build (angular.json assets) and highlighted with Shiki — zero drift.
 * `Data` is this example's distinctive companion: the pure git-trees→nodes
 * mapping the tree consumes (`git-tree-data.ts`).
 */
const CODE_TABS = [
  {
    id: 'html',
    label: 'HTML',
    file: 'resource-example.html',
    lang: 'angular-html',
  },
  { id: 'ts', label: 'TS', file: 'resource-example.ts', lang: 'angular-ts' },
  { id: 'scss', label: 'SCSS', file: 'resource-example.scss', lang: 'scss' },
  { id: 'data', label: 'Data', file: 'git-tree-data.ts', lang: 'angular-ts' },
] as const;

/**
 * The Resource example: pure data in, tree out — no context menu, no lazy
 * loading, no selection. `resource()` fetches a repository's full file tree
 * from GitHub's git-trees API; a previous-preserving `linkedSignal` maps it
 * into nested nodes and keeps the LAST tree on screen while a repo switch is
 * in flight (no flash of empty viewport). The failure path (rate limit,
 * offline) keeps the previous tree too, with the error in the toolbar.
 */
@Component({
  selector: 'app-resource-example',
  imports: [
    // Material
    MatButtonModule,
    MatIconModule,
    // Angular Tree
    AngularTree,
    // Directives
    TreeEmptyDef,
    TreeNodeDef,
    TreeNodeToggle,

    // Pipes
    FileSize,
    MatProgressSpinnerModule,
  ],
  templateUrl: './resource-example.html',
  styleUrl: './resource-example.scss',
})
export class ResourceExample {
  readonly #sanitizer = inject(DomSanitizer);

  readonly repos = REPOS;
  readonly repo = signal<Repo>(REPOS[0]);

  /**
   * Raw fetch. 60 requests/hour unauthenticated — plenty for a demo, and the
   * 403 it eventually returns exercises the error path honestly.
   */
  readonly rawData = resource({
    params: () => this.repo(),
    loader: async ({ params: repo, abortSignal }) => {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,
        {
          signal: abortSignal,
        },
      );
      if (!response.ok)
        throw new Error(`GitHub answered ${response.status} for ${repo}`);
      const body = (await response.json()) as { tree: GitTreeEntry[] };
      return body.tree;
    },
  });

  /**
   * Previous-preserving map: while a load is in flight (or failed) the
   * resource has no value — return the PREVIOUS mapped tree instead of an
   * empty one. The `previous` parameter is exactly why this is a
   * `linkedSignal` and not a `computed` (STYLE.md § State & Signals).
   */
  readonly nodes = linkedSignal<
    readonly GitTreeEntry[] | undefined,
    readonly GitNode[]
  >({
    source: () => (this.rawData.hasValue() ? this.rawData.value() : undefined),
    computation: (entries, previous) =>
      entries ? buildGitTree(entries) : (previous?.value ?? []),
  });

  /// Accessors: the tree never learns the GitNode shape (ROADMAP locked).
  children = (node: GitNode) => (isGitFolder(node) ? node.children : undefined);
  path = (node: GitNode) => node.path;
  nodeName = (node: GitNode) => node.name;
  isFolder = isGitFolder;

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the example's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [
    { id: 'preview' as const, label: 'Preview' },
    ...CODE_TABS,
  ];

  view = signal<ResourceView>('preview');

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({
    html: null,
    ts: null,
    scss: null,
    data: null,
  });

  showView(view: ResourceView) {
    this.view.set(view);
    if (view === 'preview' || this.exampleSource()[view] != null) return;

    // Shiki (angular.dev's highlighter) loads lazily with the first code tab;
    // dual themes ride the demo's dark-mode class (see styles.scss).
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
