import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The API reference page: theming tokens + intent events, owned by the page
 * that renders them (not the app shell). Mirrors docs/THEMING.md § Tokens and
 * the intent outputs of `AngularTree`.
 */
@Component({
  selector: 'app-api-reference',
  templateUrl: './api-reference.html',
  styleUrl: './api-reference.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ApiReference {
  /** Mirrors docs/THEMING.md § Tokens. */
  readonly themingTokens = [
    {
      name: '--tree-row-height',
      system: null,
      fallback: '32px (this demo: 40px)',
      alters:
        'Read-only — the [itemSize] input republished on the host; root of the sizing chain',
    },
    {
      name: '--tree-bg',
      system: '--mat-sys-surface',
      fallback: '#ffffff',
      alters: 'Tree background, drag preview',
    },
    {
      name: '--tree-text',
      system: '--mat-sys-on-surface',
      fallback: '#1d1b20',
      alters: 'Row text',
    },
    {
      name: '--tree-font',
      system: '--mat-sys-body-medium',
      fallback: '400 0.875rem/1.25rem Roboto, sans-serif',
      alters: 'Typography (full font shorthand)',
    },
    {
      name: '--tree-node-hover',
      system: '--mat-sys-surface-container-highest',
      fallback: '#e6e6e6',
      alters: 'Row hover',
    },
    {
      name: '--tree-node-selected',
      system: '--mat-sys-secondary-container',
      fallback: '#e8def8',
      alters: 'Selected row ([data-selected])',
    },
    {
      name: '--tree-focus-ring',
      system: '--mat-sys-primary',
      fallback: '#6750a4',
      alters: ':focus-visible outline',
    },
    {
      name: '--tree-drop-indicator',
      system: '--mat-sys-primary',
      fallback: '#6750a4',
      alters: 'Drop line/box, count badge',
    },
    {
      name: '--tree-drag-shadow',
      system: '--mat-sys-level3',
      fallback: '0 2px 8px rgb(0 0 0 / 0.3)',
      alters: 'Drag preview elevation',
    },
    {
      name: '--tree-badge-text',
      system: '--mat-sys-on-primary',
      fallback: '#ffffff',
      alters: 'Multi-drag count badge text',
    },
    {
      name: '--tree-indent',
      system: null,
      fallback: '1.5rem',
      alters: 'Per-level indentation step; guide lines center at half of it',
    },
    {
      name: '--tree-guide',
      system: '--mat-sys-outline-variant',
      fallback: '#cac4d0',
      alters:
        'Indent guide lines ([indentGuides]); hover uses --tree-focus-ring',
    },
    {
      name: '--tree-menu-bg',
      system: '--mat-sys-surface-container',
      fallback: '#f3edf7',
      alters: 'Context-menu shell background (treeContextMenu)',
    },
    {
      name: '--tree-menu-radius',
      system: null,
      fallback: '8px',
      alters: 'Context-menu shell corner radius',
    },
    {
      name: '--tree-menu-shadow',
      system: '--mat-sys-level2',
      fallback: '0 2px 8px rgb(0 0 0 / 0.25)',
      alters: 'Context-menu shell elevation',
    },
    {
      name: '--tree-toggle-size',
      system: null,
      fallback: 'var(--tree-row-height)',
      alters:
        'Master control size: toggle + checkbox targets, thread-line column (via --tree-indent), leaf spacer base — must never exceed --tree-row-height',
    },
    {
      name: '--tree-toggle-spacing-factor',
      system: null,
      fallback: '0.5',
      alters: 'Leaf spacer = --tree-toggle-size × this factor',
    },
    {
      name: '--tree-checkbox-radius',
      system: null,
      fallback: '100vw (circle)',
      alters: 'Checkbox state-layer radius (consumer-template convention)',
    },
  ];

  /**
   * Every intent the tree emits (the controlled contract: tree emits, the
   * consumer applies, the tree re-renders).
   */
  readonly treeEvents = [
    {
      name: '(activated)',
      payload: 'T — your node',
      fires:
        'Plain row click (default) · double-click under clickAction="select" · Enter',
      job: 'Open / navigate. Never mutates selection (Gmail semantics)',
    },
    {
      name: '(moved)',
      payload:
        'MoveEvent<T> { dragIds, dragNodes, parentId (null = root), index, dropEffect }',
      fires: 'Drop completed — pointer drag or keyboard Ctrl/Cmd+X/C → V',
      job: 'Apply the move/copy to your data; index counts children with the dragged nodes still present',
    },
    {
      name: '(renamed)',
      payload: 'RenameEvent<T> { id, node, name }',
      fires: 'Inline edit committed (treeNodeEditInput Enter/blur)',
      job: 'Write the new name into your data',
    },
    {
      name: '(selectionChange)',
      payload: 'SelectEvent<T> { ids, nodes }',
      fires:
        'Any selection interaction: click modifiers, Space, Ctrl/Cmd+A, checkbox cascade, Escape / outside-click clear',
      job: 'Sync app state — or skip it and bind [(selectedKeys)] two-way',
    },
    {
      name: '(toggled)',
      payload: 'ToggleEvent<T> { id, node, expanded }',
      fires: 'Node expanded or collapsed',
      job: 'Optional: persist expansion (pair with expandedKeys() / defaultExpandedKeys)',
    },
    {
      name: '(childrenLoaded)',
      payload:
        "LoadChildrenEvent<T> { id, node, status: 'loaded' | 'error', error? }",
      fires: 'Async childrenAccessor resolved or failed',
      job: 'Surface errors — a retry button can call tree.retryChildren(node)',
    },
    {
      name: '(contextRequested)',
      payload: 'ContextRequestedEvent<T> { ids, node, position }',
      fires:
        'Right-click · Shift+F10 · ContextMenu key (after selection reconciliation)',
      job: 'Host an external menu (MatMenu, …) — not needed with the built-in treeContextMenu',
    },
  ];
}
