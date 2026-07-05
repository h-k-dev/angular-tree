import { applyMove, DocNode } from './example-data';

const tree = (): DocNode[] => [
  {
    kind: 'folder',
    id: 'a',
    name: 'A',
    children: [
      { kind: 'file', id: 'a1', name: 'a1.pdf', ext: 'pdf', size: 1 },
      { kind: 'file', id: 'a2', name: 'a2.pdf', ext: 'pdf', size: 2 },
    ],
  },
  { kind: 'file', id: 'b', name: 'b.pdf', ext: 'pdf', size: 3 },
];

const ids = (nodes: DocNode[]): string[] => nodes.map((node) => node.id);

describe('applyMove', () => {
  it('moves a root into a folder', () => {
    const result = applyMove(tree(), ['b'], 'a', 2);
    expect(ids(result)).toEqual(['a']);
    expect(ids((result[0] as { children: DocNode[] }).children)).toEqual(['a1', 'a2', 'b']);
  });

  it('adjusts the index when a dragged sibling sits before the target slot', () => {
    // a1 dragged after a2: raw index 2 counts a1 itself → adjusted to 1.
    const result = applyMove(tree(), ['a1'], 'a', 2);
    expect(ids((result[0] as { children: DocNode[] }).children)).toEqual(['a2', 'a1']);
  });

  it('moves multiple nodes preserving document order', () => {
    // Dragged set listed out of order — insertion keeps document order a1, a2.
    const result = applyMove(tree(), ['a2', 'a1'], null, 1);
    expect(ids(result)).toEqual(['a', 'a1', 'a2', 'b']);
  });
});
