import { signal } from '@angular/core';

import { TreeController, TreeControllerInputs } from './tree-controller';

/**
 * 100k-node smoke run (ROADMAP Phase 2 / Phase 8 benchmark preview).
 * Bounds are deliberately loose (CI machines vary wildly) — they exist to
 * catch accidental O(n²) regressions, not to benchmark. Local timings are
 * 1–2 orders of magnitude below every bound.
 */

interface PerfNode {
  id: string;
  name: string;
  children?: PerfNode[];
}

/** 50 roots × 50 folders × 40 files = 102,550 nodes, depth 3. */
function generate(): PerfNode[] {
  return Array.from({ length: 50 }, (_, a) => ({
    id: `${a}`,
    name: `Area ${a}`,
    children: Array.from({ length: 50 }, (_, b) => ({
      id: `${a}/${b}`,
      name: `Folder ${b}`,
      children: Array.from({ length: 40 }, (_, c) => ({
        id: `${a}/${b}/${c}`,
        name: `file-${c}.pdf`,
      })),
    })),
  }));
}

const NODE_COUNT = 50 + 50 * 50 + 50 * 50 * 40;

function createController() {
  const controller = new TreeController<PerfNode>();
  const searchTerm = signal('');
  const inputs: TreeControllerInputs<PerfNode> = {
    dataSource: signal(generate()),
    childrenAccessor: signal((node: PerfNode) => node.children),
    expansionKey: signal((node: PerfNode) => node.id),
    defaultExpandedKeys: signal<readonly string[]>([]),
    defaultFocusedKey: signal<string | undefined>(undefined),
    searchTerm,
    searchMatch: signal((node: PerfNode, term: string) => node.name.includes(term)),
  };
  controller.connect(inputs);
  return { controller, searchTerm };
}

function timed(work: () => void): number {
  const start = performance.now();
  work();
  return performance.now() - start;
}

describe('TreeController @ 100k nodes (smoke)', () => {
  it('flattens the full model', () => {
    const { controller } = createController();
    const elapsed = timed(() => controller.flat());
    expect(controller.flat().list.length).toBe(NODE_COUNT);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('computes the expand-all visible array', () => {
    const { controller } = createController();
    controller.expandAll();
    const elapsed = timed(() => controller.visibleNodes());
    expect(controller.visibleNodes().length).toBe(NODE_COUNT);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('recomputes visibility per toggle without a full rebuild blowup', () => {
    const { controller } = createController();
    controller.expandAll();
    controller.visibleNodes(); // warm

    const elapsed = timed(() => {
      controller.setExpanded('0', false);
      controller.visibleNodes();
      controller.setExpanded('0', true);
      controller.visibleNodes();
    });
    expect(elapsed).toBeLessThan(2_000);
  });

  it('folds checkStates in one reverse pass', () => {
    const { controller } = createController();
    controller.flat(); // warm the model
    controller.selectedIds.set(new Set(['0/0/0', '1/1/1', '49/49/39']));
    const elapsed = timed(() => controller.checkStates());
    expect(controller.checkStates().get('0/0')).toBe('indeterminate');
    expect(elapsed).toBeLessThan(1_500);
  });

  it('searches the full model with ancestor chains', () => {
    const { controller, searchTerm } = createController();
    controller.flat(); // warm
    searchTerm.set('file-39');
    const elapsed = timed(() => controller.visibleNodes());
    // Every folder has exactly one file-39 → chain: 50 areas + 2500 folders + 2500 files.
    expect(controller.visibleNodes().length).toBe(50 + 2_500 + 2_500);
    expect(elapsed).toBeLessThan(2_000);
  });
});
