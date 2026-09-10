import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Match, matchScoreText, matchWinner } from '../../../models/match.model';
import { initialsAvatar } from '../../utils/avatar.util';
import { TeamAvatar } from '../../utils/team-avatar.util';

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
      } @else if (showRound() && roundLabel()) {
        <div class="flex items-center gap-1.5 shrink-0 w-9 sm:w-28">
          <span class="h-6 px-1.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">
            {{ roundBadge() }}
          </span>
          <span class="text-[11px] text-gray-400 truncate hidden sm:inline">{{ roundLabel() }}</span>
        </div>
      }

      <div class="flex-1 flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
        <span class="text-sm truncate" [class.font-bold]="winner() === 'home'">{{ sideLabel('home') }}</span>
        @if (homeAvatar().src; as src) {
          <img [src]="src" alt="" class="w-5 h-5 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" (error)="homeBad.set(true)" />
        } @else {
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
            [style.background-color]="homeAvatar().bg"
            [style.color]="homeAvatar().fg"
          >{{ homeAvatar().initials }}</span>
        }
      </div>

      <span class="shrink-0 min-w-[3rem] px-1 text-center text-sm font-extrabold text-primary-700 tabular-nums whitespace-nowrap">{{ scoreText() }}</span>

      <div class="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0">
        @if (awayAvatar().src; as src) {
          <img [src]="src" alt="" class="w-5 h-5 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" (error)="awayBad.set(true)" />
        } @else {
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
            [style.background-color]="awayAvatar().bg"
            [style.color]="awayAvatar().fg"
          >{{ awayAvatar().initials }}</span>
        }
        <span class="text-sm truncate" [class.font-bold]="winner() === 'away'">{{ sideLabel('away') }}</span>
      </div>

      <span class="badge shrink-0 !text-[10px] hidden sm:inline-flex" [class]="statusClass()">{{ statusLabel() }}</span>
    </a>
  `,
})
export class MatchRowComponent {
  readonly match = input.required<Match>();
  readonly showResultLink = input(false);
  /** Show the round label for a non-group (knockout) match. Off where the parent already
   *  headings each round (e.g. the Final Stage tab). */
  readonly showRound = input(true);
  /** teamId -> manager name; when present the label reads "Club_Manager". */
  readonly managers = input<Record<string, string>>({});
  /** teamId -> resolved avatar (logo / login photo / portrait / initials). Falls back to the
   *  match's denormalised crest, then initials from the team name, when a team isn't listed. */
  readonly avatars = input<Record<string, TeamAvatar>>({});

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
    if (i >= 0) return round.slice(i + 3); // "Group A - Round 1" -> "Round 1"
    // Knockout round: "Quarter Final 2" -> "Quarter-final #2", "Final" -> "Final".
    const base = round.replace(/ \d+$/, '');
    const num = /(\d+)$/.exec(round)?.[1];
    const name =
      base === 'Quarter Final'
        ? 'Quarter-final'
        : base === 'Semi Final'
          ? 'Semi-final'
          : base === 'Third Place'
            ? 'Third place'
            : base;
    return num && base !== 'Final' ? `${name} #${num}` : name;
  });

  /** Short chip shown on mobile where the full round label doesn't fit. */
  roundBadge = computed(() => {
    const r = this.match().round.toLowerCase();
    if (r.startsWith('quarter')) return 'QF';
    if (r.startsWith('semi')) return 'SF';
    if (r.startsWith('third') || r.includes('place')) return '3rd';
    if (r === 'final') return 'F';
    const ro = /round of (\d+)/.exec(r);
    if (ro) return 'R' + ro[1];
    const rn = /round (\d+)/.exec(r);
    if (rn) return 'R' + rn[1];
    return this.roundLabel().replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase();
  });

  private played = computed(() => {
    const m = this.match();
    return m.homeScore != null && m.awayScore != null && (m.status === 'completed' || m.status === 'live');
  });

  scoreText = computed(() => (this.played() ? matchScoreText(this.match()) : '- : -'));

  winner = computed<'home' | 'away' | null>(() =>
    this.played() ? matchWinner(this.match()) : null
  );

  homeAvatar = computed(() => this.sideAvatar('home'));
  awayAvatar = computed(() => this.sideAvatar('away'));

  private sideAvatar(side: 'home' | 'away'): TeamAvatar {
    const m = this.match();
    const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
    const bad = side === 'home' ? this.homeBad() : this.awayBad();
    const provided = this.avatars()[teamId];
    const name = (side === 'home' ? m.homeTeamName : m.awayTeamName) || 'TBD';
    const denormLogo = side === 'home' ? m.homeTeamLogo : m.awayTeamLogo;

    const base = provided ?? { ...initialsAvatar(name), src: null };
    const src = bad ? null : provided ? provided.src : denormLogo || null;
    return { ...base, src };
  }

  statusLabel(): string {
    switch (this.match().status) {
      case 'completed':
        return 'Completed';
      case 'live':
        return 'Live';
      case 'postponed':
        return 'Postponed';
      default:
        return 'Not started';
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
        return 'bg-red-50 text-accent-red';
    }
  }
}
