import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ImageUrlInputDirective } from '../../directives/image-url-input.directive';
import { downscaleToDataUri } from '../../utils/image-downscale.util';

/**
 * One "image link" input. It behaves like a normal text field when you paste a URL, but when you
 * paste an actual image — which ImageUrlInputDirective inlines as a long `data:image/...` URI — it
 * collapses to a small "Pasted image · N KB · Remove" chip, so the field never shows a wall of
 * base64 (and you never accidentally copy one out).
 */
@Component({
  selector: 'app-image-url-field',
  standalone: true,
  imports: [ReactiveFormsModule, ImageUrlInputDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isInlineImage()) {
      <div class="input-field !flex items-center justify-between gap-2 text-sm">
        <span class="flex items-center gap-1.5 text-gray-500 min-w-0">
          <span class="material-icons text-[18px]">image</span>
          <span class="truncate">{{ 'IMAGE_FIELD.ATTACHED_IMAGE' | translate: { size: sizeLabel() } }}</span>
        </span>
        <button type="button" class="text-accent-red font-semibold shrink-0 min-h-0" (click)="clear()">{{ 'COMMON.REMOVE' | translate }}</button>
      </div>
    } @else {
      <div class="flex items-center gap-2">
        <input
          class="input-field flex-1 min-w-0"
          appImageUrlInput
          [maxEdge]="maxEdge"
          [maxBytes]="maxBytes"
          [formControl]="control"
          inputmode="url"
          [placeholder]="placeholder"
          (input)="changed.emit()"
        />
        <button
          type="button"
          class="w-11 h-11 shrink-0 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 active:bg-gray-100 disabled:opacity-50"
          [disabled]="uploading()"
          (click)="fileInput.click()"
          [attr.aria-label]="'IMAGE_FIELD.UPLOAD' | translate"
        >
          <span class="material-icons text-[20px]">{{ uploading() ? 'hourglass_top' : 'upload' }}</span>
        </button>
        <input #fileInput type="file" accept="image/*" hidden (change)="onFileSelected($event)" />
      </div>
      @if (uploadError()) {
        <p class="text-xs text-red-500 mt-1">{{ uploadError() }}</p>
      }
    }
  `,
})
export class ImageUrlFieldComponent {
  private destroyRef = inject(DestroyRef);
  private translate = inject(TranslateService);
  private value = signal('');
  uploading = signal(false);
  uploadError = signal('');

  private _control!: FormControl<string>;
  @Input({ required: true })
  set control(c: FormControl<string>) {
    this._control = c;
    this.value.set(c.value ?? '');
    c.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => this.value.set(v ?? ''));
  }
  get control(): FormControl<string> {
    return this._control;
  }

  @Input() placeholder = 'Paste a link — or paste a copied image';
  /** Raise these for a field displaying its image much larger than a small logo/avatar (e.g. a
   *  full-width banner) — the defaults look visibly blurry stretched across something that wide. */
  @Input() maxEdge?: number;
  @Input() maxBytes?: number;
  @Output() changed = new EventEmitter<void>();

  isInlineImage = computed(() => /^data:image\//i.test(this.value()));
  sizeLabel = computed(() => {
    const bytes = Math.round(this.value().length * 0.75); // base64 → bytes
    return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
  });

  clear(): void {
    this._control.setValue('');
    this.changed.emit();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again later
    if (!file) return;

    this.uploadError.set('');
    this.uploading.set(true);
    try {
      this._control.setValue(await downscaleToDataUri(file, { maxEdge: this.maxEdge, maxBytes: this.maxBytes }));
      this.changed.emit();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.uploadError.set(`${this.translate.instant('IMAGE_FIELD.UPLOAD_FAILED')} (${detail})`);
    } finally {
      this.uploading.set(false);
    }
  }
}
