import { buildGitTree, GitTreeEntry, isGitFolder } from './git-tree-data';

const entries: GitTreeEntry[] = [
  { path: 'src', type: 'tree' },
  { path: 'src/lib', type: 'tree' },
  { path: 'src/lib/b.ts', type: 'blob', size: 20 },
  { path: 'src/lib/a.ts', type: 'blob', size: 10 },
  { path: 'README.md', type: 'blob', size: 5 },
  { path: 'vendored', type: 'commit' }, // submodule — skipped
];

describe('buildGitTree', () => {
  it('nests flat paths and sorts folders before files, each alphabetically', () => {
    const roots = buildGitTree(entries);
    expect(roots.map((node) => node.name)).toEqual(['src', 'README.md']);

    const src = roots[0];
    if (!isGitFolder(src)) throw new Error('src must be a folder');
    const lib = src.children[0];
    if (!isGitFolder(lib)) throw new Error('lib must be a folder');
    expect(lib.children.map((node) => node.name)).toEqual(['a.ts', 'b.ts']);
  });

  it('keys nodes by their full path and keeps blob sizes', () => {
    const roots = buildGitTree(entries);
    const src = roots[0];
    if (!isGitFolder(src)) throw new Error('src must be a folder');
    const lib = src.children[0];
    if (!isGitFolder(lib)) throw new Error('lib must be a folder');
    expect(lib.path).toBe('src/lib');
    expect(lib.children[0]).toEqual({ kind: 'file', path: 'src/lib/a.ts', name: 'a.ts', size: 10 });
  });

  it('skips submodule pointers and survives out-of-order input', () => {
    const shuffled = [...entries].reverse();
    const roots = buildGitTree(shuffled);
    expect(roots.map((node) => node.name)).toEqual(['src', 'README.md']);
    expect(roots.some((node) => node.name === 'vendored')).toBe(false);
  });
});
