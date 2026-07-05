/**
 * Example file-system data: a discriminated union exercising the typed
 * classification design (ROADMAP: per-type defs via type-guard `when`).
 * Three members → three defs in the demo: folder, smart folder, file.
 */

export type FileExtension = 'pdf' | 'docx' | 'xlsx' | 'eml' | 'png';
export type FileStatus = 'draft' | 'signed' | 'final';

export interface FolderNode {
  kind: 'folder';
  id: string;
  name: string;
  children: DocNode[];
  /** Material icon for the closed state (top-level areas get themed ones). */
  icon?: string;
  /** Children served async by the accessor (Phase 3 lazy-loading demo). */
  lazy?: boolean;
}

/** Virtual folder (saved search) — same shape, different def in the demo. */
export interface SmartFolderNode {
  kind: 'smart';
  id: string;
  name: string;
  icon: string;
  children: DocNode[];
}

export interface FileNode {
  kind: 'file';
  id: string;
  name: string;
  ext: FileExtension;
  /** Bytes. */
  size: number;
  status?: FileStatus;
  starred?: boolean;
}

export type DocNode = FolderNode | SmartFolderNode | FileNode;

export const isFolder = (node: DocNode): node is FolderNode => node.kind === 'folder';
export const isSmart = (node: DocNode): node is SmartFolderNode => node.kind === 'smart';
export const isFile = (node: DocNode): node is FileNode => node.kind === 'file';

/** Removes the given ids (and their subtrees) — consumer side of a delete intent. */
export function applyDelete(roots: DocNode[], ids: readonly string[]): DocNode[] {
  const remove = new Set(ids);
  const prune = (nodes: DocNode[]): DocNode[] =>
    nodes
      .filter((node) => !remove.has(node.id))
      .map((node) => (isFile(node) ? node : { ...node, children: prune(node.children) }));
  return prune(roots);
}

/**
 * Applies a `MoveEvent` to the nested data (consumer side of the controlled
 * contract). `index` counts the target's children *with dragged nodes still
 * present* — adjust first, then remove, then insert (see MoveEvent docs).
 */
export function applyMove(
  roots: DocNode[],
  dragIds: readonly string[],
  parentId: string | null,
  index: number,
): DocNode[] {
  const dragSet = new Set(dragIds);

  const findFolder = (nodes: DocNode[], id: string): FolderNode | undefined => {
    for (const node of nodes) {
      if (isFile(node)) continue;
      if (isFolder(node) && node.id === id) return node;
      const hit = findFolder(node.children, id);
      if (hit) return hit;
    }
    return undefined;
  };

  const targetChildren = parentId == null ? roots : (findFolder(roots, parentId)?.children ?? []);
  const adjustedIndex =
    index - targetChildren.slice(0, index).filter((child) => dragSet.has(child.id)).length;

  const removed: DocNode[] = [];
  const prune = (nodes: DocNode[]): DocNode[] =>
    nodes.flatMap((node) => {
      if (dragSet.has(node.id)) {
        removed.push(node);
        return [];
      }
      return [isFile(node) ? node : { ...node, children: prune(node.children) }];
    });
  const pruned = prune(roots);

  if (parentId == null) {
    const out = [...pruned];
    out.splice(adjustedIndex, 0, ...removed);
    return out;
  }

  const graft = (nodes: DocNode[]): DocNode[] =>
    nodes.map((node) => {
      if (isFile(node)) return node;
      if (isFolder(node) && node.id === parentId) {
        const children = [...node.children];
        children.splice(adjustedIndex, 0, ...removed);
        return { ...node, children };
      }
      return { ...node, children: graft(node.children) };
    });
  return graft(pruned);
}

let copySequence = 0;

/**
 * `dropEffect: 'copy'` consumer side (v2): insert *duplicates* at the target,
 * sources untouched. Clones get fresh ids — keys must stay unique tree-wide.
 */
export function applyCopy(
  roots: DocNode[],
  dragIds: readonly string[],
  parentId: string | null,
  index: number,
): DocNode[] {
  const dragSet = new Set(dragIds);

  const clone = (node: DocNode): DocNode => {
    const id = `${node.id}-copy-${(copySequence += 1)}`;
    return isFile(node) ? { ...node, id } : { ...node, id, children: node.children.map(clone) };
  };

  const collect = (nodes: DocNode[]): DocNode[] =>
    nodes.flatMap((node) => [
      ...(dragSet.has(node.id) ? [clone(node)] : []),
      ...(isFile(node) ? [] : collect(node.children)),
    ]);
  const copies = collect(roots);

  if (parentId == null) {
    const out = [...roots];
    out.splice(index, 0, ...copies);
    return out;
  }

  const graft = (nodes: DocNode[]): DocNode[] =>
    nodes.map((node) => {
      if (isFile(node)) return node;
      if (isFolder(node) && node.id === parentId) {
        const children = [...node.children];
        children.splice(index, 0, ...copies);
        return { ...node, children };
      }
      return { ...node, children: graft(node.children) };
    });
  return graft(roots);
}

const AREAS = ['Cases', 'Contracts', 'Invoices', 'HR', 'Marketing', 'Litigation', 'Compliance', 'Archive'];

/** Top-level areas carry themed icons — the "folder styles via types" demo. */
const AREA_ICONS: Record<string, string> = {
  Cases: 'gavel',
  Contracts: 'history_edu',
  Invoices: 'receipt_long',
  HR: 'diversity_3',
  Marketing: 'campaign',
  Litigation: 'balance',
  Compliance: 'verified_user',
  Archive: 'inventory_2',
};

const TOPICS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Stark Industries', 'Wayne Enterprises'];
const SUBJECTS = ['Drafts', 'Signed', 'Correspondence', 'Evidence', 'Internal'];
const EXTENSIONS: readonly FileExtension[] = ['pdf', 'docx', 'xlsx', 'eml', 'png'];
const BASENAMES = [
  'NDA',
  'Master Agreement',
  'Invoice 2026-041',
  'Termination Notice',
  'Payroll Summary',
  'Onboarding Checklist',
  'Brand Guidelines',
  'Court Filing',
  'Exhibit A',
  'Meeting Notes',
  'Due Diligence',
  'Settlement Offer',
];
const STATUSES: readonly (FileStatus | undefined)[] = [
  undefined,
  undefined,
  undefined,
  'draft',
  'signed',
  'final',
];

/** Deterministic pseudo-random — stable tree across reloads, no Math.random. */
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};

export type ExampleScale = 'standard' | 'xl';

/** `xl` ≈ 100k nodes — the ROADMAP Phase 2/8 virtualization smoke target. */
const SCALES: Record<ExampleScale, { areas: number; topics: number; subjects: number; files: number }> = {
  standard: { areas: 8, topics: 6, subjects: 5, files: 6 },
  xl: { areas: 25, topics: 25, subjects: 10, files: 12 }, // ≈110k nodes (avg 16.5 files/subject)
};

export function generateExampleTree(scale: ExampleScale = 'standard'): {
  roots: DocNode[];
  folderIds: string[];
  nodeCount: number;
} {
  const counts = SCALES[scale];
  const random = seeded(42);
  const folderIds: string[] = [];
  let fileId = 0;
  let nodeCount = 0;

  const label = (names: readonly string[], index: number) =>
    index < names.length ? names[index] : `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`;

  const pick = <T>(pool: readonly T[]): T => pool[Math.floor(random() * pool.length)];

  const files = (parentId: string, count: number): FileNode[] =>
    Array.from({ length: count }, () => {
      nodeCount += 1;
      const ext = pick(EXTENSIONS);
      return {
        kind: 'file' as const,
        id: `${parentId}/f${(fileId += 1)}`,
        name: `${pick(BASENAMES)}.${ext}`,
        ext,
        size: Math.floor(random() * 4_000_000) + 1_000,
        status: pick(STATUSES),
        starred: random() < 0.08,
      };
    });

  const folder = (id: string, name: string, children: DocNode[], icon?: string): FolderNode => {
    folderIds.push(id);
    nodeCount += 1;
    return { kind: 'folder', id, name, children, ...(icon ? { icon } : {}) };
  };

  const roots: DocNode[] = Array.from({ length: counts.areas }, (_, a) => {
    const areaName = label(AREAS, a);
    return folder(
      `${a}`,
      areaName,
      Array.from({ length: counts.topics }, (_, t) =>
        folder(
          `${a}/${t}`,
          label(TOPICS, t),
          Array.from({ length: counts.subjects }, (_, s) =>
            folder(
              `${a}/${t}/${s}`,
              label(SUBJECTS, s),
              files(`${a}/${t}/${s}`, counts.files + Math.floor(random() * 10)),
            ),
          ),
          'domain',
        ),
      ),
      AREA_ICONS[areaName.split(' ')[0]],
    );
  });

  // Smart folder (saved search): *copies* of starred files — ids must stay
  // unique tree-wide, so the copies get their own. Starts collapsed (not in
  // folderIds); third def in the demo.
  const starred: FileNode[] = [];
  const collectStarred = (nodes: DocNode[]) => {
    for (const node of nodes) {
      if (isFile(node)) {
        if (node.starred && starred.length < 12) {
          starred.push({ ...node, id: `starred/${starred.length}` });
        }
      } else {
        collectStarred(node.children);
      }
    }
  };
  collectStarred(roots);
  nodeCount += 1 + starred.length;
  roots.unshift({ kind: 'smart', id: 'smart-starred', name: 'Starred', icon: 'star', children: starred });

  // Lazy root: not in folderIds, so it starts collapsed — expanding it is
  // what triggers the (artificially slow) load in the demo accessor.
  nodeCount += 1;
  roots.push({
    kind: 'folder',
    id: 'remote',
    name: 'Remote Archive (lazy)',
    icon: 'cloud',
    lazy: true,
    children: files('remote', 12),
  });

  return { roots, folderIds, nodeCount };
}
