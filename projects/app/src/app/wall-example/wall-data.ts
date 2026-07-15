/**
 * Wall data — a LIVE art wall backed by the Art Institute of Chicago's public
 * API (no key, CORS-enabled). The search box drives a `resource()` whose loader
 * fetches artworks with axios; this module owns the wire types and the PURE
 * mapping from that response into the tree's nodes. Every asset is one artwork
 * IMAGE, rendered as a tall fixed-height card — the docs/VIRTUALIZATION thesis
 * (fixed height = UNIFORM rows, not SHORT) now over real, unbounded data.
 */

export interface WallCollection {
  readonly kind: 'collection';
  readonly id: string;
  readonly name: string;
  /** Total assets beneath this collection — the count chip. */
  readonly count: number;
  /** Image ids of the first four children — the row's 2×2 cover mosaic. */
  readonly cover: readonly string[];
  readonly children: readonly WallNode[];
}

export interface WallAsset {
  readonly kind: 'asset';
  readonly id: string;
  readonly name: string;
  /** IIIF image id → `artworkImage()`. */
  readonly imageId: string;
  readonly artist: string;
  readonly date: string;
  readonly dimensions: string;
}

export type WallNode = WallCollection | WallAsset;

export const isCollection = (node: WallNode): node is WallCollection =>
  node.kind === 'collection';

/** IIIF image URL for an artwork (api.artic.edu docs); width is the fetch size. */
export const IIIF_BASE = 'https://www.artic.edu/iiif/2';
export const artworkImage = (imageId: string, width = 400): string =>
  `${IIIF_BASE}/${imageId}/full/${width},/0/default.jpg`;

/** Art Institute search endpoint — public, no auth, CORS-enabled. */
export const AIC_SEARCH_URL = 'https://api.artic.edu/api/v1/artworks/search';
export const AIC_FIELDS =
  'id,title,image_id,artist_title,date_display,dimensions,department_title';

/**
 * AIC wire shape — the untyped boundary (STYLE.md § Boundaries), typed once here
 * so nothing downstream sees `any`. Every field is nullable because the API
 * omits them freely; `mapArtworks` defaults each one at the seam.
 */
export interface AicArtwork {
  readonly id: number;
  readonly title: string | null;
  readonly image_id: string | null;
  readonly artist_title: string | null;
  readonly date_display: string | null;
  readonly dimensions: string | null;
  readonly department_title: string | null;
}

export interface WallData {
  readonly roots: readonly WallNode[];
  readonly collectionIds: readonly string[];
  readonly assetCount: number;
}

export const EMPTY_WALL: WallData = {
  roots: [],
  collectionIds: [],
  assetCount: 0,
};

/**
 * Pure map: group the artworks that HAVE an image by department into collection
 * rows (imageless works are dropped — a card is an image). First-appearance
 * order is preserved, so an identical response yields an identical wall.
 */
export function mapArtworks(artworks: readonly AicArtwork[]): WallData {
  const groups = new Map<string, WallAsset[]>();
  for (const art of artworks) {
    if (!art.image_id) continue;
    const dept = art.department_title ?? 'Other';
    const asset: WallAsset = {
      kind: 'asset',
      id: `art-${art.id}`,
      name: art.title ?? 'Untitled',
      imageId: art.image_id,
      artist: art.artist_title ?? 'Unknown artist',
      date: art.date_display ?? '',
      dimensions: art.dimensions ?? '',
    };
    const bucket = groups.get(dept);
    if (bucket) bucket.push(asset);
    else groups.set(dept, [asset]);
  }

  const roots: WallNode[] = [];
  const collectionIds: string[] = [];
  let assetCount = 0;
  for (const [dept, assets] of groups) {
    const id = `dept:${dept}`;
    collectionIds.push(id);
    assetCount += assets.length;
    roots.push({
      kind: 'collection',
      id,
      name: dept,
      count: assets.length,
      cover: assets.slice(0, 4).map((asset) => asset.imageId),
      children: assets,
    });
  }
  return { roots, collectionIds, assetCount };
}

/** Total assets (leaves) anywhere in the tree — the HUD denominator. */
export function countAssets(nodes: readonly WallNode[]): number {
  let total = 0;
  for (const node of nodes)
    total += isCollection(node) ? countAssets(node.children) : 1;
  return total;
}

/** The artwork with this key, anywhere in the tree — what the viewer shows. */
export function findAsset(
  nodes: readonly WallNode[],
  id: string,
): WallAsset | undefined {
  for (const node of nodes) {
    if (!isCollection(node)) {
      if (node.id === id) return node;
      continue;
    }
    const hit = findAsset(node.children, id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Applies a `MoveEvent` to the owned wall (consumer side of the controlled
 * contract) with an IDENTITY-PRESERVING rebuild: only nodes on the path to a
 * change get new objects, so the tree's per-node accessor memoisation and image
 * DOM survive untouched branches. `index` counts the target's children with the
 * dragged nodes still present — adjust, prune, then insert (see MoveEvent docs).
 */
export function applyMove(
  roots: readonly WallNode[],
  dragIds: readonly string[],
  parentId: string | null,
  index: number,
): readonly WallNode[] {
  const dragSet = new Set(dragIds);

  const find = (
    nodes: readonly WallNode[],
    id: string,
  ): WallCollection | undefined => {
    for (const node of nodes) {
      if (!isCollection(node)) continue;
      if (node.id === id) return node;
      const hit = find(node.children, id);
      if (hit) return hit;
    }
    return undefined;
  };

  const targetChildren =
    parentId == null ? roots : (find(roots, parentId)?.children ?? []);
  const adjustedIndex =
    index -
    targetChildren.slice(0, index).filter((child) => dragSet.has(child.id))
      .length;

  // Remove the dragged nodes, returning the SAME array reference for any level
  // (and node) that lost nothing — untouched branches keep their identity.
  const removed: WallNode[] = [];
  const prune = (nodes: readonly WallNode[]): readonly WallNode[] => {
    let changed = false;
    const out: WallNode[] = [];
    for (const node of nodes) {
      if (dragSet.has(node.id)) {
        removed.push(node);
        changed = true;
        continue;
      }
      if (isCollection(node)) {
        const children = prune(node.children);
        if (children !== node.children) {
          out.push({ ...node, children });
          changed = true;
          continue;
        }
      }
      out.push(node);
    }
    return changed ? out : nodes;
  };
  const pruned = prune(roots);

  const withInserted = (children: readonly WallNode[]): WallNode[] => {
    const next = [...children];
    next.splice(adjustedIndex, 0, ...removed);
    return next;
  };

  if (parentId == null) return withInserted(pruned);

  // Graft into the target parent, again rebuilding only the ancestor chain.
  const graft = (nodes: readonly WallNode[]): readonly WallNode[] => {
    let changed = false;
    const out = nodes.map((node) => {
      if (!isCollection(node)) return node;
      if (node.id === parentId) {
        changed = true;
        return { ...node, children: withInserted(node.children) };
      }
      const children = graft(node.children);
      if (children !== node.children) {
        changed = true;
        return { ...node, children };
      }
      return node;
    });
    return changed ? out : nodes;
  };
  return graft(pruned);
}
