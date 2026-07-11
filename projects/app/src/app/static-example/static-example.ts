import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { AngularTree, TreeNodeDef, TreeNodeToggle } from '@h-k-dev/angular-tree';

import {
  containerIds,
  DESIGN_ICONS,
  DesignNode,
  FIGMA_LAYERS,
  FRAMER_LAYERS,
} from './design-data';

/**
 * The Static example: two design-tool layer panels (Figma-style and
 * Framer-style) over constant data — no fetching, no mutation, no context
 * menu. What it showcases: `clickAction: 'select'` (layer panels select on
 * click, activate on double-click), compact rows, indent guides, and the
 * `--tree-*` token theming that turns the same component into two different
 * tools (see the panel classes in the SCSS).
 */
@Component({
  selector: 'app-static-example',
  imports: [MatIconModule, AngularTree, TreeNodeDef, TreeNodeToggle],
  templateUrl: './static-example.html',
  styleUrl: './static-example.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class StaticExample {
  readonly figma = FIGMA_LAYERS;
  readonly framer = FRAMER_LAYERS;

  /** Layer panels open fully expanded — tool convention. */
  readonly figmaExpanded = containerIds(FIGMA_LAYERS);
  readonly framerExpanded = containerIds(FRAMER_LAYERS);

  /** Widened for the untyped fallback def (`node.kind` is `any` there). */
  readonly icons: Record<string, string> = DESIGN_ICONS;

  children = (node: DesignNode) => node.children;
  key = (node: DesignNode) => node.id;
  nodeName = (node: DesignNode) => node.name;
}
