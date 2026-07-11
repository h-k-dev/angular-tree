/**
 * Example file-system data: a discriminated union exercising the typed
 * classification design (ROADMAP: per-type defs via type-guard `when`).
 * Three members → three defs in the demo: folder, smart folder, file.
 */

export type FileExtension = 'pdf' | 'docx' | 'xlsx' | 'eml' | 'png';
export type FileStatus = 'draft' | 'signed' | 'final';

/** File tag consumed by the demo's typed-drop rules ("Drag & drop rules" folder). */
export type DndTag = 'A' | 'B' | 'C';

export interface FolderNode {
  kind: 'folder';
  id: string;
  name: string;
  children: DocNode[];
  /** Material icon for the closed state (top-level areas get themed ones). */
  icon?: string;
  /** Children served async by the accessor (Phase 3 lazy-loading demo). */
  lazy?: boolean;
  /** First load rejects (tree-example's accessor) — the `hasError` → Retry demo. */
  flaky?: boolean;
  /**
   * Drop bin (`disableDrop` demo): only files whose `dnd` tag is listed may
   * drop inside; `[]` accepts nothing. Absent = ordinary folder.
   */
  accepts?: readonly DndTag[];
  /** Drag disabled (`disableDrag` demo) — drops inside are unaffected. */
  locked?: boolean;
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
  /** Typed-drop tag (`disableDrop` demo): only bins accepting it take this file. */
  dnd?: DndTag;
  /** Drag disabled (`disableDrag` demo). */
  locked?: boolean;
}

export type DocNode = FolderNode | SmartFolderNode | FileNode;

export const isFolder = (node: DocNode): node is FolderNode =>
  node.kind === 'folder';
export const isSmart = (node: DocNode): node is SmartFolderNode =>
  node.kind === 'smart';
export const isFile = (node: DocNode): node is FileNode => node.kind === 'file';

/** Removes the given ids (and their subtrees) — consumer side of a delete intent. */
export function applyDelete(
  roots: DocNode[],
  ids: readonly string[],
): DocNode[] {
  const remove = new Set(ids);
  const prune = (nodes: DocNode[]): DocNode[] =>
    nodes
      .filter((node) => !remove.has(node.id))
      .map((node) =>
        isFile(node) ? node : { ...node, children: prune(node.children) },
      );
  return prune(roots);
}

/** Applies a rename — consumer side of the `renamed` intent AND of the dialog flow. */
export function applyRename(
  roots: DocNode[],
  id: string,
  name: string,
): DocNode[] {
  const rename = (nodes: DocNode[]): DocNode[] =>
    nodes.map((node) =>
      node.id === id
        ? { ...node, name }
        : isFile(node)
          ? node
          : { ...node, children: rename(node.children) },
    );
  return rename(roots);
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

  const targetChildren =
    parentId == null ? roots : (findFolder(roots, parentId)?.children ?? []);
  const adjustedIndex =
    index -
    targetChildren.slice(0, index).filter((child) => dragSet.has(child.id))
      .length;

  const removed: DocNode[] = [];
  const prune = (nodes: DocNode[]): DocNode[] =>
    nodes.flatMap((node) => {
      if (dragSet.has(node.id)) {
        removed.push(node);
        return [];
      }
      return [
        isFile(node) ? node : { ...node, children: prune(node.children) },
      ];
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
    return isFile(node)
      ? { ...node, id }
      : { ...node, id, children: node.children.map(clone) };
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

// "Cases" level pools — client → matter → phase → workstream (6 levels deep
// with the Cases root above and the files below).
const TOPICS = [
  'Acme Corp',
  'Globex',
  'Initech',
  'Umbrella',
  'Stark Industries',
  'Wayne Enterprises',
];
// 'Contract Renewal' stays first: the perf e2e searches "contract" and must hit.
const MATTERS = [
  'Contract Renewal',
  'Patent Dispute',
  'Series B Financing',
  'Data Breach',
  'Acquisition',
  'IPO Readiness',
  'Tax Audit',
  'Employment Claim',
  'License Negotiation',
  'Antitrust Review',
];
const PHASES = [
  'Intake',
  'Discovery',
  'Negotiation',
  'Filing',
  'Hearing',
  'Closing',
  'Post-Closing',
  'Appeal',
];
const SUBJECTS = ['Drafts', 'Signed', 'Correspondence', 'Evidence', 'Internal'];
const EXTENSIONS: readonly FileExtension[] = [
  'pdf',
  'docx',
  'xlsx',
  'eml',
  'png',
];
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
const SCALES: Record<
  ExampleScale,
  {
    clients: number;
    matters: number;
    phases: number;
    workstreams: number;
    files: number;
  }
> = {
  standard: { clients: 6, matters: 4, phases: 3, workstreams: 3, files: 6 },
  xl: { clients: 12, matters: 10, phases: 8, workstreams: 6, files: 12 }, // ≈100k nodes (avg 16.5 files/workstream)
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
    index < names.length
      ? names[index]
      : `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`;

  const pick = <T>(pool: readonly T[]): T =>
    pool[Math.floor(random() * pool.length)];

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

  const folder = (
    id: string,
    name: string,
    children: DocNode[],
    icon?: string,
  ): FolderNode => {
    folderIds.push(id);
    nodeCount += 1;
    return { kind: 'folder', id, name, children, ...(icon ? { icon } : {}) };
  };

  // "Cases" — the ONE deep hierarchy: it alone carries the node volume that
  // makes virtualization visible (and the ~100k of `xl`), plus the search,
  // checkbox-cascade, and status-chip material. Every other root demos one
  // specific feature.
  const LEVELS: { pool: readonly string[]; count: number; icon?: string }[] = [
    { pool: TOPICS, count: counts.clients, icon: 'domain' },
    { pool: MATTERS, count: counts.matters },
    { pool: PHASES, count: counts.phases },
    { pool: SUBJECTS, count: counts.workstreams },
  ];
  const branch = (prefix: string, depth: number): DocNode[] => {
    const level = LEVELS[depth];
    if (!level) return files(prefix, counts.files + Math.floor(random() * 10));
    return Array.from({ length: level.count }, (_, i) =>
      folder(
        `${prefix}/${i}`,
        label(level.pool, i),
        branch(`${prefix}/${i}`, depth + 1),
        level.icon,
      ),
    );
  };
  const roots: DocNode[] = [
    folder('cases', 'Cases', branch('cases', 0), 'gavel'),
  ];

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
  roots.unshift({
    kind: 'smart',
    id: 'smart-starred',
    name: 'Starred',
    icon: 'star',
    children: starred,
  });

  // Drag & drop rules showcase: every predicate combination under one root,
  // each node named after the rule it demonstrates (predicates live in
  // tree-example.ts). The root starts COLLAPSED — e2e row-order assumptions
  // near the top of the tree (and the first-`.pdf` drag sources) must not
  // shift — while the bins inside register via `folder()`, so they open
  // pre-expanded the moment the showcase is.
  const demoFile = (
    id: string,
    name: string,
    extra: Partial<FileNode> = {},
  ): FileNode => {
    nodeCount += 1;
    return {
      kind: 'file',
      id: `dnd/${id}`,
      name,
      ext: 'pdf',
      size: 24_000,
      ...extra,
    };
  };
  nodeCount += 1;
  roots.splice(1, 0, {
    kind: 'folder',
    id: 'dnd',
    name: 'Drag & drop rules',
    icon: 'drag_indicator',
    children: [
      demoFile('free', 'Drag me anywhere.pdf'),
      demoFile('locked', 'Can’t drag me — locked.docx', {
        ext: 'docx',
        locked: true,
      }),
      demoFile('a', 'Type A — drop me in an A bin.xlsx', {
        ext: 'xlsx',
        dnd: 'A',
      }),
      demoFile('b', 'Type B — both bins take me.eml', { ext: 'eml', dnd: 'B' }),
      demoFile('c', 'Type C — no bin wants me.png', { ext: 'png', dnd: 'C' }),
      {
        ...folder(
          'dnd/bin-ab',
          'Bin — accepts A + B',
          [
            demoFile('bin-ab/resident', 'Type A lives here.xlsx', {
              ext: 'xlsx',
              dnd: 'A',
            }),
          ],
          'move_to_inbox',
        ),
        accepts: ['A', 'B'],
      },
      {
        ...folder(
          'dnd/bin-b',
          'Bin — accepts only B',
          [
            demoFile('bin-b/resident', 'Type B lives here.eml', {
              ext: 'eml',
              dnd: 'B',
            }),
          ],
          'move_to_inbox',
        ),
        accepts: ['B'],
      },
      {
        ...folder(
          'dnd/bin-none',
          'Bin — accepts nothing',
          [
            demoFile(
              'bin-none/escapee',
              'Drag me out — nothing comes back.pdf',
            ),
          ],
          'block',
        ),
        accepts: [],
      },
      {
        ...folder(
          'dnd/vault',
          'Locked folder — can’t drag, drops OK',
          [demoFile('vault/resident', 'The folder is locked, I’m not.pdf')],
          'lock',
        ),
        locked: true,
      },
    ],
  });

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

  // Flaky root: also collapsed; its FIRST load rejects (tree-example's
  // accessor tracks attempts), so the `hasError` → Retry branch of the folder
  // template is actually reachable in the demo.
  nodeCount += 1;
  roots.push({
    kind: 'folder',
    id: 'flaky',
    name: 'Flaky server (fails once)',
    icon: 'cloud_off',
    flaky: true,
    children: files('flaky', 8),
  });

  // Root-level files: leaves are legal at any depth including the root — no
  // enclosing folder required (`MoveEvent.parentId === null` drops land here).
  // The demo keeps two around so the case stays visible.
  roots.push(...files('root', 2));

  return { roots, folderIds, nodeCount };
}
