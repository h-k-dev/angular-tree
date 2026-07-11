import { Pipe, PipeTransform } from '@angular/core';

/**
 * `1_234_567 → "1.2 MB"`, `45_000 → "45 kB"`. A pure pipe is the idiomatic
 * per-row derivation: memoized per binding, re-evaluated only when the input
 * changes — the template-side equivalent of a `computed()` (STYLE.md).
 */
@Pipe({
  name: 'fileSize',
})
export class FileSize implements PipeTransform {
  transform(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} kB`;
    return `${bytes} B`;
  }
}
