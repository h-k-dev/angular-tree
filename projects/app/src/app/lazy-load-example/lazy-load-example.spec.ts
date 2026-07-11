import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';

import { LazyLoadExample } from './lazy-load-example';
import { applyMove, attachChildren, LazyNode, Source } from './lazy-sources';

const branch = (id: string, source: Source, children?: readonly LazyNode[]): LazyNode => ({
  id,
  name: id,
  source,
  leaf: false,
  ref: id,
  children,
});
const leaf = (id: string, source: Source): LazyNode => ({ id, name: id, source, leaf: true, ref: id });

const find = (nodes: readonly LazyNode[], id: string): LazyNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children && find(node.children, id);
    if (hit) return hit;
  }
  return undefined;
};

describe('lazy-sources', () => {
  it('attachChildren writes the target and preserves untouched node identities', () => {
    const sibling = branch('b', 'gbif', [leaf('b/1', 'gbif')]);
    const roots = [branch('a', 'gbif') /* unloaded */, sibling];
    const kids = [leaf('a/1', 'gbif')];

    const next = attachChildren(roots, 'a', kids);

    expect(next[0].children).toBe(kids); // target loaded
    expect(next[1]).toBe(sibling); // sibling ref untouched → no re-fetch on write
    expect(next).not.toBe(roots);
  });

  it('applyMove reparents a node within its source', () => {
    const roots = [
      branch('gh', 'github', [branch('gh/f1', 'github', [leaf('gh/x', 'github')]), branch('gh/f2', 'github', [])]),
    ];

    const moved = applyMove(roots, ['gh/x'], 'gh/f2', 0);

    expect(find(moved, 'gh/f1')!.children).toEqual([]); // left its source folder
    expect(find(moved, 'gh/f2')!.children!.map((node) => node.id)).toEqual(['gh/x']); // landed in target
  });
});

describe('LazyLoadExample', () => {
  let component: LazyLoadExample;
  let fixture: ComponentFixture<LazyLoadExample>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LazyLoadExample] }).compileComponents();
    fixture = TestBed.createComponent(LazyLoadExample);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('starts with five sources, one per public API, nothing fetched yet', () => {
    const sources = component.roots().map((root) => root.source);
    expect(sources).toEqual(['github', 'gbif', 'hackernews', 'wikipedia', 'jsdelivr']);
    expect(component.roots().every((root) => root.children === undefined)).toBe(true);
  });

  it('probing the accessor NEVER fetches — the observable is cold (regression: page-load request storm)', () => {
    // The tree invokes the accessor for every loaded node during flattening
    // (expandability probe). A Promise-returning accessor fetches at probe
    // time and the write-back cascades the crawl across the whole backend.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    for (const root of component.roots()) {
      const probed = component.children(root);
      expect(probed).toBeInstanceOf(Observable); // cold — not a started Promise
    }
    // Rendering the component (beforeEach) + probing all five roots: 0 requests.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('confines drops to the same source, never the root or an unloaded branch', () => {
    const loadedGh = branch('github:src', 'github', []);
    const unloadedGh = branch('github:vm', 'github');
    const dragGithub = [leaf('github:a.ts', 'github')];
    const dragGbif = [leaf('gbif:9', 'gbif')];

    // root (no parent) — forbidden (a node must stay inside its source)
    expect(component.dropForbidden({ dragNodes: dragGithub, parentNode: null, index: 0 })).toBe(true);
    // cross-source — forbidden (can't drag a taxon into a repo)
    expect(component.dropForbidden({ dragNodes: dragGbif, parentNode: loadedGh, index: 0 })).toBe(true);
    // into an unfetched branch — forbidden (open it first)
    expect(component.dropForbidden({ dragNodes: dragGithub, parentNode: unloadedGh, index: 0 })).toBe(true);
    // same source, loaded target — allowed
    expect(component.dropForbidden({ dragNodes: dragGithub, parentNode: loadedGh, index: 0 })).toBe(false);
  });
});
