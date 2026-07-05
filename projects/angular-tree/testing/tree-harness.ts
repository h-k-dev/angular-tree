import {
  ComponentHarness,
  HarnessPredicate,
  parallel,
  type BaseHarnessFilters,
  type ElementDimensions,
  type TestElement,
} from '@angular/cdk/testing';
import type { CheckState } from 'angular-tree';

/** Criteria to filter `TreeHarness` instances. */
export interface TreeHarnessFilters extends BaseHarnessFilters {}

/** Criteria to filter tree node (row) harnesses. */
export interface TreeNodeHarnessFilters extends BaseHarnessFilters {
  /** Full row text (the consumer template's rendered text). */
  text?: string | RegExp;
  /** The node's `expansionKey` result. */
  key?: string;
  /** Zero-based depth — same scale as `TreeNodeContext.level`. */
  level?: number;
  expanded?: boolean;
  selected?: boolean;
}

/** Drop position relative to the target row (Phase 4 three-zone math). */
export type TreeDropZone = 'before' | 'inside' | 'after';

/** Pointer offset into a row per zone — safely inside the 25/50/25 bands. */
const ZONE_RATIO: Record<TreeDropZone, number> = { before: 0.1, inside: 0.5, after: 0.9 };

/**
 * Fake-mouse-event payload the CDK drag internals accept: they measure
 * distance from `pageX`/`pageY` (real MouseEvents derive those from client
 * coordinates — synthetic ones must carry both), and treat `buttons === 0 ||
 * detail === 0` as a screen-reader fake that aborts the drag.
 */
function mouseEventData(point: { x: number; y: number }): Record<string, number> {
  return {
    button: 0,
    buttons: 1,
    detail: 1,
    clientX: point.x,
    clientY: point.y,
    pageX: point.x,
    pageY: point.y,
  };
}

/**
 * Harness for one rendered tree row. Obtain via `TreeHarness.getVisibleNodes`
 * / `getNode` — virtualization renders only a window, so a node harness
 * exists exactly for rows that currently have DOM.
 */
export class TreeNodeHarness extends ComponentHarness {
  static hostSelector = '.tree-node';

  static with(options: TreeNodeHarnessFilters = {}): HarnessPredicate<TreeNodeHarness> {
    return new HarnessPredicate(TreeNodeHarness, options)
      .addOption('text', options.text, (harness, text) =>
        HarnessPredicate.stringMatches(harness.getText(), text),
      )
      .addOption('key', options.key, async (harness, key) => (await harness.getKey()) === key)
      .addOption(
        'level',
        options.level,
        async (harness, level) => (await harness.getLevel()) === level,
      )
      .addOption(
        'expanded',
        options.expanded,
        async (harness, expanded) => (await harness.isExpanded()) === expanded,
      )
      .addOption(
        'selected',
        options.selected,
        async (harness, selected) => (await harness.isSelected()) === selected,
      );
  }

  /** Trimmed, whitespace-collapsed text of the whole row template. */
  async getText(): Promise<string> {
    return (await this.host()).text();
  }

  /** The node's stable key (`expansionKey` result). */
  async getKey(): Promise<string> {
    // data-node-id is a documented state hook (docs/THEMING.md), not private DOM.
    return (await (await this.host()).getAttribute('data-node-id')) ?? '';
  }

  /** Zero-based depth (`aria-level` is 1-based; `TreeNodeContext.level` is not). */
  async getLevel(): Promise<number> {
    return Number(await (await this.host()).getAttribute('aria-level')) - 1;
  }

  /** Whether `childrenAccessor` reports children (aria-expanded only exists on parents). */
  async isExpandable(): Promise<boolean> {
    return (await (await this.host()).getAttribute('aria-expanded')) != null;
  }

  async isExpanded(): Promise<boolean> {
    return (await (await this.host()).getAttribute('aria-expanded')) === 'true';
  }

  /** Selection state — read from `data-selected`, which holds in both plain and checkbox mode. */
  async isSelected(): Promise<boolean> {
    return (await (await this.host()).getAttribute('data-selected')) != null;
  }

  /** Tri-state under `checkboxSelection` (`aria-checked`; `mixed` → `indeterminate`). */
  async getCheckState(): Promise<CheckState> {
    const checked = await (await this.host()).getAttribute('aria-checked');
    return checked === 'mixed' ? 'indeterminate' : checked === 'true' ? 'checked' : 'unchecked';
  }

  /** Expands via the template's `treeNodeToggle`. No-op when already expanded or a leaf. */
  async expand(): Promise<void> {
    if (!(await this.isExpandable()) || (await this.isExpanded())) return;
    await (await this.#toggle()).click();
  }

  /** Collapses via the template's `treeNodeToggle`. No-op when already collapsed. */
  async collapse(): Promise<void> {
    if (!(await this.isExpanded())) return;
    await (await this.#toggle()).click();
  }

  /** Plain row click — emits `activated`, never mutates selection (Gmail semantics). */
  async activate(): Promise<void> {
    await (await this.host()).click();
  }

  /** Toggles selection via the template's `treeNodeCheckbox` (cascade rules apply). */
  async toggleSelection(): Promise<void> {
    const checkbox = await this.locatorForOptional('[treeNodeCheckbox]')();
    if (!checkbox) {
      throw new Error(
        'angular-tree harness: toggleSelection needs a [treeNodeCheckbox] element in the node ' +
          'template — the tree ships no checkbox UI (see docs/THEMING.md).',
      );
    }
    await checkbox.click();
  }

  async focus(): Promise<void> {
    await (await this.host()).focus();
  }

  /** Internal (`_` per STYLE.md): `TreeHarness.dragTo` drives the pointer from outside. */
  async _dispatchMouse(type: string, point: { x: number; y: number }): Promise<void> {
    await (await this.host()).dispatchEvent(type, mouseEventData(point));
  }

  /** Internal: row rect for drop-point math (all zeros in layoutless jsdom). */
  async _rect(): Promise<ElementDimensions> {
    return (await this.host()).getDimensions();
  }

  /** Internal: resolved row height — the tree's fixed `itemSize`. */
  async _height(): Promise<number> {
    return parseFloat(await (await this.host()).getCssValue('height'));
  }

  #toggle(): Promise<TestElement> {
    return this.locatorForOptional('[treeNodeToggle]')().then((toggle) => {
      if (!toggle) {
        throw new Error(
          'angular-tree harness: expand/collapse needs a [treeNodeToggle] element in the node ' +
            'template — the tree ships no toggle UI. Alternative: drive tree.expand() directly.',
        );
      }
      return toggle;
    });
  }
}

/**
 * Harness for `<angular-tree>` (`@angular/cdk/testing`) — consumers test
 * expansion, selection and drag & drop without knowing the tree's DOM
 * (ROADMAP Phase 8; same DX as `MatTreeHarness`).
 */
export class TreeHarness extends ComponentHarness {
  static hostSelector = 'angular-tree';

  static with(options: TreeHarnessFilters = {}): HarnessPredicate<TreeHarness> {
    return new HarnessPredicate(TreeHarness, options);
  }

  readonly #viewport = this.locatorFor('.tree-viewport');

  /**
   * Rows that currently have DOM, in visual order. Under virtualization this
   * is the rendered window, not the whole visible set — scroll (or size the
   * host) to materialize more.
   */
  async getVisibleNodes(filters: TreeNodeHarnessFilters = {}): Promise<TreeNodeHarness[]> {
    return this.locatorForAll(TreeNodeHarness.with(filters))();
  }

  /** Convenience for order assertions: `getVisibleNodes()` mapped to text. */
  async getVisibleTexts(): Promise<string[]> {
    const nodes = await this.getVisibleNodes();
    return parallel(() => nodes.map((node) => node.getText()));
  }

  /** The first rendered row matching `filters`; throws when none does. */
  async getNode(filters: TreeNodeHarnessFilters): Promise<TreeNodeHarness> {
    return this.locatorFor(TreeNodeHarness.with(filters))();
  }

  async expandNode(filters: TreeNodeHarnessFilters): Promise<void> {
    await (await this.getNode(filters)).expand();
  }

  async collapseNode(filters: TreeNodeHarnessFilters): Promise<void> {
    await (await this.getNode(filters)).collapse();
  }

  /**
   * Drags `source` onto `target` with a full pointer sequence and releases in
   * the requested zone — ends in a `moved` intent exactly like a user drag
   * (guards, `disableDrop`, multi-drag pruning all apply).
   */
  async dragTo(
    source: TreeNodeHarnessFilters,
    target: TreeNodeHarnessFilters,
    zone: TreeDropZone = 'inside',
  ): Promise<void> {
    const sourceNode = await this.getNode(source);
    const from = await this.#dropPoint(sourceNode, 'inside');
    const to = await this.#dropPoint(await this.getNode(target), zone);

    // CDK registers its document listeners on mousedown, and the source row
    // leaves the DOM once the sequence starts (placeholder swap) — so the
    // pickup happens on the row, everything after targets the viewport
    // (document capture listeners see events on any attached element).
    await sourceNode._dispatchMouse('mousedown', from);
    // > 5px: crosses CDK's drag-start threshold; targeting happens on the next move.
    await sourceNode._dispatchMouse('mousemove', { x: from.x, y: from.y + 8 });

    const viewport = await this.#viewport();
    await viewport.dispatchEvent('mousemove', mouseEventData(to));
    await viewport.dispatchEvent('mouseup', mouseEventData(to));
  }

  /**
   * Pointer position for a zone on a row. Prefers the row's real rect; in
   * layoutless environments (jsdom rects are all zeros) it reconstructs the
   * position with the same arithmetic the tree itself uses (viewport top +
   * index × itemSize), assuming scroll offset 0 — which layoutless
   * environments cannot scroll away from anyway.
   */
  async #dropPoint(
    node: TreeNodeHarness,
    zone: TreeDropZone,
  ): Promise<{ x: number; y: number }> {
    const rect = await node._rect();
    if (rect.height > 0) {
      return { x: rect.left + 8, y: rect.top + rect.height * ZONE_RATIO[zone] };
    }

    const viewportRect = await (await this.#viewport()).getDimensions();
    const rows = await this.getVisibleNodes();
    const keys = await parallel(() => rows.map((row) => row.getKey()));
    const index = keys.indexOf(await node.getKey());
    const itemSize = (await node._height()) || 32;
    return {
      x: viewportRect.left + 8,
      y: viewportRect.top + (index + ZONE_RATIO[zone]) * itemSize,
    };
  }
}
