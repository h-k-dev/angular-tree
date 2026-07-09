import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';

import { ExampleScale, FolderNode } from './example-data';
import { TreeExample } from './tree-example/tree-example';

/** Card-1 views: the live example or one of its source files. */
type ExampleView = 'preview' | 'html' | 'ts' | 'scss';

@Component({
  selector: '[app-root]',
  imports: [DecimalPipe, MatToolbarModule, MatButtonModule, MatIconModule, TreeExample],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '[class.dark-mode]': "theme() === 'dark'",
  },
})
export class App {
  readonly #document = inject(DOCUMENT);
  readonly #dialog = inject(MatDialog);

  /** The living example — toolbar surface (active node, intents) reads through it. */
  readonly example = viewChild(TreeExample);

  /**
   * Upload dialog — app-level plumbing kept OUT of the example component so
   * its code tabs stay tree-only. The dialog itself is its own ts/html/scss
   * split (`upload-dialog/`), the Phase 8 stacking/focus-trap testbed.
   */
  openUpload() {
    import('./upload-dialog/upload-dialog').then(({ UploadDialog }) => {
      this.#dialog
        .open<InstanceType<typeof UploadDialog>, undefined, FolderNode>(UploadDialog)
        .afterClosed()
        .subscribe((folder) => {
          if (folder) this.example()?.lastIntent.set(`upload → "${folder.name}"`);
        });
    });
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  theme = signal<'light' | 'dark'>('light');
  themeClass = computed(() => `${this.theme()}-mode`);

  toggleTheme() {
    if (this.#document.startViewTransition) {
      this.#document.startViewTransition(() => {
        this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
      });

      return;
    }

    this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
  }

  // ---------------------------------------------------------------------------
  // Toolbar state driving the example
  // ---------------------------------------------------------------------------
  /** `xl` ≈ 110k nodes — virtualization smoke run (ROADMAP Phase 2). */
  scale = signal<ExampleScale>('standard');

  toggleScale() {
    this.scale.update((scale) => (scale === 'standard' ? 'xl' : 'standard'));
  }

  search = signal('');

  onSearch(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }

  /** Root-level load flag → the example's projected `treeLoadingDef`. */
  rootLoading = signal(false);

  /** Demo: flash the loading overlay for a moment (real apps set this around a fetch). */
  simulateLoad() {
    this.rootLoading.set(true);
    setTimeout(() => this.rootLoading.set(false), 1_500);
  }

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the component's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [
    { id: 'preview' as const, label: 'Preview' },
    { id: 'html' as const, label: 'HTML' },
    { id: 'ts' as const, label: 'TS' },
    { id: 'scss' as const, label: 'SCSS' },
  ];

  view = signal<ExampleView>('preview');

  readonly #sanitizer = inject(DomSanitizer);

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({ html: null, ts: null, scss: null });

  showView(view: ExampleView) {
    this.view.set(view);
    if (view === 'preview' || this.exampleSource()[view] != null) return;

    // Shiki (angular.dev's highlighter) loads lazily with the first code tab;
    // dual themes ride the demo's dark-mode class (see styles.scss).
    const langs = { html: 'angular-html', ts: 'angular-ts', scss: 'scss' } as const;
    Promise.all([
      fetch(`source/tree-example.${view}`).then((response) =>
        response.ok ? response.text() : `// failed to load (${response.status})`,
      ),
      import('shiki'),
    ])
      .then(([code, { codeToHtml }]) =>
        codeToHtml(code, {
          lang: langs[view],
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

  /** Mirrors docs/THEMING.md § Tokens — the theming card renders it verbatim. */
  readonly themingTokens = [
    { name: '--tree-row-height', system: null, fallback: '32px (this demo: 40px)', alters: 'Read-only — the [itemSize] input republished on the host; root of the sizing chain' },
    { name: '--tree-bg', system: '--mat-sys-surface', fallback: '#ffffff', alters: 'Tree background, drag preview' },
    { name: '--tree-text', system: '--mat-sys-on-surface', fallback: '#1d1b20', alters: 'Row text' },
    { name: '--tree-font', system: '--mat-sys-body-medium', fallback: '400 0.875rem/1.25rem Roboto, sans-serif', alters: 'Typography (full font shorthand)' },
    { name: '--tree-node-hover', system: '--mat-sys-surface-container-highest', fallback: '#e6e6e6', alters: 'Row hover' },
    { name: '--tree-node-selected', system: '--mat-sys-secondary-container', fallback: '#e8def8', alters: 'Selected row ([data-selected])' },
    { name: '--tree-focus-ring', system: '--mat-sys-primary', fallback: '#6750a4', alters: ':focus-visible outline' },
    { name: '--tree-drop-indicator', system: '--mat-sys-primary', fallback: '#6750a4', alters: 'Drop line/box, count badge' },
    { name: '--tree-drag-shadow', system: '--mat-sys-level3', fallback: '0 2px 8px rgb(0 0 0 / 0.3)', alters: 'Drag preview elevation' },
    { name: '--tree-badge-text', system: '--mat-sys-on-primary', fallback: '#ffffff', alters: 'Multi-drag count badge text' },
    { name: '--tree-indent', system: null, fallback: '1.5rem', alters: 'Per-level indentation step; guide lines center at half of it' },
    { name: '--tree-guide', system: '--mat-sys-outline-variant', fallback: '#cac4d0', alters: 'Indent guide lines ([indentGuides]); hover uses --tree-focus-ring' },
    { name: '--tree-menu-bg', system: '--mat-sys-surface-container', fallback: '#f3edf7', alters: 'Context-menu shell background (treeContextMenu)' },
    { name: '--tree-menu-radius', system: null, fallback: '8px', alters: 'Context-menu shell corner radius' },
    { name: '--tree-menu-shadow', system: '--mat-sys-level2', fallback: '0 2px 8px rgb(0 0 0 / 0.25)', alters: 'Context-menu shell elevation' },
    { name: '--tree-toggle-size', system: null, fallback: 'var(--tree-row-height)', alters: 'Master control size: toggle + checkbox targets, thread-line column (via --tree-indent), leaf spacer base — must never exceed --tree-row-height' },
    { name: '--tree-toggle-spacing-factor', system: null, fallback: '0.5', alters: 'Leaf spacer = --tree-toggle-size × this factor' },
    { name: '--tree-checkbox-radius', system: null, fallback: '100vw (circle)', alters: 'Checkbox state-layer radius (consumer-template convention)' },
  ];
}
