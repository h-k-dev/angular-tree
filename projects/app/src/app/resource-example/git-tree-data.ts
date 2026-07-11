/**
 * GitHub git-trees API mapping — pure data in, tree-friendly data out
 * (STYLE.md: functions for derivation). The API returns a FLAT array of
 * path-addressed entries; the tree wants nested children.
 */

/** One entry of GitHub's `git/trees/{ref}?recursive=1` response. */
export interface GitTreeEntry {
  readonly path: string;
  /** `tree` = folder, `blob` = file, `commit` = submodule pointer. */
  readonly type: 'tree' | 'blob' | 'commit';
  readonly size?: number;
}

export interface GitFolder {
  readonly kind: 'folder';
  /** Full repo path — unique, so it doubles as the expansion key. */
  readonly path: string;
  readonly name: string;
  readonly children: GitNode[];
}

export interface GitFile {
  readonly kind: 'file';
  readonly path: string;
  readonly name: string;
  readonly size: number;
}

export type GitNode = GitFolder | GitFile;

export const isGitFolder = (node: GitNode): node is GitFolder => node.kind === 'folder';

/**
 * Nests the flat path list. Order-independent: folders index by path as they
 * appear, and an entry whose parent folder is missing lands at the root
 * rather than vanishing. Submodule pointers (`commit`) are skipped — their
 * contents belong to another repository. Folders sort before files,
 * each alphabetically (file-manager convention).
 */
export function buildGitTree(entries: readonly GitTreeEntry[]): readonly GitNode[] {
  const roots: GitNode[] = [];
  const folders = new Map<string, GitFolder>();
  const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

  // Pass 1: every folder exists before anything attaches to it — the API
  // emits parents first, but the mapping must not depend on that.
  for (const entry of entries) {
    if (entry.type !== 'tree') continue;
    folders.set(entry.path, { kind: 'folder', path: entry.path, name: nameOf(entry.path), children: [] });
  }

  const siblingsOf = (path: string): GitNode[] => {
    const slash = path.lastIndexOf('/');
    if (slash < 0) return roots;
    return folders.get(path.slice(0, slash))?.children ?? roots;
  };

  // Pass 2: attach folders and files to their parents.
  for (const entry of entries) {
    if (entry.type === 'tree') {
      siblingsOf(entry.path).push(folders.get(entry.path)!);
    } else if (entry.type === 'blob') {
      siblingsOf(entry.path).push({ kind: 'file', path: entry.path, name: nameOf(entry.path), size: entry.size ?? 0 });
    }
  }

  const sortLevel = (nodes: GitNode[]) => {
    nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1,
    );
    for (const node of nodes) if (node.kind === 'folder') sortLevel(node.children);
  };
  sortLevel(roots);
  return roots;
}
