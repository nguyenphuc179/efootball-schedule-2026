import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ToastService, ToastKind } from '../../../core/services/toast.service';

/** Renders `ToastService` messages at the top of the screen — mounted once in the app shell,
 *  outside the chrome, so it also shows on fullscreen routes like result entry. */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="pointer-events-auto w-full max-w-md flex items-start gap-2.5 rounded-xl px-3.5 py-3 shadow-xl text-sm font-medium text-white"
          [class]="bg(t.kind)"
          [attr.role]="t.kind === 'error' ? 'alert' : 'status'"
        >
          <span class="material-icons text-[20px] shrink-0">{{ icon(t.kind) }}</span>
          <span class="flex-1 min-w-0 pt-px">{{ t.message }}</span>
          <button
            type="button"
            class="shrink-0 -my-1 -mr-1 w-7 h-7 !min-h-0 flex items-center justify-center rounded-full opacity-80 hover:opacity-100"
            (click)="toasts.dismiss(t.id)"
            [attr.aria-label]="'COMMON.CLOSE' | translate"
          >
            <span class="material-icons text-[18px]">close</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  toasts = inject(ToastService);

  bg(kind: ToastKind): string {
    return kind === 'error' ? 'bg-accent-red' : kind === 'success' ? 'bg-primary-600' : 'bg-slate-700';
  }

  icon(kind: ToastKind): string {
    return kind === 'error' ? 'error_outline' : kind === 'success' ? 'check_circle' : 'info';
  }
}
