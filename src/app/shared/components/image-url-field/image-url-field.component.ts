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
import { ImageUrlInputDirective } from '../../directives/image-url-input.directive';

/**
 * One "image link" input. It behaves like a normal text field when you paste a URL, but when you
 * paste an actual image — which ImageUrlInputDirective inlines as a long `data:image/...` URI — it
 * collapses to a small "Pasted image · N KB · Remove" chip, so the field never shows a wall of
 * base64 (and you never accidentally copy one out).
 */
@Component({
  selector: 'app-image-url-field',
  standalone: true,
  imports: [ReactiveFormsModule, ImageUrlInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isInlineImage()) {
      <div class="input-field !flex items-center justify-between gap-2 text-sm">
        <span class="flex items-center gap-1.5 text-gray-500 min-w-0">
          <span class="material-icons text-[18px]">image</span>
          <span class="truncate">Pasted image · {{ sizeLabel() }}</span>
        </span>
        <button type="button" class="text-accent-red font-semibold shrink-0 min-h-0" (click)="clear()">Remove</button>
      </div>
    } @else {
      <input
        class="input-field"
        appImageUrlInput
        [formControl]="control"
        inputmode="url"
        [placeholder]="placeholder"
        (input)="changed.emit()"
      />
    }
  `,
})
export class ImageUrlFieldComponent {
  private destroyRef = inject(DestroyRef);
  private value = signal('');

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
}
