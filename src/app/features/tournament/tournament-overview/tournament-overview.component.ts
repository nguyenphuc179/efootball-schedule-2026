import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../../teams/team.service';
import { TeamAvatarService } from '../../teams/team-avatar.service';
import { StandingsService } from '../../standings/standings.service';
import { MatchRowComponent } from '../../../shared/components/match-row/match-row.component';
import { Tournament, TOURNAMENT_STATUS_LABELS } from '../../../models/tournament.model';
import { Match, matchWinner } from '../../../models/match.model';
import { StandingRow } from '../../../models/standing.model';
import { Team, teamGroup } from '../../../models/team.model';
import { TeamAvatar } from '../../../shared/utils/team-avatar.util';
import { playerLabel } from '../../../shared/utils/player-label.util';
import { GroupKey, GroupStats, compareGroups, computeGroupStats } from '../team-match/group-stats.util';

interface Podium {
  key: string;
  label: string;
  sub?: string;
  avatar: TeamAvatar;
  points?: number;
}

const UPCOMING_COUNT = 3;

/**
 * Tournament detail "Overview" tab: champion (once finished), progress, current leaders and the
 * next matches — the tab everyone lands on, so it should answer "where is this tournament at?"
 * at a glance. Every block hides itself when it has nothing to say.
 */
@Component({
  selector: 'app-tournament-overview',
  standalone: true,
  imports: [MatchRowComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 max-w-3xl">
      @if (champion(); as c) {
        <div
          class="card !p-5 flex items-center gap-4 border"
          style="background-image: linear-gradient(120deg, rgba(245,166,35,0.28), rgba(245,166,35,0.06) 70%); border-color: rgba(245,166,35,0.5)"
        >
          <span class="relative shrink-0">
            @if (c.avatar.src) {
              <img [src]="c.avatar.src" alt="" class="w-16 h-16 rounded-full object-cover" style="box-shadow: 0 0 0 3px #f5a623" referrerpolicy="no-referrer" />
            } @else {
              <span
                class="w-16 h-16 rounded-full flex items-center justify-center text-lg font-black"
                style="box-shadow: 0 0 0 3px #f5a623"
                [style.background-color]="c.avatar.bg"
                [style.color]="c.avatar.fg"
              >{{ c.avatar.initials }}</span>
            }
            <span class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent-amber text-white flex items-center justify-center shadow">
              <span class="material-icons text-[16px]">emoji_events</span>
            </span>
          </span>
          <div class="min-w-0">
            <div class="text-[11px] font-extrabold uppercase tracking-widest text-amber-600">{{ 'TOURNAMENT_OVERVIEW.CHAMPION' | translate }}</div>
            <div class="text-xl font-black truncate">{{ c.label }}</div>
            @if (c.sub) {
              <div class="text-xs text-gray-500 truncate">{{ c.sub }}</div>
            }
          </div>
        </div>
      }

      <div class="card">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h3 class="font-bold text-sm">{{ 'TOURNAMENT_OVERVIEW.PROGRESS' | translate }}</h3>
          <span class="badge" [class]="tournament().status === 'completed' ? 'bg-accent-red text-white' : 'bg-accent-amber text-white'">
            {{ statusLabels[tournament().status] | translate }}
          </span>
        </div>
        @if (matches().length) {
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-black tabular-nums">{{ completedCount() }}</span>
            <span class="text-sm text-gray-400">/ {{ matches().length }} {{ 'TOURNAMENT_OVERVIEW.MATCHES_PLAYED' | translate }}</span>
          </div>
          <div class="h-2 rounded-full bg-gray-200 overflow-hidden mt-2">
            <div class="h-full rounded-full bg-primary-500 transition-all" [style.width.%]="progressPct()"></div>
          </div>
        } @else {
          <p class="text-sm text-gray-400">{{ 'TOURNAMENT_OVERVIEW.NO_FIXTURES' | translate }}</p>
        }
        <div class="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div>
            <div class="text-gray-400 text-xs">{{ 'ADMIN_OVERVIEW.TEAMS' | translate }}</div>
            <div class="font-bold">{{ teams().length || tournament().numberOfTeams }}</div>
          </div>
          <div>
            <div class="text-gray-400 text-xs">{{ 'TOURNAMENT_OVERVIEW.GOALS' | translate }}</div>
            <div class="font-bold">{{ totalGoals() }}</div>
          </div>
        </div>
      </div>

      @if (tournament().status !== 'completed' && leaders().length) {
        <div class="card">
          <div class="flex items-center justify-between gap-2 mb-3">
            <h3 class="font-bold text-sm">{{ leadersTitle() | translate }}</h3>
            <button type="button" class="text-xs font-semibold text-primary-600 !min-h-0" (click)="goToTab.emit('standings')">
              {{ 'TOURNAMENT_OVERVIEW.SEE_STANDINGS' | translate }}
            </button>
          </div>
          <div class="flex flex-col gap-2.5">
            @for (l of leaders(); track l.key; let i = $index) {
              <div class="flex items-center gap-3">
                <span class="w-6 text-center text-sm font-black" [class]="i === 0 ? 'text-amber-500' : 'text-gray-400'">{{ isGroupLeaders() ? '' : i + 1 }}</span>
                @if (l.avatar.src) {
                  <img [src]="l.avatar.src" alt="" class="w-8 h-8 rounded-full object-cover shrink-0" referrerpolicy="no-referrer" />
                } @else {
                  <span class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" [style.background-color]="l.avatar.bg" [style.color]="l.avatar.fg">{{ l.avatar.initials }}</span>
                }
                <div class="flex-1 min-w-0 leading-tight">
                  <div class="text-sm font-semibold truncate">{{ l.label }}</div>
                  @if (l.sub) {
                    <div class="text-[11px] text-gray-400 truncate">{{ l.sub }}</div>
                  }
                </div>
                @if (l.points != null) {
                  <span class="text-sm font-black tabular-nums shrink-0">{{ l.points }} <span class="text-[10px] font-bold text-gray-400">{{ 'STANDINGS.PTS_ABBR' | translate }}</span></span>
                }
              </div>
            }
          </div>
        </div>
      }

      @if (upcoming().length) {
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-extrabold uppercase tracking-wide text-gray-500">{{ 'TOURNAMENT_OVERVIEW.NEXT_MATCHES' | translate }}</h3>
            <button type="button" class="text-xs font-semibold text-primary-600 !min-h-0" (click)="goToTab.emit(matchesTab())">
              {{ 'TOURNAMENT_OVERVIEW.SEE_ALL' | translate }}
            </button>
          </div>
          @for (m of upcoming(); track m.id) {
            <app-match-row [match]="m" [managers]="managers()" [avatars]="avatars()" [showRound]="tournament().type !== 'team_match'" />
          }
        </div>
      }

      @if (tournament().description) {
        <div class="card">
          <h3 class="font-bold text-sm mb-2">{{ 'TOURNAMENT_DETAIL.ABOUT' | translate }}</h3>
          <p class="text-sm text-gray-600 whitespace-pre-line">{{ tournament().description }}</p>
        </div>
      }
    </div>
  `,
})
export class TournamentOverviewComponent {
  readonly tournament = input.required<Tournament>();
  readonly matches = input.required<Match[]>();
  /** Asks the parent to switch tabs (e.g. "See standings"). */
  readonly goToTab = output<string>();

  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private standingsService = inject(StandingsService);
  private translate = inject(TranslateService);

  readonly statusLabels = TOURNAMENT_STATUS_LABELS;

  private tournamentId = computed(() => this.tournament().id);

  teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );
  private rows = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.standingsService.streamRows(id))),
    { initialValue: [] as StandingRow[] }
  );

  private teamById = computed(() => new Map(this.teams().map((t) => [t.id, t] as const)));
  managers = computed(() =>
    Object.fromEntries(this.teams().filter((t) => t.manager).map((t) => [t.id, t.manager] as const))
  );
  avatars = computed(() => this.teamAvatars.byId(this.teams()));

  private completed = computed(() => this.matches().filter((m) => m.status === 'completed'));
  completedCount = computed(() => this.completed().length);
  progressPct = computed(() =>
    this.matches().length ? Math.round((this.completedCount() / this.matches().length) * 100) : 0
  );
  totalGoals = computed(() => this.completed().reduce((s, m) => s + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0));

  /** Next unplayed matches whose two sides are already known (not "Winner of SF1" placeholders). */
  upcoming = computed(() =>
    this.matches()
      .filter((m) => m.status !== 'completed' && m.homeTeamId && m.awayTeamId && this.teamById().has(m.homeTeamId) && this.teamById().has(m.awayTeamId))
      .sort((a, b) => a.matchDate - b.matchDate)
      .slice(0, UPCOMING_COUNT)
  );

  matchesTab = computed(() => {
    switch (this.tournament().type) {
      case 'team_match':
        return 'teamMatch';
      case 'knockout':
        return 'finalStage';
      case 'group_knockout':
        return this.matches().some((m) => !m.groupName && m.status !== 'completed') ? 'finalStage' : 'groupStage';
      default:
        return 'fixtures';
    }
  });

  private teamPodium(teamId: string, points?: number, sub?: string): Podium | null {
    const team = this.teamById().get(teamId);
    if (!team) return null;
    return {
      key: teamId,
      label: playerLabel(team.teamName, team.manager),
      sub,
      avatar: this.teamAvatars.resolve(team),
      points,
    };
  }

  private groupTotals = computed((): Record<GroupKey, GroupStats> | null => {
    if (this.tournament().type !== 'team_match') return null;
    const a = new Set(this.teams().filter((t) => teamGroup(t) === 'A').map((t) => t.id));
    const b = new Set(this.teams().filter((t) => teamGroup(t) === 'B').map((t) => t.id));
    return a.size && b.size ? computeGroupStats(this.matches(), a, b) : null;
  });

  private groupPodium(key: GroupKey, stats: GroupStats): Podium {
    this.translate.currentLang();
    return {
      key,
      label: this.translate.instant(key === 'A' ? 'TEAM_MATCH.GROUP_A' : 'TEAM_MATCH.GROUP_B'),
      sub: `${stats.wins}-${stats.draws}-${stats.losses}`,
      avatar: { initials: key, bg: key === 'A' ? '#3b82f6' : '#ec4899', fg: '#ffffff', src: null },
      points: stats.points,
    };
  }

  champion = computed((): Podium | null => {
    const t = this.tournament();
    if (t.status !== 'completed') return null;

    const final = this.matches().find((m) => m.round === 'Final' && m.status === 'completed');
    if (final) {
      const w = matchWinner(final);
      return w ? this.teamPodium(w === 'home' ? final.homeTeamId : final.awayTeamId) : null;
    }
    const totals = this.groupTotals();
    if (totals) {
      const { leader } = compareGroups(totals.A, totals.B);
      return leader ? this.groupPodium(leader, totals[leader]) : null;
    }
    const top = this.rows().find((r) => r.position === 1 && !r.groupName);
    return top ? this.teamPodium(top.teamId, top.points) : null;
  });

  /** group_knockout shows each group's leader (no rank number); everything else a top 3. */
  isGroupLeaders = computed(() => this.tournament().type === 'group_knockout');

  leadersTitle = computed(() =>
    this.isGroupLeaders() ? 'TOURNAMENT_OVERVIEW.GROUP_LEADERS' : 'TOURNAMENT_OVERVIEW.LEADERS'
  );

  leaders = computed((): Podium[] => {
    if (this.completedCount() === 0) return [];
    const type = this.tournament().type;

    const totals = this.groupTotals();
    if (totals) {
      const { leader } = compareGroups(totals.A, totals.B);
      const order: GroupKey[] = leader === 'B' ? ['B', 'A'] : ['A', 'B'];
      return order.map((k) => this.groupPodium(k, totals[k]));
    }
    if (type === 'knockout') return [];

    if (type === 'group_knockout') {
      return this.rows()
        .filter((r) => r.groupName && r.position === 1)
        .sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? ''))
        .map((r) => this.teamPodium(r.teamId, r.points, r.groupName ?? undefined))
        .filter((p): p is Podium => !!p);
    }

    return this.rows()
      .filter((r) => !r.groupName)
      .sort((a, b) => a.position - b.position)
      .slice(0, 3)
      .map((r) => this.teamPodium(r.teamId, r.points, `${r.won}-${r.drawn}-${r.lost}`))
      .filter((p): p is Podium => !!p);
  });
}
