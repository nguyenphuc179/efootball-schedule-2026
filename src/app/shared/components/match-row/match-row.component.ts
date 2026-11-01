import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Match, matchScoreText, matchWinner } from '../../../models/match.model';
import { initialsAvatar } from '../../utils/avatar.util';
import { playerLabel } from '../../utils/player-label.util';
import { roundLabel } from '../../utils/round-label.util';
import { TeamAvatar } from '../../utils/team-avatar.util';

/**
 * GiveTour-style single-line match row: (group badge + round, when grouped) · home name → crest ·
 * score · crest → away name · status badge. The whole row links to result entry when `showResultLink`
 * is set. The single match display used across every tab (Fixtures/Results, Group Stage, Final Stage).
 */
@Component({
  selector: 'app-match-row',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (opponentSide(); as side) {
      <a
        [routerLink]="showResultLink() ? ['/matches', match().id, 'result'] : null"
        class="flex items-center gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2.5 no-underline text-inherit"
      >
        <span class="text-xs font-bold text-gray-400 shrink-0">VS</span>
        @if (sideAvatarOf(side).src; as src) {
          <img [src]="src" alt="" class="w-8 h-8 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" (error)="markBad(side)" />
        } @else {
          <span
            class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            [style.background-color]="sideAvatarOf(side).bg"
            [style.color]="sideAvatarOf(side).fg"
          >{{ sideAvatarOf(side).initials }}</span>
        }
        <div class="flex-1 min-w-0 leading-tight">
          <div class="text-sm font-semibold truncate">{{ sideLabel(side) }}</div>
          @if (compactSubtitle()) {
            <div class="text-[11px] text-gray-400 truncate">{{ compactSubtitle() }}</div>
          }
          @if (compactClubs(); as c) {
            <div class="flex items-center gap-1 mt-0.5 text-[11px] font-bold min-w-0">
              <span class="inline-flex items-center gap-0.5 rounded px-1 bg-primary-50 text-primary-700 truncate"><span class="material-icons text-[11px]">shield</span>{{ c.own || '?' }}</span>
              <span class="text-gray-400 shrink-0">vs</span>
              <span class="inline-flex items-center gap-0.5 rounded px-1 bg-gray-100 text-gray-600 truncate"><span class="material-icons text-[11px]">shield</span>{{ c.opp || '?' }}</span>
            </div>
          }
        </div>
        <span class="shrink-0 text-sm font-extrabold tabular-nums whitespace-nowrap" [class]="scoreClass()">{{ ownScoreText() }}</span>
        @if (showResultLink()) {
          <span class="material-icons text-[18px] text-gray-400 shrink-0">{{ played() ? 'edit' : 'add_circle_outline' }}</span>
        }
      </a>
    } @else {
    <a
      [routerLink]="showResultLink() ? ['/matches', match().id, 'result'] : null"
      class="flex items-center gap-2 sm:gap-3 bg-white rounded-lg border border-gray-100 px-2.5 sm:px-3 py-2.5 no-underline text-inherit"
    >
      @if (match().groupName) {
        <div class="hidden sm:flex items-center gap-1.5 shrink-0 sm:w-24">
          <span class="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">
            {{ groupLetter() }}
          </span>
          <span class="text-[11px] text-gray-400 truncate">{{ roundLabel() }}</span>
        </div>
      } @else if (showRound() && roundLabel()) {
        <div class="hidden sm:flex items-center gap-1.5 shrink-0 sm:w-28">
          <span class="h-6 px-1.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">
            {{ roundBadge() }}
          </span>
          <span class="text-[11px] text-gray-400 truncate">{{ roundLabel() }}</span>
        </div>
      }

      <div class="flex-1 flex items-center justify-end gap-2 min-w-0">
        <div class="min-w-0 text-right leading-tight">
          <div class="text-sm truncate" [class]="nameClass('home')">{{ sideLabel('home') }}</div>
          @if (match().homeClub; as c) {
            <div><span class="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 mt-0.5 text-xs font-bold bg-primary-50 text-primary-700"><span class="material-icons text-[12px]">shield</span><span class="truncate">{{ c }}</span></span></div>
          }
        </div>
        @if (homeAvatar().src; as src) {
          <img [src]="src" alt="" class="w-7 h-7 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" (error)="homeBad.set(true)" />
        } @else {
          <span
            class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            [style.background-color]="homeAvatar().bg"
            [style.color]="homeAvatar().fg"
          >{{ homeAvatar().initials }}</span>
        }
      </div>

      <span class="shrink-0 min-w-[3rem] px-1 text-center text-sm font-extrabold tabular-nums whitespace-nowrap" [class]="scoreClass()">{{ scoreText() }}</span>

      <div class="flex-1 flex items-center gap-2 min-w-0">
        @if (awayAvatar().src; as src) {
          <img [src]="src" alt="" class="w-7 h-7 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" (error)="awayBad.set(true)" />
        } @else {
          <span
            class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            [style.background-color]="awayAvatar().bg"
            [style.color]="awayAvatar().fg"
          >{{ awayAvatar().initials }}</span>
        }
        <div class="min-w-0 leading-tight">
          <div class="text-sm truncate" [class]="nameClass('away')">{{ sideLabel('away') }}</div>
          @if (match().awayClub; as c) {
            <div><span class="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 mt-0.5 text-xs font-bold bg-primary-50 text-primary-700"><span class="material-icons text-[12px]">shield</span><span class="truncate">{{ c }}</span></span></div>
          }
        </div>
      </div>

      <span class="badge shrink-0 !text-[10px] hidden sm:inline-flex" [class]="statusClass()">{{ statusLabel() }}</span>
      @if (showResultLink()) {
        <span class="material-icons text-[18px] text-gray-400 shrink-0">{{ played() ? 'edit' : 'add_circle_outline' }}</span>
      }
    </a>
    }
  `,
})
export class MatchRowComponent {
  readonly match = input.required<Match>();
  readonly showResultLink = input(false);
  /** Show the round label for a non-group (knockout) match. Off where the parent already
   *  headings each round (e.g. the Final Stage tab). */
  readonly showRound = input(true);
  /** teamId -> manager name; when present the label reads "Club (Manager)". */
  readonly managers = input<Record<string, string>>({});
  /** teamId -> resolved avatar (logo / login photo / portrait / initials). Falls back to the
   *  match's denormalised crest, then initials from the team name, when a team isn't listed. */
  readonly avatars = input<Record<string, TeamAvatar>>({});
  /** The viewer's own team ids. When one side of the match is in here, the row collapses to just
   *  the opponent — repeating the viewer's own name on every row adds nothing. */
  readonly ownTeamIds = input<ReadonlySet<string> | null>(null);
  /** Extra context for the collapsed row's second line, e.g. the tournament name. */
  readonly context = input('');

  private translate = inject(TranslateService);

  homeBad = signal(false);
  awayBad = signal(false);

  opponentSide = computed<'home' | 'away' | null>(() => {
    const own = this.ownTeamIds();
    if (!own) return null;
    const m = this.match();
    if (own.has(m.homeTeamId) && !own.has(m.awayTeamId)) return 'away';
    if (own.has(m.awayTeamId) && !own.has(m.homeTeamId)) return 'home';
    return null;
  });

  /** Team-match fixtures store the home team's name in `round`, which is no round label at all. */
  compactSubtitle = computed(() => {
    const m = this.match();
    const roundIsTeamName = m.round === m.homeTeamName || m.round === m.awayTeamName;
    return [this.context(), roundIsTeamName ? '' : this.roundLabel()].filter(Boolean).join(' · ');
  });

  /** Clubs picked for this match (team_match), own side first; null when neither side has one. */
  compactClubs = computed(() => {
    const m = this.match();
    if (!m.homeClub && !m.awayClub) return null;
    return this.opponentSide() === 'away'
      ? { own: m.homeClub, opp: m.awayClub }
      : { own: m.awayClub, opp: m.homeClub };
  });

  /** Score from the viewer's side (own goals first), so a win always reads like a win. */
  ownScoreText = computed(() => {
    const m = this.match();
    if (!this.played()) return '- : -';
    if (this.opponentSide() === 'away') return matchScoreText(m);
    const base = `${m.awayScore} - ${m.homeScore}`;
    return m.homeScore === m.awayScore && m.penaltyHome != null && m.penaltyAway != null
      ? `${base} (${m.penaltyAway}-${m.penaltyHome} pen)`
      : base;
  });

  sideAvatarOf(side: 'home' | 'away'): TeamAvatar {
    return side === 'home' ? this.homeAvatar() : this.awayAvatar();
  }

  markBad(side: 'home' | 'away'): void {
    (side === 'home' ? this.homeBad : this.awayBad).set(true);
  }

  /** "Club" or "Club_Manager" for the given side (placeholder slots stay "W/L …"). */
  sideLabel(side: 'home' | 'away'): string {
    this.translate.currentLang();
    const m = this.match();
    const name = side === 'home' ? m.homeTeamName : m.awayTeamName;
    if (!name) return this.translate.instant('MATCH.TBD');
    if (/^(?:Winner|Loser) /.test(name)) {
      return name
        .replace(/^Winner /, this.translate.instant('MATCH.WINNER_ABBR') + ' ')
        .replace(/^Loser /, this.translate.instant('MATCH.LOSER_ABBR') + ' ');
    }
    const manager = this.managers()[side === 'home' ? m.homeTeamId : m.awayTeamId];
    return playerLabel(name, manager);
  }

  groupLetter = computed(() => (this.match().groupName ?? '').replace(/^group\s+/i, '').trim() || '?');

  roundLabel = computed(() => {
    this.translate.currentLang();
    return roundLabel(this.match().round, this.translate);
  });

  /** Short chip shown on mobile where the full round label doesn't fit. */
  roundBadge = computed(() => {
    this.translate.currentLang();
    const r = this.match().round.toLowerCase();
    if (r.startsWith('quarter')) return this.translate.instant('MATCH.QF_ABBR');
    if (r.startsWith('semi')) return this.translate.instant('MATCH.SF_ABBR');
    if (r.startsWith('third') || r.includes('place')) return this.translate.instant('MATCH.THIRD_ABBR');
    if (r === 'final') return this.translate.instant('MATCH.F_ABBR');
    const ro = /round of (\d+)/.exec(r);
    if (ro) return 'R' + ro[1];
    const rn = /round (\d+)/.exec(r);
    if (rn) return 'R' + rn[1];
    return this.roundLabel().replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase();
  });

  protected played = computed(() => {
    const m = this.match();
    return m.homeScore != null && m.awayScore != null && (m.status === 'completed' || m.status === 'live');
  });

  scoreText = computed(() => (this.played() ? matchScoreText(this.match()) : '- : -'));

  /** Winner bold, loser muted, a draw / unplayed match neutral. */
  nameClass(side: 'home' | 'away'): string {
    const w = this.winner();
    if (!w) return '';
    return w === side ? 'font-bold' : 'text-gray-500';
  }

  scoreClass(): string {
    if (!this.played()) return 'text-gray-400';
    return this.winner() ? 'text-primary-700' : 'text-gray-500';
  }

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
    this.translate.currentLang();
    switch (this.match().status) {
      case 'completed':
        return this.translate.instant('MATCH.STATUS_COMPLETED');
      case 'live':
        return this.translate.instant('MATCH.STATUS_LIVE');
      case 'postponed':
        return this.translate.instant('MATCH.STATUS_POSTPONED');
      default:
        return this.translate.instant('MATCH.STATUS_NOT_STARTED');
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
