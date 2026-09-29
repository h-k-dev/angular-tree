/**
 * A VS Code-style workspace file tree — pure constants, no fetching. The tree
 * never learns this shape (accessors describe it), so `path` doubles as the
 * expansion key and rename target.
 */

export interface FsDir {
  /** Full workspace path — unique, so it's the expansion/edit key. */
  readonly path: string;
  readonly name: string;
  readonly kind: 'dir';
  readonly children: readonly FsNode[];
}

export interface FsFile {
  readonly path: string;
  readonly name: string;
  readonly kind: 'file';
}

/** Discriminated union so a `kind`-based guard narrows for the typed defs. */
export type FsNode = FsDir | FsFile;

export const isDir = (node: FsNode): node is FsDir => node.kind === 'dir';

/** Trailing extension (lowercased) or '' — drives the per-type file glyph. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Extension → Material Symbols glyph (Seti-icon stand-ins). Missing keys fall
 * back to a plain document in the template.
 */
export const FILE_ICONS: Record<string, string | undefined> = {
  ts: 'code_blocks',
  js: 'javascript',
  html: 'html',
  scss: 'css',
  css: 'css',
  json: 'data_object',
  md: 'article',
  svg: 'image',
  lock: 'lock',
};

/** Every folder path — the panel opens with the main src path expanded. */
export const DEFAULT_OPEN = [
  'angular-tree',
  'angular-tree/src',
  'angular-tree/src/app',
];

/** A folder with a component's three files per stem (`deal-list.component.ts`, …). */
function folder(
  path: string,
  stems: readonly string[],
  subfolders: readonly FsDir[] = [],
): FsDir {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const files = stems.flatMap((stem) =>
    ['.component.ts', '.component.html', '.component.scss'].map(
      (suffix): FsFile => ({
        path: `${path}/${stem}${suffix}`,
        name: `${stem}${suffix}`,
        kind: 'file',
      }),
    ),
  );
  return { path, name, kind: 'dir', children: [...subfolders, ...files] };
}

const CONTENT_ROOT = 'angular-tree/src/app/content';
const CRM = `${CONTENT_ROOT}/partials/crm`;

/**
 * content › partials › crm › deals › pipeline. Under angular-tree › src › app
 * a pipeline file has EIGHT ancestors — one past the default cap of 7, so the
 * band visibly keeps the outermost seven (VS Code's rule).
 */
const CONTENT: FsDir = folder(
  CONTENT_ROOT,
  ['page-shell', 'content-outlet'],
  [
    folder(
      `${CONTENT_ROOT}/partials`,
      ['partial-host', 'partial-registry'],
      [
        folder(
          CRM,
          ['crm-layout', 'crm-toolbar', 'crm-sidebar'],
          [
            folder(
              `${CRM}/deals`,
              ['deal-list', 'deal-detail', 'deal-filters'],
              [
                folder(`${CRM}/deals/pipeline`, [
                  'pipeline-board',
                  'pipeline-column',
                  'pipeline-card',
                  'pipeline-drag-preview',
                  'pipeline-stage-header',
                  'pipeline-empty-state',
                ]),
              ],
            ),
            folder(`${CRM}/contacts`, [
              'contact-list',
              'contact-card',
              'contact-detail',
              'contact-merge-dialog',
            ]),
          ],
        ),
        folder(`${CONTENT_ROOT}/partials/billing`, [
          'invoice-list',
          'invoice-detail',
          'payment-form',
        ]),
      ],
    ),
  ],
);

export const WORKSPACE: readonly FsNode[] = [
  {
    path: 'angular-tree',
    name: 'angular-tree',
    kind: 'dir',
    children: [
      {
        path: 'angular-tree/.vscode',
        name: '.vscode',
        kind: 'dir',
        children: [
          {
            path: 'angular-tree/.vscode/settings.json',
            name: 'settings.json',
            kind: 'file',
          },
          {
            path: 'angular-tree/.vscode/launch.json',
            name: 'launch.json',
            kind: 'file',
          },
        ],
      },
      {
        path: 'angular-tree/src',
        name: 'src',
        kind: 'dir',
        children: [
          {
            path: 'angular-tree/src/app',
            name: 'app',
            kind: 'dir',
            children: [
              // The stickyScroll seed: deep and long, collapsed by default so
              // the rows the other examples read stay on screen. Open it and
              // scroll — its ancestors pin and hand off like VS Code's.
              CONTENT,
              {
                path: 'angular-tree/src/app/app.ts',
                name: 'app.ts',
                kind: 'file',
              },
              {
                path: 'angular-tree/src/app/app.html',
                name: 'app.html',
                kind: 'file',
              },
              {
                path: 'angular-tree/src/app/app.scss',
                name: 'app.scss',
                kind: 'file',
              },
              {
                path: 'angular-tree/src/app/app.routes.ts',
                name: 'app.routes.ts',
                kind: 'file',
              },
              // The middleEllipsis seed: long enough to truncate at any panel
              // width, with an extension for the Finder tail rule to protect.
              {
                path: 'angular-tree/src/app/virtualized-explorer-panel-with-inline-rename-and-drag-reordering.component.spec.ts',
                name: 'virtualized-explorer-panel-with-inline-rename-and-drag-reordering.component.spec.ts',
                kind: 'file',
              },
            ],
          },
          { path: 'angular-tree/src/main.ts', name: 'main.ts', kind: 'file' },
          {
            path: 'angular-tree/src/styles.scss',
            name: 'styles.scss',
            kind: 'file',
          },
          {
            path: 'angular-tree/src/index.html',
            name: 'index.html',
            kind: 'file',
          },
        ],
      },
      {
        path: 'angular-tree/e2e',
        name: 'e2e',
        kind: 'dir',
        children: [
          {
            path: 'angular-tree/e2e/indent-guides.spec.ts',
            name: 'indent-guides.spec.ts',
            kind: 'file',
          },
          {
            path: 'angular-tree/e2e/helpers.ts',
            name: 'helpers.ts',
            kind: 'file',
          },
        ],
      },
      { path: 'angular-tree/angular.json', name: 'angular.json', kind: 'file' },
      { path: 'angular-tree/package.json', name: 'package.json', kind: 'file' },
      {
        path: 'angular-tree/tsconfig.json',
        name: 'tsconfig.json',
        kind: 'file',
      },
      { path: 'angular-tree/bun.lock', name: 'bun.lock', kind: 'file' },
      { path: 'angular-tree/README.md', name: 'README.md', kind: 'file' },
    ],
  },
];
