import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';

import { AngularTree, RenameEvent, TreeNodeDef, TreeNodeEditInput } from '@h-k-dev/angular-tree';

import { DEFAULT_OPEN, extensionOf, FILE_ICONS, FsNode, isDir, WORKSPACE } from './fs-data';

/** Card views: the live panel or one of the example's real source files. */
type VscodeView = 'preview' | 'html' | 'ts' | 'scss' | 'data';

/**
 * Source tabs (PrimeNG-style) — each maps to a REAL file copied to `source/`
 * by the build (angular.json assets) and highlighted with Shiki, zero drift.
 */
const CODE_TABS = [
  { id: 'html', label: 'HTML', file: 'vscode-example.html', lang: 'angular-html' },
  { id: 'ts', label: 'TS', file: 'vscode-example.ts', lang: 'angular-ts' },
  { id: 'scss', label: 'SCSS', file: 'vscode-example.scss', lang: 'scss' },
  { id: 'data', label: 'Data', file: 'fs-data.ts', lang: 'angular-ts' },
] as const;

/**
 * The VS Code example: the Explorer file tree in a macOS window, wired to that
 * editor's gestures with the tree's own inputs — `clickAction: 'select'` (a
 * click highlights the row, no checkboxes), `enterAction: 'edit'` (Enter renames
 * inline), and a folder click that ALSO toggles the folder. The tree is
 * CONTROLLED: rename emits an intent, this component applies it to its own data.
 * Only the macOS window chrome (traffic lights) uses literal colours — the tree
 * itself is themed from our `--mat-sys-*` palette, so it follows light/dark.
 */
@Component({
  selector: 'app-vscode-example',
  imports: [MatIconModule, AngularTree, TreeNodeDef, TreeNodeEditInput],
  templateUrl: './vscode-example.html',
  styleUrl: './vscode-example.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class VscodeExample {
  readonly #sanitizer = inject(DomSanitizer);

  /** Writable so applied renames re-render the tree (controlled pattern). */
  readonly workspace = linkedSignal<readonly FsNode[]>(() => WORKSPACE);
  readonly defaultOpen = DEFAULT_OPEN;

  /** The row the user last opened (double-click activate) — shown in the status bar. */
  readonly openPath = signal<string | null>(null);

  /// Accessors — the tree never learns the FsNode shape.
  children = (node: FsNode) => (isDir(node) ? node.children : undefined);
  key = (node: FsNode) => node.path;
  nodeName = (node: FsNode) => node.name;
  isDir = isDir;

  /** Template reads the record directly — a lookup, not a call (STYLE.md). */
  readonly icons = FILE_ICONS;
  extensionOf = extensionOf;

  /** Controlled rename: apply the committed name to our own tree, then re-render. */
  onRename({ id, name }: RenameEvent<FsNode>) {
    const rename = (nodes: readonly FsNode[]): FsNode[] =>
      nodes.map((node) => {
        if (node.path === id) return { ...node, name };
        return isDir(node) ? { ...node, children: rename(node.children) } : node;
      });
    this.workspace.update(rename);
  }

  /** Double-click a file = "open" it (VS Code makes the preview tab permanent). */
  openFile(node: FsNode) {
    if (!isDir(node)) this.openPath.set(node.path);
  }

  // ---------------------------------------------------------------------------
  // Example view tabs (PrimeNG-style): preview ↔ the example's real sources
  // ---------------------------------------------------------------------------
  readonly viewTabs = [{ id: 'preview' as const, label: 'Preview' }, ...CODE_TABS];

  view = signal<VscodeView>('preview');

  /** Source files, fetched + Shiki-highlighted once on first view (`source/` assets). */
  exampleSource = signal<Record<string, SafeHtml | null>>({ html: null, ts: null, scss: null, data: null });

  showView(view: VscodeView) {
    this.view.set(view);
    if (view === 'preview' || this.exampleSource()[view] != null) return;

    // Shiki (angular.dev's highlighter) loads lazily with the first code tab;
    // dual themes ride the demo's dark-mode class (see styles.scss).
    const tab = CODE_TABS.find((candidate) => candidate.id === view)!;
    Promise.all([
      fetch(`source/${tab.file}`).then((response) =>
        response.ok ? response.text() : `// failed to load (${response.status})`,
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
