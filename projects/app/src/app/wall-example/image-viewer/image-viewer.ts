import { Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { artworkImage, WallAsset } from '../wall-data';

/**
 * The Wall's canvas: one artwork, big. The tree is the index; this is the page.
 *
 * Presentation trick worth knowing: the SAME image is painted twice — once
 * blown up and blurred as a backdrop, once `object-fit: contain` on top — so
 * any aspect ratio fills the stage without letterbox bars or cropping the work.
 * `imageId` keys a `@let`-free `src` computed, and the load state resets per
 * artwork so a slow fetch shows a spinner instead of the previous painting.
 */
@Component({
  selector: 'app-image-viewer',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './image-viewer.html',
  styleUrl: './image-viewer.scss',
})
export class ImageViewer {
  /** The artwork to show; `null` = the empty stage. */
  readonly artwork = input<WallAsset | null>(null);

  /** Full-bleed source. 843px is an AIC IIIF size that stays crisp yet light. */
  readonly src = computed(() => {
    const artwork = this.artwork();
    return artwork ? artworkImage(artwork.imageId, 843) : null;
  });

  /**
   * Which image id has finished decoding. Comparing against the CURRENT id
   * (rather than a boolean) is what makes this survive a fast switch: a stale
   * load event can't mark the new artwork as ready.
   */
  readonly #loaded = signal<string | null>(null);
  readonly isLoading = computed(() => {
    const artwork = this.artwork();
    return artwork != null && this.#loaded() !== artwork.imageId;
  });

  onLoad(): void {
    const artwork = this.artwork();
    if (artwork) this.#loaded.set(artwork.imageId);
  }
}
