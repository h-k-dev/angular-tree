import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/**
 * Confirm-before-apply dialog for the delete intent (docs/RECIPES.md).
 * Closes with `true` to confirm — the caller applies the mutation only then;
 * dismissing means nothing happens, because nothing was ever applied.
 */
@Component({
  selector: 'app-confirm-delete',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './confirm-delete.html',
  styleUrl: './confirm-delete.scss',
})
export class ConfirmDelete {
  protected readonly data = inject<{ count: number }>(MAT_DIALOG_DATA);
}
