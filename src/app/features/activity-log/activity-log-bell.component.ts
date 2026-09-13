import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { ActivityLogService } from '../../core/services/activity-log.service';

/**
 * Bell icon + unseen-count badge, linking to "/history", for any signed-in member — an admin's
 * badge counts unseen entries across the whole audit trail, anyone else's counts just their own
 * personal feed (see `ActivityLogService.streamUnseenCount()`). Used identically in both
 * `header.component.ts` (mobile) and `app.component.ts` (desktop top bar) so the live
 * `streamUnseenCount()` subscription exists exactly once per rendered spot instead of being
 * copy-pasted with its own signal in each header.
 */
@Component({
  selector: 'app-activity-log-bell',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isSignedIn()) {
      <a
        routerLink="/history"
        class="relative flex items-center justify-center rounded-full active:bg-gray-100 hover:bg-gray-100"
        [class]="size()"
        [attr.aria-label]="'NAV.HISTORY' | translate"
      >
        <span class="material-icons text-gray-600">notifications</span>
        @if (unseenCount() > 0) {
          <span
            class="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-red text-white text-[10px] font-bold flex items-center justify-center leading-none"
          >
            {{ unseenCount() >= 100 ? '99+' : unseenCount() }}
          </span>
        }
      </a>
    }
  `,
})
export class ActivityLogBellComponent {
  auth = inject(AuthService);
  private activityLogService = inject(ActivityLogService);

  /** Tailwind size classes for the tappable circle — mobile header uses a slightly larger touch
   *  target (w-11 h-11) than the desktop top bar (w-10 h-10). */
  size = input('w-11 h-11');

  unseenCount = toSignal(this.activityLogService.streamUnseenCount(), { initialValue: 0 });
}
