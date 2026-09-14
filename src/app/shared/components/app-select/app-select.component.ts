import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, EventEmitter, HostListener, Input, Output, booleanAttribute, computed, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';

export interface AppSelectOption {
  value: string;
  label: string;
}

/**
 * Custom-styled dropdown replacing the browser's native `<select>` (which renders with OS chrome
 * that clashes with the app's own dark-themed popups — see the account menu / activity log filter
 * panel this borrows its look from). Two ways to wire it up, same split as `ImageUrlFieldComponent`:
 * - Reactive Forms: `[control]="form.controls.managerUid"` (a `FormControl<string>`).
 * - Plain signals/state: `[value]="foo()"` + `(valueChange)="foo.set($event)"`.
 * Values are always strings, same as a native select's `.value` — callers convert (e.g. `+$event`
 * for a numeric control) exactly like they did with `$any($event.target).value` before.
 */
@Component({
  selector: 'app-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative" #wrap>
      <button
        type="button"
        [class]="triggerClass()"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="ariaLabel() || null"
        (click)="toggle()"
      >
        <span class="truncate" [class.text-gray-400]="!selectedLabel()">{{ selectedLabel() || placeholder() }}</span>
        <span class="material-icons text-[18px] text-gray-400 transition-transform shrink-0" [class.rotate-180]="open()">expand_more</span>
      </button>

      @if (open()) {
        <div [class]="panelClass()">
          @for (opt of options(); track opt.value) {
            <button
              type="button"
              class="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
              [class.bg-primary-50]="opt.value === currentValue()"
              [class.text-primary-700]="opt.value === currentValue()"
              [class.font-semibold]="opt.value === currentValue()"
              (click)="select(opt.value)"
            >
              <span class="truncate">{{ opt.label }}</span>
              @if (opt.value === currentValue()) {
                <span class="material-icons text-[16px] shrink-0 ml-2">check</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class AppSelectComponent {
  private destroyRef = inject(DestroyRef);

  options = input.required<AppSelectOption[]>();
  placeholder = input('');
  ariaLabel = input('');
  /** Smaller inline variant (filter bars etc.) — sizes to content instead of filling the row. */
  compact = input(false, { transform: booleanAttribute });
  disabled = input(false, { transform: booleanAttribute });

  private _value = signal('');
  currentValue = this._value.asReadonly();

  private _control?: FormControl<string>;
  /** Reactive Forms mode — mirrors `ImageUrlFieldComponent.control`. */
  @Input()
  set control(c: FormControl<string> | undefined) {
    this._control = c;
    if (c) {
      this._value.set(c.value ?? '');
      c.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => this._value.set(v ?? ''));
    }
  }
  get control(): FormControl<string> | undefined {
    return this._control;
  }

  /** Plain mode — ignored once `[control]` is set. */
  @Input()
  set value(v: string) {
    if (!this._control) this._value.set(v ?? '');
  }
  get value(): string {
    return this._value();
  }

  @Output() valueChange = new EventEmitter<string>();

  open = signal(false);
  private wrap = viewChild<ElementRef<HTMLElement>>('wrap');

  selectedLabel = computed(() => this.options().find((o) => o.value === this._value())?.label ?? '');

  triggerClass = computed(() =>
    this.compact()
      ? 'input-field flex items-center gap-2 text-left !h-9 !min-h-0 !py-1.5 !px-2.5 !w-auto text-sm disabled:opacity-50'
      : 'input-field flex items-center justify-between gap-2 text-left w-full disabled:opacity-50'
  );

  panelClass = computed(() =>
    this.compact()
      ? 'absolute left-0 z-30 mt-1 min-w-full w-max max-w-[90vw] max-h-72 overflow-y-auto bg-white rounded-xl shadow-lg border border-gray-100 py-1'
      : 'absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto bg-white rounded-xl shadow-lg border border-gray-100 py-1'
  );

  toggle(): void {
    if (this.disabled()) return;
    this.open.update((v) => !v);
  }

  select(v: string): void {
    this._value.set(v);
    if (this._control) this._control.setValue(v);
    this.valueChange.emit(v);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.wrap()?.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}
