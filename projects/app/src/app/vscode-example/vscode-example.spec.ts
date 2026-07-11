import { ComponentFixture, TestBed } from '@angular/core/testing';

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
    expect(find(component.workspace(), 'angular-tree/src/styles.scss')?.name).toBe('styles.scss');
  });

  it('opens files but never folders (double-click activate)', () => {
    const file = find(component.workspace(), 'angular-tree/README.md')!;
    component.openFile(file);
    expect(component.openPath()).toBe('angular-tree/README.md');

    // A folder activation is inert — folders toggle, they don't "open".
    const folder = find(component.workspace(), 'angular-tree/src')!;
    component.openFile(folder);
    expect(component.openPath()).toBe('angular-tree/README.md');
  });
});
