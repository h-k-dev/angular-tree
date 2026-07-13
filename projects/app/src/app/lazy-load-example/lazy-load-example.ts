import { Component, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { defer, Observable } from 'rxjs';

import {
  AngularTree,
  MoveEvent,
  TreeDropContext,
  TreeNodeDef,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

import {
  applyMove,
  attachChildren,
  fetchChildren,
  GITHUB_REFS,
  isBranch,
  LazyNode,
  rootNodes,
} from './lazy-sources';

/** Card views: the live panel or one of the example's real source files. */
type LazyView = 'preview' | 'html' | 'ts' | 'scss' | 'data';

const CODE_TABS = [
  {
    id: 'html',
    label: 'HTML',
    file: 'lazy-load-example.html',
    lang: 'angular-html',
  },
  { id: 'ts', label: 'TS', file: 'lazy-load-example.ts', lang: 'angular-ts' },
  { id: 'scss', label: 'SCSS', file: 'lazy-load-example.scss', lang: 'scss' },
  { id: 'data', label: 'Data', file: 'lazy-sources.ts', lang: 'angular-ts' },
] as const;

/**
 * The "Lazy Load Only" example: five self-contained roots, each backed by a
 * DIFFERENT public API (a GitHub repo, a GBIF taxonomy, a Hacker News thread, a
 * Wikipedia category, an npm package's files), all unified behind ONE tree via
 * the accessor contract. Children fetch ONE LEVEL AT A TIME, on open. Drag &
 * drop is sandboxed per `source` (`disableDrop`) — you can't drag across data
 * sources. The tree is CONTROLLED, so this component OWNS a progressively-loaded
 * `roots` signal; fetched children are written back (identity-preserving), which
 * is what lets the `moved` intent apply through `applyMove`.
 */
@Component({
  selector: 'app-lazy-load-example',
  imports: [
    MatButtonModule,
    MatIconModule,
    AngularTree,
    TreeNodeDef,
    TreeNodeToggle,
  ],
  templateUrl: './lazy-load-example.html',
  styleUrl: './lazy-load-example.scss',
})
export class LazyLoadExample {
  readonly #sanitizer = inject(DomSanitizer);

  readonly tree = viewChild.required<AngularTree<LazyNode>>(AngularTree);

  /** The owned, progressively-loaded tree (fetches + moves write here). */
  readonly roots = signal<readonly LazyNode[]>(rootNodes());

  /**
   * Consumer-side fetch parameter (`[childrenDeps]`, Phase 15 #3): the GitHub
   * accessor closes over it, so every cached child list under that root is
   * stale the moment it changes. The binding hands the tree half of the
   * refresh over declaratively — drop caches, abort in flight, refetch
   * expanded dirs — no `viewChild` + `invalidateChildren()` plumbing.
   */
  readonly githubRef = signal<(typeof GITHUB_REFS)[number]>('main');
  readonly githubRefs = GITHUB_REFS;

  /** Per-root Material icon — the five sources at a glance (string-keyed so the
   *  untyped template context can index it without a strict-index error). */
  readonly sourceIcon: Record<string, string> = {
    github: 'code',
    gbif: 'pets',
    hackernews: 'forum',
    wikipedia: 'menu_book',
    jsdelivr: 'deployed_code',
  };

  /** In-flight fetches keyed by node id — one request per branch, retry-safe. */
  readonly #inflight = new Map<string, Promise<readonly LazyNode[]>>();

  /// Accessors — the tree never learns the LazyNode shape.
  key = (node: LazyNode) => node.id;
  nodeName = (node: LazyNode) => node.name;

  /**
   * Lazy children: loaded branches return synchronously; an unfetched branch
   * returns a COLD Observable (the tree shows `isLoading` while it resolves).
   * Leaves are `undefined`.
   *
   * Cold (`defer`), NOT a Promise: the tree also *probes* this accessor during
   * flattening — for every loaded node, expanded or not — just to learn
   * expandability. A Promise would start its fetch at probe time, and with the
   * write-back below each response would surface new probed branches: the five
   * trees would recursively crawl themselves on page load (~10k requests, no
   * interaction). `defer` executes only when the tree SUBSCRIBES, which it
   * does exclusively on expand intent.
   */
  children = (
    node: LazyNode,
  ): readonly LazyNode[] | undefined | Observable<readonly LazyNode[]> => {
    if (!isBranch(node)) return undefined;
    if (node.children !== undefined) return node.children;
    return defer(() => this.#load(node));
  };

  #load(node: LazyNode): Promise<readonly LazyNode[]> {
    const existing = this.#inflight.get(node.id);
    if (existing) return existing;

    const task: Promise<readonly LazyNode[]> = fetchChildren(node, {
      githubRef: this.githubRef(),
    })
      .then((children) => {
        // Identity-preserving write-back: only this node + its ancestors get new
        // objects, so sibling branches keep their memoized accessor result.
        // Guarded: a ref switch deregisters GitHub tasks below, so a late
        // resolve of the OLD ref can't graft stale children over the reset.
        if (this.#inflight.get(node.id) === task)
          this.roots.update((roots) =>
            attachChildren(roots, node.id, children),
          );
        return children;
      })
      .finally(() => {
        // Clear so Retry re-fetches — but never a successor's registration.
        if (this.#inflight.get(node.id) === task)
          this.#inflight.delete(node.id);
      });

    this.#inflight.set(node.id, task);
    return task;
  }

  /**
   * The consumer half of the `[childrenDeps]` refresh: the tree drops ITS
   * caches on the binding change, but the written-back graft lives in OUR
   * `roots` — reset the GitHub subtree so the re-asked accessor fetches
   * instead of returning the stale graft, and deregister in-flight GitHub
   * tasks so their write-backs are dead on arrival.
   */
  switchGithubRef(ref: (typeof GITHUB_REFS)[number]) {
    if (ref === this.githubRef()) return;
    this.githubRef.set(ref);
    for (const key of [...this.#inflight.keys()])
      if (key.startsWith('github')) this.#inflight.delete(key);
    this.roots.update((roots) =>
      roots.map((root) =>
        root.source === 'github'
          ? { ...root, children: undefined, meta: `GitHub repo @ ${ref}` }
          : root,
      ),
    );
    // Key-addressed (Phase 15 #5): the component holds the KEY constant —
    // tree.byKey skips the key→node lookup consumers used to hand-roll.
    this.tree().byKey.scrollTo('github');
  }

  /**
   * Self-contained rule: a drop is forbidden at the root (outside every source),
   * across sources, or *inside* a branch that hasn't loaded yet (open it first).
   * Everything else — reorder or reparent within one source's loaded subtree — is
   * allowed.
   */
  dropForbidden = (ctx: TreeDropContext<LazyNode>): boolean => {
    const parent = ctx.parentNode;
    if (parent == null) return true;
    if (isBranch(parent) && parent.children === undefined) return true;
    return ctx.dragNodes.some((node) => node.source !== parent.source);
  };

  /** Controlled move: apply it to the owned tree (parentId is never null here). */
  onMove({ dragIds, parentId, index }: MoveEvent<LazyNode>) {
    if (parentId == null) return; // guarded by dropForbidden, but keep the type honest
    this.roots.update((roots) => applyMove(roots, dragIds, parentId, index));
  }

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the example's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [
    { id: 'preview' as const, label: 'Preview' },
    ...CODE_TABS,
  ];

  view = signal<LazyView>('preview');

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({
    html: null,
    ts: null,
    scss: null,
    data: null,
  });

  showView(view: LazyView) {
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
