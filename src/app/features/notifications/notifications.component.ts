import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { NotificationService } from './notification.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { AppNotification, NotificationType } from '../../models/notification.model';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { timeAgoKey } from '../../shared/utils/time-ago.util';

const ICONS: Record<NotificationType, string> = {
  tournament_created: 'emoji_events',
  match_reminder: 'schedule',
  result_updated: 'sports_soccer',
  standings_updated: 'leaderboard',
  tournament_started: 'flag',
  tournament_finished: 'military_tech',
};

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <h1 class="text-xl font-extrabold mb-4">{{ 'NAV.NOTIFICATIONS' | translate }}</h1>

      @if (notifications().length === 0) {
        <app-empty-state icon="notifications_none" [title]="'NOTIFICATIONS.EMPTY_TITLE' | translate" [subtitle]="'NOTIFICATIONS.EMPTY_SUBTITLE' | translate" />
      } @else {
        <div class="flex flex-col gap-2">
          @for (n of notifications(); track n.id) {
            <a
              [routerLink]="n.tournamentId ? ['/tournaments', n.tournamentId] : ['/']"
              class="card flex gap-3 !py-3 no-underline text-inherit"
              [class.bg-primary-50]="!n.read"
              (click)="markRead(n)"
            >
              <span class="material-icons text-primary-500 mt-0.5">{{ icons[n.type] }}</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm">{{ n.title }}</div>
                <div class="text-xs text-gray-500">{{ n.body }}</div>
                <div class="text-[11px] text-gray-400 mt-1">{{ timeAgo(n.createdDate) }}</div>
              </div>
              @if (!n.read) {
                <span class="w-2 h-2 rounded-full bg-primary-500 mt-1.5 shrink-0"></span>
              }
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationsComponent {
  private notificationService = inject(NotificationService);
  private translate = inject(TranslateService);
  icons = ICONS;

  notifications = toSignal(this.notificationService.streamForCurrentUser(), {
    initialValue: [] as AppNotification[],
  });

  markRead(n: AppNotification): void {
    if (!n.read) this.notificationService.markRead(n.id);
  }

  timeAgo(ms: number): string {
    this.translate.currentLang();
    const { key, params } = timeAgoKey(ms);
    return this.translate.instant(key, params);
  }
}
