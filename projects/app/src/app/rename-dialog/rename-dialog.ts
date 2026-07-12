import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Dialog-based rename — the counterpart to the tree's inline
 * `treeNodeEditInput` path. Opens prefilled with the current name and closes
 * with the new one, or `undefined` on cancel — the caller applies nothing
 * then, because nothing was ever applied (confirm-before-apply, like delete).
 */
@Component({
  selector: 'app-rename-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './rename-dialog.html',
  styleUrl: './rename-dialog.scss',
})
export class RenameDialog {
  readonly #ref = inject<MatDialogRef<RenameDialog, string>>(MatDialogRef);
  protected readonly data = inject<{ name: string }>(MAT_DIALOG_DATA);

  protected readonly name = signal(this.data.name);

  protected onInput(event: Event) {
    this.name.set((event.target as HTMLInputElement).value);
  }

  /** Select-all on focus, matching the inline editor's replace-by-typing affordance. */
  protected onFocus(event: FocusEvent) {
    (event.target as HTMLInputElement).select();
  }

  /** Form submit = Enter in the field or the Rename button; blank names stay disabled. */
  protected submit(event: Event) {
    event.preventDefault();
    const name = this.name().trim();
    if (name) this.#ref.close(name);
  }
}
