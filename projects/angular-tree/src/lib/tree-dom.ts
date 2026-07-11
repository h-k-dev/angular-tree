/**
 * Row-DOM lookups shared by the engines (focus, menu host). Pure functions —
 * the host element is a parameter, never ambient state.
 */

/** Attribute-value escape for `[data-node-id="…"]` queries — CSS.escape is absent in jsdom. */
export function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The row's rendered DOM element, or `null` outside the rendered range. */
export function rowElement(host: HTMLElement, key: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-node-id="${escapeAttributeValue(key)}"]`);
}
