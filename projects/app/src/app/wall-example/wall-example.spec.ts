import { ComponentFixture, TestBed } from '@angular/core/testing';
import axios from 'axios';

import { WallExample } from './wall-example';
import {
  AicArtwork,
  applyMove,
  countAssets,
  isCollection,
  mapArtworks,
  WallAsset,
  WallCollection,
  WallNode,
} from './wall-data';

// jsdom has no Element.scrollTo; the CDK viewport calls it on scrollToIndex.
if (typeof Element.prototype.scrollTo !== 'function') {
  Object.defineProperty(Element.prototype, 'scrollTo', {
    value: function scrollTo(): void {
      /* jsdom no-op */
    },
    writable: true,
    configurable: true,
  });
}

/** A minimal AIC artwork fixture. */
function artwork(over: Partial<AicArtwork> & { id: number }): AicArtwork {
  return {
    title: `Work ${over.id}`,
    image_id: `img-${over.id}`,
    artist_title: 'Artist',
    date_display: '1900',
    dimensions: '10 × 10 cm',
    department_title: 'Painting',
    ...over,
  };
}

function collection(node: WallNode | undefined): WallCollection {
  if (!node || !isCollection(node)) throw new Error('expected a collection');
  return node;
}

describe('wall-data', () => {
  it('maps artworks into department collections and drops imageless works', () => {
    const { roots, collectionIds, assetCount } = mapArtworks([
      artwork({ id: 1, department_title: 'Painting' }),
      artwork({ id: 2, department_title: 'Painting' }),
      artwork({ id: 3, department_title: 'Photography' }),
      artwork({ id: 4, image_id: null }), // no image → dropped
    ]);

    expect(assetCount).toBe(3);
    expect(collectionIds).toEqual(['dept:Painting', 'dept:Photography']);
    const painting = collection(roots[0]);
    expect(painting.count).toBe(2);
    expect(painting.cover).toEqual(['img-1', 'img-2']);
    expect(collection(roots[1]).count).toBe(1);
  });

  it('countAssets walks the tree counting only leaves', () => {
    const { roots } = mapArtworks([artwork({ id: 1 }), artwork({ id: 2 })]);
    expect(countAssets(roots)).toBe(2);
  });

  it('applyMove re-files an artwork and preserves untouched-branch identity', () => {
    const { roots } = mapArtworks([
      artwork({ id: 1, department_title: 'Painting' }),
      artwork({ id: 2, department_title: 'Photography' }),
      artwork({ id: 3, department_title: 'Textiles' }),
    ]);
    const asset = collection(roots[0]).children[0] as WallAsset;

    const next = applyMove(roots, [asset.id], 'dept:Photography', 0);

    const target = collection(
      next.find((n) => isCollection(n) && n.id === 'dept:Photography'),
    );
    expect(target.children[0].id).toBe(asset.id);
    // A fully untouched department keeps its exact object identity.
    expect(next.find((n) => isCollection(n) && n.id === 'dept:Textiles')).toBe(
      roots[2],
    );
  });
});

describe('WallExample', () => {
  let component: WallExample;
  let fixture: ComponentFixture<WallExample>;

  beforeEach(async () => {
    // No live network in specs: the resource loader fires on init with the
    // default query, so axios.get is stubbed to a small deterministic response.
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: [
          artwork({ id: 1, department_title: 'Painting' }),
          artwork({ id: 2, department_title: 'Prints' }),
        ],
      },
    });

    await TestBed.configureTestingModule({
      imports: [WallExample],
    }).compileComponents();

    fixture = TestBed.createComponent(WallExample);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('creates and starts on the default query', () => {
    expect(component).toBeTruthy();
    expect(component.query()).toBe('impressionism');
    expect(component.selectedKeys()).toEqual([]);
  });

  it('maps the fetched artworks into the wall', async () => {
    await fixture.whenStable();
    expect(component.total()).toBe(2);
    expect(component.collectionIds()).toEqual(['dept:Painting', 'dept:Prints']);
  });

  it('applies a moved intent to its own roots (controlled contract)', async () => {
    await fixture.whenStable();
    const roots = component.roots();
    const asset = collection(roots[0]).children[0] as WallAsset;

    component.onMove({
      dragIds: [asset.id],
      dragNodes: [asset],
      parentId: 'dept:Prints',
      parentNode: roots[1],
      index: 0,
      dropEffect: 'move',
    });

    const target = collection(
      component.roots().find((n) => isCollection(n) && n.id === 'dept:Prints'),
    );
    expect(target.children[0].id).toBe(asset.id);
    expect(component.lastMove()).toContain('re-filed 1');
  });

  it('clearSelection empties the owned selection', () => {
    component.selectedKeys.set(['art-1', 'art-2']);
    component.clearSelection();
    expect(component.selectedKeys()).toEqual([]);
  });
});
