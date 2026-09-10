import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ManagerImageService } from './manager-image.service';
import { ImageUrlFieldComponent } from '../../shared/components/image-url-field/image-url-field.component';
import { IMAGE_SRC_PATTERN, isImageSrc } from '../../shared/utils/image-url.util';

export interface ManagerImageDialogData {
  manager: string;
  current?: string;
}

/** Set / clear a manager's Ranking portrait (external image URL — Spark plan, no upload). */
@Component({
  selector: 'app-manager-image-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, ImageUrlFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold truncate px-2">{{ data.manager }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="save()">
          {{ isSaving() ? 'Saving…' : 'Save' }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2">
          <div class="w-40 h-40 rounded-2xl bg-surface-muted flex items-center justify-center overflow-hidden">
            @if (preview()) {
              <img [src]="preview()" alt="Portrait" class="w-full h-full object-cover" (error)="imgError.set(true)" />
            } @else {
              <span class="material-icons text-5xl text-gray-300">account_circle</span>
            }
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Portrait image <span class="text-gray-400">(leave empty to remove)</span></span>
          <app-image-url-field [control]="form.controls.imageUrl" (changed)="imgError.set(false)" />
          @if (form.controls.imageUrl.invalid && form.controls.imageUrl.value) {
            <span class="text-xs text-red-500">Paste an image link (http/https) or a copied image.</span>
          } @else if (imgError() && form.controls.imageUrl.value) {
            <span class="text-xs text-red-500">That image couldn't be loaded — check the link.</span>
          }
        </label>
      </form>
    </div>
  `,
})
export class ManagerImageFormComponent {
  private fb = inject(FormBuilder);
  private service = inject(ManagerImageService);

  isSaving = signal(false);
  imgError = signal(false);

  form = this.fb.nonNullable.group({
    imageUrl: [this.data.current ?? '', Validators.pattern(IMAGE_SRC_PATTERN)],
  });

  private value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  preview = computed(() => {
    const url = (this.value()?.imageUrl ?? '').trim();
    return isImageSrc(url) && !this.imgError() ? url : null;
  });

  constructor(
    public dialogRef: MatDialogRef<ManagerImageFormComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: ManagerImageDialogData
  ) {}

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const url = this.form.getRawValue().imageUrl.trim();
      if (url) {
        await this.service.set(this.data.manager, url);
      } else {
        await this.service.remove(this.data.manager);
      }
      this.dialogRef.close(true);
    } finally {
      this.isSaving.set(false);
    }
  }
}
