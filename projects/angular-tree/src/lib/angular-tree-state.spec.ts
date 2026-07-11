import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, signal } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularTree } from './angular-tree';
import { TreeNodeDef } from './tree-node-def';
import { TreeEmptyDef, TreeLoadingDef } from './tree-state-def';

interface DemoNode {
  id: string;
  name: string;
  children?: DemoNode[];
}

@Component({
  imports: [AngularTree, TreeNodeDef, TreeEmptyDef, TreeLoadingDef],
  template: `
    <angular-tree
      [dataSource]="data()"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [loading]="loading()"
      [searchTerm]="term()"
      [searchMatch]="match"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
      <ng-template treeEmptyDef>
        <p class="empty">
          {{ term() ? 'No results for ' + term() : 'No items' }}
        </p>
      </ng-template>
      <ng-template treeLoadingDef><p class="loading">Loading…</p></ng-template>
    </angular-tree>
  `,
})
class Host {
  data = signal<DemoNode[]>([{ id: 'a', name: 'Alpha' }]);
  loading = signal(false);
  term = signal('');
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
  match = (node: DemoNode, term: string) =>
    node.name.toLowerCase().includes(term.toLowerCase());
}

/** Control: no state defs projected — the tree must stay blank. */
@Component({
  imports: [AngularTree, TreeNodeDef],
  template: `
    <angular-tree
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [loading]="true"
    >
      <ng-template treeNodeDef let-node>{{ node.name }}</ng-template>
    </angular-tree>
  `,
})
class BareHost {
  data: DemoNode[] = [];
  children = (node: DemoNode) => node.children;
  key = (node: DemoNode) => node.id;
}

describe('AngularTree empty/loading states', () => {
  let fixture: ComponentFixture<Host>;
  const stateText = () =>
    (
      fixture.nativeElement.querySelector('.tree-state') as HTMLElement | null
    )?.textContent?.trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host, BareHost],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('shows neither state while rows are present', () => {
    expect(fixture.nativeElement.querySelector('.tree-state')).toBeNull();
  });

  it('shows the empty state when there are no data rows', async () => {
    fixture.componentInstance.data.set([]);
    await fixture.whenStable();
    expect(stateText()).toBe('No items');
  });

  it('shows the empty state (search variant) when a search filters everything out', async () => {
    fixture.componentInstance.term.set('zzz');
    await fixture.whenStable();
    // Template reads the consumer's own signal — no tree-provided context needed.
    expect(stateText()).toBe('No results for zzz');
  });

  it('shows the loading state while [loading] is set, taking precedence over empty', async () => {
    fixture.componentInstance.data.set([]); // empty too — loading must still win
    fixture.componentInstance.loading.set(true);
    await fixture.whenStable();
    expect(stateText()).toBe('Loading…');

    fixture.componentInstance.loading.set(false);
    await fixture.whenStable();
    expect(stateText()).toBe('No items');
  });

  it('renders nothing when no state def is projected (blank default)', async () => {
    const bare = TestBed.createComponent(BareHost);
    await bare.whenStable();
    expect(bare.nativeElement.querySelector('.tree-state')).toBeNull();
  });
});
