/**
 * Static design-tool layer trees — pure constants, no fetching, no mutation.
 * Two shapes of the same idea: a Figma-style page/frame/component hierarchy
 * and a Framer-style page/breakpoint/stack hierarchy.
 */

export type DesignKind = 'page' | 'frame' | 'group' | 'stack' | 'component' | 'instance' | 'text' | 'vector' | 'image';

export interface DesignNode {
  readonly id: string;
  readonly name: string;
  readonly kind: DesignKind;
  readonly children?: readonly DesignNode[];
}

/** Material Symbols stand-ins for the tools' layer glyphs. */
export const DESIGN_ICONS: Record<DesignKind, string> = {
  page: 'web_asset',
  frame: 'tag',
  group: 'select',
  stack: 'view_agenda',
  component: 'diamond',
  instance: 'deployed_code',
  text: 'text_fields',
  vector: 'polyline',
  image: 'image',
};

/** Every node with children — the panels open fully expanded, tool-style. */
export function containerIds(nodes: readonly DesignNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly DesignNode[]) => {
    for (const node of list) {
      if (node.children?.length) {
        ids.push(node.id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

export const FIGMA_LAYERS: readonly DesignNode[] = [
  {
    id: 'f-page-1',
    name: 'Page 1',
    kind: 'page',
    children: [
      {
        id: 'f-hero',
        name: 'Hero',
        kind: 'frame',
        children: [
          {
            id: 'f-nav',
            name: 'Nav',
            kind: 'frame',
            children: [
              { id: 'f-logo', name: 'Logo', kind: 'vector' },
              {
                id: 'f-links',
                name: 'Links',
                kind: 'group',
                children: [
                  { id: 'f-link-home', name: 'Home', kind: 'text' },
                  { id: 'f-link-pricing', name: 'Pricing', kind: 'text' },
                  { id: 'f-link-about', name: 'About', kind: 'text' },
                ],
              },
              { id: 'f-cta', name: 'Get started', kind: 'instance' },
            ],
          },
          { id: 'f-headline', name: 'Headline', kind: 'text' },
          { id: 'f-subcopy', name: 'Subcopy', kind: 'text' },
          { id: 'f-illustration', name: 'Illustration', kind: 'image' },
        ],
      },
      {
        id: 'f-features',
        name: 'Features',
        kind: 'frame',
        children: [
          { id: 'f-card-1', name: 'Card', kind: 'instance' },
          { id: 'f-card-2', name: 'Card', kind: 'instance' },
          { id: 'f-card-3', name: 'Card', kind: 'instance' },
        ],
      },
      {
        id: 'f-footer',
        name: 'Footer',
        kind: 'frame',
        children: [
          {
            id: 'f-social',
            name: 'Social',
            kind: 'group',
            children: [
              { id: 'f-github', name: 'GitHub', kind: 'vector' },
              { id: 'f-x', name: 'X', kind: 'vector' },
            ],
          },
          { id: 'f-legal', name: 'Legal', kind: 'text' },
        ],
      },
    ],
  },
  {
    id: 'f-components',
    name: 'Components',
    kind: 'page',
    children: [
      {
        id: 'f-button',
        name: 'Button',
        kind: 'component',
        children: [{ id: 'f-button-label', name: 'Label', kind: 'text' }],
      },
      {
        id: 'f-card',
        name: 'Card',
        kind: 'component',
        children: [
          { id: 'f-card-cover', name: 'Cover', kind: 'image' },
          { id: 'f-card-title', name: 'Title', kind: 'text' },
          { id: 'f-card-body', name: 'Body', kind: 'text' },
        ],
      },
    ],
  },
];

export const FRAMER_LAYERS: readonly DesignNode[] = [
  {
    id: 'fr-home',
    name: 'Home',
    kind: 'page',
    children: [
      {
        id: 'fr-desktop',
        name: 'Desktop',
        kind: 'frame',
        children: [
          {
            id: 'fr-navigation',
            name: 'Navigation',
            kind: 'stack',
            children: [
              { id: 'fr-nav-logo', name: 'Logo', kind: 'image' },
              {
                id: 'fr-menu',
                name: 'Menu',
                kind: 'stack',
                children: [
                  { id: 'fr-menu-product', name: 'Product', kind: 'text' },
                  { id: 'fr-menu-pricing', name: 'Pricing', kind: 'text' },
                  { id: 'fr-menu-blog', name: 'Blog', kind: 'text' },
                ],
              },
              { id: 'fr-nav-cta', name: 'Sign up', kind: 'instance' },
            ],
          },
          {
            id: 'fr-hero',
            name: 'Hero Stack',
            kind: 'stack',
            children: [
              { id: 'fr-title', name: 'Title', kind: 'text' },
              { id: 'fr-subtitle', name: 'Subtitle', kind: 'text' },
              { id: 'fr-hero-cta', name: 'Get started', kind: 'instance' },
              { id: 'fr-preview', name: 'Preview', kind: 'image' },
            ],
          },
          {
            id: 'fr-footer',
            name: 'Footer',
            kind: 'stack',
            children: [
              { id: 'fr-footer-links', name: 'Links', kind: 'stack' },
              { id: 'fr-copyright', name: 'Copyright', kind: 'text' },
            ],
          },
        ],
      },
      { id: 'fr-tablet', name: 'Tablet', kind: 'frame' },
      { id: 'fr-phone', name: 'Phone', kind: 'frame' },
    ],
  },
  {
    id: 'fr-design-system',
    name: 'Design System',
    kind: 'page',
    children: [
      { id: 'fr-ds-button', name: 'Button', kind: 'component' },
      { id: 'fr-ds-navigation', name: 'Navigation', kind: 'component' },
    ],
  },
];
