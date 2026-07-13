import { Component, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { ExampleScale, FolderNode } from '../example-data';
import { TreeExample } from '../tree-example/tree-example';

/** Card views: the live example or one of its source files. */
type ExampleView = 'preview' | 'html' | 'ts' | 'scss';

/**
 * The Documents example page (the front page): example controls + the living
 * example with its PrimeNG-style source tabs. Page concerns live here — the
 * playground layout owns the example list, the app shell only navigation and
 * theme.
 */
@Component({
  selector: 'app-documents-example',
  imports: [DecimalPipe, MatButtonModule, MatIconModule, TreeExample],
  templateUrl: './documents-example.html',
  styleUrl: './documents-example.scss',
})
export class DocumentsExample {
  readonly #dialog = inject(MatDialog);
  readonly #sanitizer = inject(DomSanitizer);

  /**
   * The living example — the controls bar reads through it. Queried by
   * template ref, with the class in TYPE position only: a value reference
   * here would pin TreeExample into the eager chunk and defeat the
   * template's `@defer` split.
   */
  readonly example = viewChild<TreeExample>('example');

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

  /**
   * Upload dialog — page-level plumbing kept OUT of the example component so
   * its code tabs stay tree-only. The dialog itself is its own ts/html/scss
   * split (`upload-dialog/`), the Phase 8 stacking/focus-trap testbed.
   */
  openUpload() {
    import('../upload-dialog/upload-dialog').then(({ UploadDialog }) => {
      this.#dialog
        .open<InstanceType<typeof UploadDialog>, undefined, FolderNode>(
          UploadDialog,
        )
        .afterClosed()
        .subscribe((folder) => {
          if (folder)
            this.example()?.lastIntent.set(`upload → "${folder.name}"`);
        });
    });
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

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({
    html: null,
    ts: null,
    scss: null,
  });

  showView(view: ExampleView) {
    this.view.set(view);
    if (view === 'preview' || this.exampleSource()[view] != null) return;

    // Shiki (angular.dev's highlighter) loads lazily with the first code tab;
    // dual themes ride the demo's dark-mode class (see styles.scss).
    const langs = {
      html: 'angular-html',
      ts: 'angular-ts',
      scss: 'scss',
    } as const;
    Promise.all([
      fetch(`source/tree-example.${view}`).then((response) =>
        response.ok
          ? response.text()
          : `// failed to load (${response.status})`,
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
}
