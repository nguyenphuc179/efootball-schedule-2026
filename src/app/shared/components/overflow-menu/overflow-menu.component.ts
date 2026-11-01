import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';

/**
 * "⋮" button + a small dropdown holding the projected items. Used to tuck rarely-used and
 * destructive actions (reset, delete) away from the everyday ones, so they can't be hit by a
 * stray tap. Any click inside the panel closes it.
 *
 * Projected items should use the `overflow-menu-item` class (see styles.scss).
 */
@Component({
  selector: 'app-overflow-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        type="button"
        class="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
        [attr.aria-label]="label()"
        [attr.aria-expanded]="open()"
        [title]="label()"
        (click)="open.set(!open())"
      >
        <span class="material-icons text-[20px]">more_vert</span>
      </button>
      @if (open()) {
        <div
          class="absolute mt-1 min-w-48 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 text-sm"
          [class.right-0]="align() === 'right'"
          [class.left-0]="align() === 'left'"
          (click)="open.set(false)"
        >
          <ng-content />
        </div>
      }
    </div>
  `,
})
export class OverflowMenuComponent {
  label = input('');
  /** Which edge of the button the panel lines up with — 'left' when the button sits near the
   *  screen's left edge, so the panel doesn't run off it. */
  align = input<'left' | 'right'>('right');
  open = signal(false);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  closeOnEsc(): void {
    this.open.set(false);
  }
}
