import { polyfillJsdomScrolling } from './jsdom-polyfills.spec-helper';

import { Component, Directive, inject, OnDestroy } from '@angular/core';

polyfillJsdomScrolling();
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AngularTree } from './angular-tree';
import type { ToggleEvent } from './events';
import { TreeNodeDef } from './tree-node-def';
import { TreeNodeToggle } from './tree-node-toggle';

interface Node {
  id: string;
  children: Node[];
}

const ROW = 32;
const VIEWPORT = 320;
/** Far enough that no row rendered at the top is still rendered after. */
const FAR = 100 * ROW;
/** Small enough that leaving rows are handed straight to arriving ones. */
const STEP = 2 * ROW;

const DATA: Node[] = Array.from({ length: 400 }, (_, index) => ({
  id: `n${index}`,
  children: [{ id: `n${index}-child`, children: [] }],
}));

/** Counts how often the consumer's row content is built and thrown away. */
class ContentLife {
  built = 0;
  destroyed = 0;
}

@Directive({ selector: '[contentProbe]' })
class ContentProbe implements OnDestroy {
  readonly #life = inject(ContentLife);

  constructor() {
    this.#life.built++;
  }

  ngOnDestroy() {
    this.#life.destroyed++;
  }
}

@Component({
  imports: [AngularTree, TreeNodeDef, TreeNodeToggle, ContentProbe],
  template: `
    <angular-tree
      style="height: 320px"
      [dataSource]="data"
      [childrenAccessor]="children"
      [expansionKey]="key"
      [itemSize]="32"
      (toggled)="toggles.push($event)"
    >
      <ng-template treeNodeDef let-node>
        <button class="toggle" treeNodeToggle contentProbe>▸</button>
        <span class="name">{{ node.id }}</span>
      </ng-template>
    </angular-tree>
  `,
})
class Host {
  data = DATA;
  children = (node: Node) => node.children;
  key = (node: Node) => node.id;
  toggles: ToggleEvent<Node>[] = [];
}

describe('AngularTree row recycling', () => {
  let fixture: ComponentFixture<Host>;
  let life: ContentLife;

  const viewportEl = (): HTMLElement =>
    fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport');
  const rows = (): HTMLElement[] => [
    ...fixture.nativeElement.querySelectorAll('.tree-node'),
  ];
  const renderedIds = () => rows().map((row) => row.dataset['nodeId']);

  /** A wheel-like scroll: CDK only recycles rows it removes and adds together. */
  async function scrollTo(top: number) {
    for (let offset = STEP; offset <= top; offset += STEP)
      await scrollStep(offset);
  }

  /** jsdom has no layout: fake the scroll position, then let CDK re-range. */
  async function scrollStep(top: number) {
    Object.defineProperty(viewportEl(), 'scrollTop', {
      value: top,
      configurable: true,
      writable: true,
    });
    viewportEl().dispatchEvent(new Event('scroll'));
    // CDK audits scroll events on the animation frame.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [ContentLife],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    life = TestBed.inject(ContentLife);
    await fixture.whenStable();

    const element = viewportEl();
    Object.defineProperty(element, 'clientHeight', {
      value: VIEWPORT,
      configurable: true,
    });
    Object.defineProperty(element, 'clientWidth', {
      value: 400,
      configurable: true,
    });
    fixture.debugElement
      .query(By.directive(CdkVirtualScrollViewport))
      .injector.get(CdkVirtualScrollViewport)
      .checkViewportSize();
    await fixture.whenStable();
  });

  it('keeps the consumer content of a recycled row instead of rebuilding it', async () => {
    const before = renderedIds();
    expect(before).toContain('n0');

    await scrollTo(FAR);

    const after = renderedIds();
    expect(after).toContain('n100');
    expect(after.filter((id) => before.includes(id))).toEqual([]);
    // A hundred rows went by and every slot shows another node now. A rebuild
    // would have destroyed one content view per row that left.
    expect(life.destroyed).toBe(0);
    // Nothing destroyed, so every content view ever built is still a slot:
    // on screen, or parked in CDK's view cache (`templateCacheSize`, 20).
    expect(life.built).toBeLessThanOrEqual(after.length + 20);
  });

  it('routes a content directive of a recycled row to the node it shows now', async () => {
    await scrollTo(FAR);

    const row = rows().find((element) => element.dataset['nodeId'] === 'n100')!;
    expect(row.querySelector('.name')!.textContent).toBe('n100');
    row.querySelector<HTMLElement>('.toggle')!.click();
    await fixture.whenStable();

    expect(
      fixture.componentInstance.toggles.map((event) => event.node.id),
    ).toEqual(['n100']);
  });
});
