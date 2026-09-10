import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Match } from '../../../models/match.model';

/**
 * GiveTour-style single-line match row: (group badge + round, when grouped) · home name → crest ·
 * score · crest → away name · status badge. The whole row links to result entry when `showResultLink`
 * is set. Used by the Group Stage and Final Stage tabs; the stacked `match-card` is used elsewhere.
 */
@Component({
  selector: 'app-match-row',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="showResultLink() ? ['/matches', match().id, 'result'] : null"
      class="flex items-center gap-2 sm:gap-3 bg-white rounded-lg border border-gray-100 px-2.5 sm:px-3 py-2.5 no-underline text-inherit"
    >
      @if (match().groupName) {
        <div class="flex items-center gap-1.5 shrink-0 w-12 sm:w-24">
          <span class="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">
            {{ groupLetter() }}
          </span>
          <span class="text-[11px] text-gray-400 truncate hidden sm:inline">{{ roundLabel() }}</span>
        </div>
      }

      <div class="flex-1 flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
        <span class="text-sm truncate" [class.font-bold]="winner() === 'home'">{{ sideLabel('home') }}</span>
        @if (homeLogo()) {
          <img [src]="homeLogo()" alt="" class="w-5 h-5 rounded object-cover shrink-0" referrerpolicy="no-referrer" (error)="homeBad.set(true)" />
        } @else {
          <span class="w-5 h-5 rounded bg-gray-100 flex items-center justify-center shrink-0">
            <span class="material-icons text-[12px] text-gray-400">shield</span>
          </span>
        }
      </div>

      <span class="shrink-0 w-12 text-center text-sm font-extrabold text-primary-700 tabular-nums">{{ scoreText() }}</span>

      <div class="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0">
        @if (awayLogo()) {
          <img [src]="awayLogo()" alt="" class="w-5 h-5 rounded object-cover shrink-0" referrerpolicy="no-referrer" (error)="awayBad.set(true)" />
        } @else {
          <span class="w-5 h-5 rounded bg-gray-100 flex items-center justify-center shrink-0">
            <span class="material-icons text-[12px] text-gray-400">shield</span>
          </span>
        }
        <span class="text-sm truncate" [class.font-bold]="winner() === 'away'">{{ sideLabel('away') }}</span>
      </div>

      <span class="badge shrink-0 !text-[10px]" [class]="statusClass()">{{ statusLabel() }}</span>
    </a>
  `,
})
export class MatchRowComponent {
  readonly match = input.required<Match>();
  readonly showResultLink = input(false);
  /** teamId -> manager name; when present the label reads "Club_Manager". */
  readonly managers = input<Record<string, string>>({});

  homeBad = signal(false);
  awayBad = signal(false);

  /** "Club" or "Club_Manager" for the given side (placeholder slots stay "W/L …"). */
  sideLabel(side: 'home' | 'away'): string {
    const m = this.match();
    const name = side === 'home' ? m.homeTeamName : m.awayTeamName;
    if (!name) return 'TBD';
    if (/^(?:Winner|Loser) /.test(name)) {
      return name.replace(/^Winner /, 'W ').replace(/^Loser /, 'L ');
    }
    const manager = this.managers()[side === 'home' ? m.homeTeamId : m.awayTeamId];
    return manager ? `${name}_${manager}` : name;
  }

  groupLetter = computed(() => (this.match().groupName ?? '').replace(/^group\s+/i, '').trim() || '?');

  roundLabel = computed(() => {
    const round = this.match().round;
    const i = round.lastIndexOf(' - ');
    return i >= 0 ? round.slice(i + 3) : round;
  });

  private resolved = computed(() => !!this.match().homeTeamId && !!this.match().awayTeamId);

  private played = computed(() => {
    const m = this.match();
    return m.homeScore != null && m.awayScore != null && (m.status === 'completed' || m.status === 'live');
  });

  scoreText = computed(() => {
    if (this.played()) return `${this.match().homeScore} - ${this.match().awayScore}`;
    return this.resolved() ? this.match().matchTime || 'vs' : 'vs';
  });

  winner = computed<'home' | 'away' | null>(() => {
    if (!this.played()) return null;
    const m = this.match();
    if ((m.homeScore ?? 0) > (m.awayScore ?? 0)) return 'home';
    if ((m.awayScore ?? 0) > (m.homeScore ?? 0)) return 'away';
    return null;
  });

  homeLogo = computed(() => (this.homeBad() ? null : this.match().homeTeamLogo || null));
  awayLogo = computed(() => (this.awayBad() ? null : this.match().awayTeamLogo || null));

  statusLabel(): string {
    switch (this.match().status) {
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

  statusClass(): string {
    switch (this.match().status) {
      case 'completed':
        return 'bg-primary-50 text-primary-700';
      case 'live':
        return 'bg-red-50 text-accent-red animate-pulse';
      case 'postponed':
        return 'bg-amber-50 text-accent-amber';
      default:
        return 'bg-gray-100 text-gray-500';
    }
  }
}
