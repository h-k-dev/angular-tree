import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { SelectEvent } from '@h-k-dev/angular-tree';

import { VscodeExample } from './vscode-example';
import { FsNode, isDir } from './fs-data';

/** Depth-first find by path over the component's live workspace signal. */
function find(nodes: readonly FsNode[], path: string): FsNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const hit = isDir(node) ? find(node.children, path) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

function selection(
  node: FsNode,
  cause: SelectEvent<FsNode>['cause'],
): SelectEvent<FsNode> {
  return {
    ids: [node.path],
    nodes: [node],
    trigger: node,
    cause,
    added: [node.path],
    removed: [],
  };
}

describe('VscodeExample', () => {
  let component: VscodeExample;
  let fixture: ComponentFixture<VscodeExample>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VscodeExample],
    }).compileComponents();

    fixture = TestBed.createComponent(VscodeExample);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('applies a committed rename to its own data (controlled pattern)', () => {
    const target = 'angular-tree/src/main.ts';
    const node = find(component.workspace(), target)!;
    component.onRename({ id: target, name: 'bootstrap.ts', node });

    // Same path, new name — the tree re-reads the mutated workspace.
    expect(find(component.workspace(), target)?.name).toBe('bootstrap.ts');
    // A sibling is untouched — the recursive map copies, it doesn't clobber.
    expect(
      find(component.workspace(), 'angular-tree/src/styles.scss')?.name,
    ).toBe('styles.scss');
  });

  it('opens files but never folders (double-click activate)', () => {
    const file = find(component.workspace(), 'angular-tree/README.md')!;
    component.openFile(file);
    expect(component.openPath()).toBe('angular-tree/README.md');
    expect(component.previewedFile()?.path).toBe('angular-tree/README.md');

    // A folder activation is inert — folders toggle, they don't "open".
    const folder = find(component.workspace(), 'angular-tree/src')!;
    component.openFile(folder);
    expect(component.openPath()).toBe('angular-tree/README.md');
    expect(component.previewedFile()?.path).toBe('angular-tree/README.md');
  });

  it('previews genuine selections but ignores context-menu reconciliation', () => {
    const first = find(component.workspace(), 'angular-tree/src/main.ts')!;
    const second = find(component.workspace(), 'angular-tree/README.md')!;

    component.onSelection(selection(first, 'pointer'));
    expect(component.previewedFile()?.path).toBe('angular-tree/src/main.ts');

    // OS convention still selects the right-clicked row; cause lets this
    // consumer keep its preview stable until the explicit action is chosen.
    component.onSelection(selection(second, 'contextmenu'));
    expect(component.previewedFile()?.path).toBe('angular-tree/src/main.ts');

    component.onSelection(selection(second, 'keyboard'));
    expect(component.previewedFile()?.path).toBe('angular-tree/README.md');
  });

  it('the explicit Preview action accepts files and rejects folders', () => {
    const file = find(component.workspace(), 'angular-tree/src/main.ts')!;
    const folder = find(component.workspace(), 'angular-tree/src')!;

    component.previewFile(file);
    expect(component.previewedFile()?.path).toBe('angular-tree/src/main.ts');

    component.previewFile(folder);
    expect(component.previewedFile()?.path).toBe('angular-tree/src/main.ts');
  });
});
