/**
 * "Lazy Load Only" data — FIVE different public APIs, one per self-contained
 * root, all unified behind the tree's accessor contract (the tree never learns
 * any of these shapes). Each source maps its response into the common
 * `LazyNode`; children are fetched ONE LEVEL AT A TIME, on open. The component
 * OWNS a progressively-loaded tree so drag & drop can apply moves — confined
 * per `source`, since dragging a GitHub file into a taxonomy is meaningless.
 */

/** Which public API a node comes from — also its drag & drop sandbox id. */
export type Source = 'github' | 'gbif' | 'hackernews' | 'wikipedia' | 'jsdelivr';

export interface LazyNode {
  /** Unique, stable key (source-prefixed). Immutable across moves. */
  readonly id: string;
  readonly name: string;
  /** Backend + DnD container boundary. */
  readonly source: Source;
  /** `true` = no children (the accessor returns `undefined`). */
  readonly leaf: boolean;
  /** Source-specific handle the fetcher uses for the next level (path/key/id/title). */
  readonly ref: string;
  /** Small trailing label (rank / score / size / type). */
  readonly meta?: string;
  /** Hacker News: child item ids captured from the parent (saves a round-trip). */
  readonly kids?: readonly number[];
  /** `undefined` = not yet fetched; an array (incl. empty) = loaded. */
  children?: readonly LazyNode[];
}

export const isBranch = (node: LazyNode): boolean => !node.leaf;

/** The five roots — one per source, each an unfetched branch keyed to itself. */
export function rootNodes(): LazyNode[] {
  return [
    { id: 'github', name: 'nodejs/node', source: 'github', leaf: false, ref: '', meta: 'GitHub repo' },
    { id: 'gbif', name: 'Animalia', source: 'gbif', leaf: false, ref: '1', meta: 'GBIF taxonomy' },
    { id: 'hackernews', name: 'Hacker News', source: 'hackernews', leaf: false, ref: 'top', meta: 'top stories' },
    { id: 'wikipedia', name: 'Physics', source: 'wikipedia', leaf: false, ref: 'Category:Physics', meta: 'Wikipedia' },
    { id: 'jsdelivr', name: 'react', source: 'jsdelivr', leaf: false, ref: '', meta: 'npm files' },
  ];
}

/** Dispatches to the right backend — the tree calls this via the accessor. */
export function fetchChildren(node: LazyNode): Promise<readonly LazyNode[]> {
  switch (node.source) {
    case 'github':
      return fetchGithub(node);
    case 'gbif':
      return fetchGbif(node);
    case 'hackernews':
      return fetchHackerNews(node);
    case 'wikipedia':
      return fetchWikipedia(node);
    case 'jsdelivr':
      return fetchJsdelivr(node);
    default:
      return Promise.reject(new Error(`unknown source ${node.source satisfies never}`));
  }
}

// -----------------------------------------------------------------------------
// Per-source fetch + map. Each returns direct children as LazyNodes.
// -----------------------------------------------------------------------------

const REPO = 'nodejs/node';

/** GitHub contents API — one directory level per request. */
async function fetchGithub(node: LazyNode): Promise<LazyNode[]> {
  const entries = await getJson<{ name: string; path: string; type: string; size: number }[]>(
    `https://api.github.com/repos/${REPO}/contents/${node.ref}`,
    'GitHub',
  );
  return entries
    .map((entry) => ({
      id: `github:${entry.path}`,
      name: entry.name,
      source: 'github' as const,
      leaf: entry.type !== 'dir',
      ref: entry.path,
      meta: entry.type === 'dir' ? undefined : formatBytes(entry.size),
    }))
    .sort(branchFirst);
}

/** GBIF taxonomy — a taxon's direct children (kingdom → … → species). */
async function fetchGbif(node: LazyNode): Promise<LazyNode[]> {
  const data = await getJson<{
    results: { key: number; canonicalName?: string; scientificName?: string; rank?: string }[];
  }>(`https://api.gbif.org/v1/species/${node.ref}/children?limit=60`, 'GBIF');
  const leafRanks = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);
  return data.results
    .map((taxon) => ({
      id: `gbif:${taxon.key}`,
      name: taxon.canonicalName ?? taxon.scientificName ?? `#${taxon.key}`,
      source: 'gbif' as const,
      leaf: leafRanks.has(taxon.rank ?? ''),
      ref: String(taxon.key),
      meta: (taxon.rank ?? '').toLowerCase() || undefined,
    }))
    .sort(branchFirst);
}

/** Hacker News (Firebase) — top stories, then each story's comment replies. */
async function fetchHackerNews(node: LazyNode): Promise<LazyNode[]> {
  const ids =
    node.ref === 'top'
      ? (await getJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json', 'Hacker News')).slice(0, 10)
      : (node.kids ?? []).slice(0, 15);

  const items = await Promise.all(
    ids.map((id) =>
      getJson<{
        id: number;
        title?: string;
        text?: string;
        by?: string;
        score?: number;
        kids?: number[];
        deleted?: boolean;
        dead?: boolean;
      }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 'Hacker News').catch(() => null),
    ),
  );

  return items
    .filter((item): item is NonNullable<typeof item> => item != null && !item.deleted && !item.dead)
    .map((item) => {
      const label = item.title ?? stripHtml(item.text ?? '');
      return {
        id: `hackernews:${item.id}`,
        name: (label || '(comment)').slice(0, 80),
        source: 'hackernews' as const,
        leaf: !item.kids || item.kids.length === 0,
        ref: String(item.id),
        kids: item.kids,
        meta: item.title ? `▲ ${item.score ?? 0}` : `by ${item.by ?? '?'}`,
      };
    });
}

/** Wikipedia category tree — subcategories (branches) + pages (leaves). */
async function fetchWikipedia(node: LazyNode): Promise<LazyNode[]> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers` +
    `&cmtitle=${encodeURIComponent(node.ref)}&cmtype=subcat|page&cmlimit=50&format=json&origin=*`;
  const data = await getJson<{ query?: { categorymembers?: { pageid: number; title: string; ns: number }[] } }>(
    url,
    'Wikipedia',
  );
  return (data.query?.categorymembers ?? [])
    .map((member) => ({
      id: `wikipedia:${member.pageid}`,
      name: member.title.replace(/^Category:/, ''),
      source: 'wikipedia' as const,
      leaf: member.ns !== 14, // ns 14 = Category → a subcategory (branch)
      ref: member.title,
      meta: member.ns === 14 ? 'category' : 'page',
    }))
    .sort(branchFirst);
}

/**
 * jsDelivr — an npm package's file tree via its CORS-enabled data API (unpkg's
 * `?meta` redirect drops CORS, so it can't be fetched from the browser). The
 * data API has no per-directory endpoint, so ONE request returns the whole tree;
 * children arrive pre-populated and deeper folders open instantly (lazy render,
 * not lazy fetch — a different strategy, on purpose). Only the root fetches.
 */
async function fetchJsdelivr(_node: LazyNode): Promise<LazyNode[]> {
  interface Entry {
    name: string;
    type: 'directory' | 'file';
    size?: number;
    files?: Entry[];
  }
  const data = await getJson<{ files: Entry[] }>(
    'https://data.jsdelivr.com/v1/packages/npm/react@18.3.1',
    'jsDelivr',
  );
  const map = (entry: Entry, prefix: string): LazyNode => {
    const path = `${prefix}/${entry.name}`;
    return entry.type === 'directory'
      ? {
          id: `jsdelivr:${path}`,
          name: entry.name,
          source: 'jsdelivr',
          leaf: false,
          ref: path,
          children: (entry.files ?? []).map((child) => map(child, path)).sort(branchFirst),
        }
      : {
          id: `jsdelivr:${path}`,
          name: entry.name,
          source: 'jsdelivr',
          leaf: true,
          ref: path,
          meta: formatBytes(entry.size),
        };
  };
  return (data.files ?? []).map((entry) => map(entry, '')).sort(branchFirst);
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

async function getJson<T>(url: string, label: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} answered ${response.status}`);
  return response.json() as Promise<T>;
}

const branchFirst = (a: LazyNode, b: LazyNode): number =>
  a.leaf === b.leaf ? a.name.localeCompare(b.name) : a.leaf ? 1 : -1;

const formatBytes = (size?: number): string | undefined =>
  size == null ? undefined : size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} kB`;

/** HN comment text is HTML — flatten tags and the entities that actually occur. */
const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Writes a node's fetched `children` into the owned tree WITHOUT disturbing
 * untouched nodes' identities — only the target and its ancestors get new
 * objects, so the tree's per-node accessor memoization survives and sibling
 * branches are never re-fetched by the write.
 */
export function attachChildren(
  nodes: readonly LazyNode[],
  id: string,
  children: readonly LazyNode[],
): readonly LazyNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === id) {
      changed = true;
      return { ...node, children };
    }
    if (node.children && node.children.length > 0) {
      const grafted = attachChildren(node.children, id, children);
      if (grafted !== node.children) {
        changed = true;
        return { ...node, children: grafted };
      }
    }
    return node;
  });
  return changed ? next : nodes;
}

/**
 * Applies a `MoveEvent` within the owned tree (consumer side of the controlled
 * contract). `index` counts the target's children with dragged nodes still
 * present — adjust, prune, then insert. Unloaded branches move as-is. `parentId`
 * is never null here (root drops are forbidden — a node stays inside its source).
 */
export function applyMove(
  roots: readonly LazyNode[],
  dragIds: readonly string[],
  parentId: string,
  index: number,
): readonly LazyNode[] {
  const dragSet = new Set(dragIds);

  const find = (nodes: readonly LazyNode[], id: string): LazyNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const hit = node.children && find(node.children, id);
      if (hit) return hit;
    }
    return undefined;
  };

  const targetChildren = find(roots, parentId)?.children ?? [];
  const adjustedIndex = index - targetChildren.slice(0, index).filter((child) => dragSet.has(child.id)).length;

  const removed: LazyNode[] = [];
  const prune = (nodes: readonly LazyNode[]): LazyNode[] =>
    nodes.flatMap((node) => {
      if (dragSet.has(node.id)) {
        removed.push(node);
        return [];
      }
      return [node.children ? { ...node, children: prune(node.children) } : node];
    });
  const pruned = prune(roots);

  const graft = (nodes: readonly LazyNode[]): LazyNode[] =>
    nodes.map((node) => {
      if (node.id === parentId) {
        const children = [...(node.children ?? [])];
        children.splice(adjustedIndex, 0, ...removed);
        return { ...node, children };
      }
      return node.children ? { ...node, children: graft(node.children) } : node;
    });
  return graft(pruned);
}
