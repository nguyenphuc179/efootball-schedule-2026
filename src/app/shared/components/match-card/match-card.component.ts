import { ChangeDetectionStrategy, Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Match } from '../../../models/match.model';

/** Flashscore-style compact match card: used in Matches list, Home feed, Fixtures/Results tabs. */
@Component({
  selector: 'app-match-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="showResultLink ? ['/matches', match.id, 'result'] : null"
      class="card flex items-center gap-3 !py-3 no-underline text-inherit"
    >
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between text-sm mb-1.5">
          <span class="font-medium truncate">{{ match.homeTeamName ?? 'TBD' }}</span>
          @if (isPlayed()) {
            <span class="font-bold w-6 text-center">{{ match.homeScore }}</span>
          }
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium truncate">{{ match.awayTeamName ?? 'TBD' }}</span>
          @if (isPlayed()) {
            <span class="font-bold w-6 text-center">{{ match.awayScore }}</span>
          }
        </div>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0 text-right">
        @if (!isPlayed()) {
          <span class="text-xs font-semibold text-gray-500">{{ match.matchTime }}</span>
          <span class="text-[11px] text-gray-400">{{ dateLabel() }}</span>
        }
        <span class="badge" [class]="statusClasses()">{{ statusLabel() }}</span>
      </div>
    </a>
  `,
})
export class MatchCardComponent {
  @Input({ required: true }) match!: Match;
  @Input() showResultLink = false;

  isPlayed = computed(() => this.match.status === 'completed' || this.match.status === 'live');

  dateLabel(): string {
    return new Date(this.match.matchDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  statusLabel(): string {
    switch (this.match.status) {
      case 'completed':
        return 'Completed';
      case 'live':
        return 'Live';
      case 'postponed':
        return 'Postponed';
      default:
        return 'Scheduled';
    }
  }

  statusClasses(): string {
    switch (this.match.status) {
      case 'completed':
        return 'bg-gray-100 text-gray-600';
      case 'live':
        return 'bg-red-50 text-accent-red animate-pulse';
      case 'postponed':
        return 'bg-amber-50 text-accent-amber';
      default:
        return 'bg-primary-50 text-primary-700';
    }
  }
}
