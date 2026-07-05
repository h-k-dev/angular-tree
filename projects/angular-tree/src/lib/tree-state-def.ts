import { Directive, inject, TemplateRef } from '@angular/core';

/**
 * Content for the tree's **empty state** — shown when there are zero visible
 * rows (no data, or search filtered everything out). The tree owns the slot;
 * the consumer projects the message. Absent by default → the tree renders
 * nothing (sensible blank default).
 *
 * The template lives in the consumer's component, so it already has their own
 * state in scope (e.g. a `search()` signal to say "no results for …" vs
 * "no items") — hence no template context.
 *
 * ```html
 * <ng-template treeEmptyDef>No documents yet.</ng-template>
 * ```
 */
@Directive({
  selector: 'ng-template[treeEmptyDef]',
})
export class TreeEmptyDef {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/**
 * Content for the tree's **root-loading state** — shown while the consumer's
 * `[loading]` input is `true` (the whole `dataSource` is being fetched; this
 * is distinct from a lazy *child* load, which drives per-row `isLoading`).
 * Takes precedence over the empty state. Absent by default → nothing.
 *
 * ```html
 * <ng-template treeLoadingDef><mat-spinner /></ng-template>
 * ```
 */
@Directive({
  selector: 'ng-template[treeLoadingDef]',
})
export class TreeLoadingDef {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
