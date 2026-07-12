import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';

import {
  AngularTree,
  SelectEvent,
  TreeNodeDef,
  TreeNodeToggle,
} from '@h-k-dev/angular-tree';

import {
  containerIds,
  DESIGN_ICONS,
  DesignNode,
  FIGMA_LAYERS,
  FRAMER_LAYERS,
} from './design-data';

/** Card views: the live panels or one of the example's real source files. */
type StaticView = 'preview' | 'scss' | 'data';

/**
 * Source tabs (PrimeNG-style). This example is about THEMING and DATA, so it
 * shows only those two files — the SCSS that retunes the tree via `--tree-*`
 * tokens and the constant `design-data.ts`. Each is copied to `source/` by the
 * build (angular.json assets) and highlighted with Shiki — zero drift.
 */
const CODE_TABS = [
  { id: 'scss', label: 'SCSS', file: 'static-example.scss', lang: 'scss' },
  { id: 'data', label: 'Data', file: 'design-data.ts', lang: 'angular-ts' },
] as const;

/**
 * The Static example: two design-tool layer panels (Figma-style and
 * Framer-style) over constant data — no fetching, no mutation, no context
 * menu. What it showcases: `clickAction: 'select'` (layer panels select on
 * click, activate on double-click), compact rows, indent guides, and the
 * `--tree-*` token theming that borrows the tools' SHAPE while owning its
 * COLORS from the app's Material palette (see the panel classes in the SCSS).
 */
@Component({
  selector: 'app-static-example',
  imports: [MatIconModule, AngularTree, TreeNodeDef, TreeNodeToggle],
  templateUrl: './static-example.html',
  styleUrl: './static-example.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class StaticExample {
  readonly #sanitizer = inject(DomSanitizer);

  readonly figma = FIGMA_LAYERS;
  readonly framer = FRAMER_LAYERS;

  /**
   * Layer panels open fully expanded — tool convention. `[(expandedKeys)]`
   * (v2 Phase 15) makes the set a two-way signal: the bar's log renders it
   * live, so collapsing a group visibly drops its key from the output value.
   */
  readonly figmaExpanded = signal<readonly string[]>(
    containerIds(FIGMA_LAYERS),
  );
  readonly framerExpanded = signal<readonly string[]>(
    containerIds(FRAMER_LAYERS),
  );

  /** Widened for the untyped fallback def (`node.kind` is `any` there). */
  readonly icons: Record<string, string> = DESIGN_ICONS;

  children = (node: DesignNode) => node.children;
  key = (node: DesignNode) => node.id;
  nodeName = (node: DesignNode) => node.name;

  /**
   * The last raw `(selectionChange)` — the inspector strip renders it as-is
   * (Phase 15 #4): `trigger` names the clicked layer even when the set didn't
   * change, so re-clicking the selected layer still advances the counter —
   * the "preview pane refocus" case a set-shaped event can't express.
   */
  readonly lastSelect = signal<{
    panel: 'figma' | 'framer';
    event: SelectEvent<DesignNode>;
    count: number;
  } | null>(null);

  onSelect(panel: 'figma' | 'framer', event: SelectEvent<DesignNode>) {
    this.lastSelect.update((last) => ({
      panel,
      event,
      count: (last?.count ?? 0) + 1,
    }));
  }

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the example's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [
    { id: 'preview' as const, label: 'Preview' },
    ...CODE_TABS,
  ];

  view = signal<StaticView>('preview');

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({
    scss: null,
    data: null,
  });

  showView(view: StaticView) {
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
