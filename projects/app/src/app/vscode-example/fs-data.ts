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
