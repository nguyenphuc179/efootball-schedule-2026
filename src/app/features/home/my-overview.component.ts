import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { TeamService } from '../teams/team.service';
import { TeamAvatarService } from '../teams/team-avatar.service';
import { TournamentService } from '../tournament/tournament.service';
import { MatchService } from '../fixtures/match.service';
import { StandingsService } from '../standings/standings.service';
import { RankingService } from '../ranking/ranking.service';
import { ChampionService } from '../hall-of-fame/champion.service';
import { MatchRowComponent } from '../../shared/components/match-row/match-row.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { Team } from '../../models/team.model';
import { Match } from '../../models/match.model';
import { initialsAvatar } from '../../shared/utils/avatar.util';
import { StandingRow } from '../../models/standing.model';
import { userDisplayName } from '../../models/user.model';

/** The signed-in user's personal Home: rank, career record, their teams, upcoming & recent games. */
@Component({
  selector: 'app-my-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, MatchRowComponent, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="px-4 pt-5 max-w-3xl mx-auto flex flex-col gap-6">
      <!-- Hero -->
      <header
        class="relative overflow-hidden rounded-3xl p-5 text-white shadow-lg"
        style="background-image: linear-gradient(135deg, #0b6b45 0%, #0fa863 55%, #1fd18a 100%)"
      >
        <div class="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-white/10"></div>
        <div class="absolute right-20 -bottom-16 w-36 h-36 rounded-full bg-white/10"></div>
        <div class="relative flex items-center gap-4">
          <span
            class="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-2xl font-black bg-white/20"
            style="box-shadow: 0 0 0 4px rgba(255,255,255,0.4)"
          >
            @if (photo(); as src) {
              <img [src]="src" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
            } @else {
              {{ initials() }}
            }
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold text-white/80">{{ 'MY_OVERVIEW.GREETING' | translate }}</div>
            <div class="text-2xl sm:text-3xl font-black tracking-tight truncate">{{ displayName() }}</div>
            <div class="mt-1 flex items-center gap-1 text-xs font-semibold text-white/85">
              <span class="material-icons text-[14px]">emoji_events</span>
              {{ stats().trophies }} {{ 'MY_OVERVIEW.TROPHIES' | translate }} · {{ stats().tournaments }} {{ 'NAV.CUPS' | translate }}
            </div>
          </div>
          @if (myRank(); as r) {
            <a
              routerLink="/ranking"
              class="shrink-0 text-center rounded-2xl px-3.5 py-2 no-underline shadow-md"
              [style.background]="medal(r.rank).bg"
              [style.color]="medal(r.rank).fg"
            >
              <span class="material-icons text-[18px] leading-none">{{ r.rank === 1 ? 'workspace_premium' : 'leaderboard' }}</span>
              <div class="text-2xl font-black leading-none">#{{ r.rank }}</div>
              <div class="text-[10px] font-bold opacity-80">/ {{ r.total }}</div>
            </a>
          }
        </div>
      </header>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="card !p-3.5 flex flex-col items-center gap-1.5 text-center">
          <span class="w-9 h-9 rounded-full flex items-center justify-center" style="background-color: #3b82f622; color: #3b82f6">
            <span class="material-icons text-[20px]">sports_soccer</span>
          </span>
          <div class="text-2xl font-black leading-none">{{ stats().played }}</div>
          <div class="text-[11px] font-semibold text-gray-400">{{ 'MY_OVERVIEW.PLAYED' | translate }}</div>
        </div>

        <div class="card !p-3.5 flex flex-col items-center gap-1.5 text-center">
          <span class="w-9 h-9 rounded-full flex items-center justify-center" style="background-color: #0fa86322; color: #0fa863">
            <span class="material-icons text-[20px]">bar_chart</span>
          </span>
          <div class="text-2xl font-black leading-none whitespace-nowrap"><span class="text-primary-600">{{ stats().wins }}</span><span class="text-gray-400 text-lg">-</span><span>{{ stats().draws }}</span><span class="text-gray-400 text-lg">-</span><span class="text-accent-red">{{ stats().losses }}</span></div>
          <div class="text-[11px] font-semibold text-gray-400">{{ 'MY_OVERVIEW.RECORD_LABEL' | translate }}</div>
        </div>

        <div class="card !p-3.5 flex flex-col items-center gap-1.5 text-center">
          <span class="w-9 h-9 rounded-full flex items-center justify-center" style="background-color: #8b5cf622; color: #8b5cf6">
            <span class="material-icons text-[20px]">percent</span>
          </span>
          <div class="text-2xl font-black leading-none">{{ stats().winRate }}%</div>
          <div class="text-[11px] font-semibold text-gray-400">{{ 'MY_OVERVIEW.WIN_RATE' | translate }}</div>
          <div class="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden"><div class="h-full rounded-full bg-primary-500" [style.width.%]="stats().winRate"></div></div>
        </div>

        <div class="card !p-3.5 flex flex-col items-center gap-1.5 text-center">
          <span class="w-9 h-9 rounded-full flex items-center justify-center" style="background-color: #14b8a622; color: #14b8a6">
            <span class="material-icons text-[20px]">swap_vert</span>
          </span>
          <div class="text-2xl font-black leading-none" [class]="stats().gd > 0 ? 'text-primary-600' : stats().gd < 0 ? 'text-accent-red' : ''">{{ stats().gd > 0 ? '+' : '' }}{{ stats().gd }}</div>
          <div class="text-[11px] font-semibold text-gray-400">{{ 'MY_OVERVIEW.GOAL_DIFF' | translate }}</div>
        </div>

        <div class="card !p-3.5 flex flex-col items-center gap-1.5 text-center">
          <span class="w-9 h-9 rounded-full flex items-center justify-center" style="background-color: #f9731622; color: #f97316">
            <span class="material-icons text-[20px]">flag</span>
          </span>
          <div class="text-2xl font-black leading-none">{{ stats().tournaments }}</div>
          <div class="text-[11px] font-semibold text-gray-400">{{ 'NAV.CUPS' | translate }}</div>
        </div>

        <div class="card !p-3.5 flex flex-col items-center gap-1.5 text-center">
          <span class="w-9 h-9 rounded-full flex items-center justify-center" style="background-color: #f5a62322; color: #f5a623">
            <span class="material-icons text-[20px]">emoji_events</span>
          </span>
          <div class="text-2xl font-black leading-none text-amber-500">{{ stats().trophies }}</div>
          <div class="text-[11px] font-semibold text-gray-400">{{ 'MY_OVERVIEW.TROPHIES' | translate }}</div>
        </div>
      </div>

      @if (myTrophies().length) {
        <div class="flex flex-wrap gap-2">
          @for (c of myTrophies(); track c.id) {
            <span
              class="inline-flex items-center gap-1.5 rounded-full font-bold text-xs px-3 py-1.5 border text-amber-700"
              style="background-image: linear-gradient(90deg, rgba(245,166,35,0.28), rgba(245,166,35,0.08)); border-color: rgba(245,166,35,0.45)"
            >
              <span class="material-icons text-[16px] text-accent-amber">emoji_events</span>
              {{ 'MY_OVERVIEW.SEASON_TROPHY' | translate: { season: c.season, club: c.club } }}
            </span>
          }
        </div>
      }

      <a routerLink="/polls" class="card !p-3.5 flex items-center gap-3 no-underline text-inherit">
        <span class="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style="background-color: rgba(15,168,99,0.15); color: #0fa863">
          <span class="material-icons text-[20px]">how_to_vote</span>
        </span>
        <span class="flex-1 font-bold text-sm">{{ 'POLLS.NAV_LABEL' | translate }}</span>
        <span class="material-icons text-gray-300">chevron_right</span>
      </a>

      <section class="flex flex-col gap-2.5">
        <h2 class="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-500">
          <span class="w-1 h-4 rounded-full bg-primary-500"></span>{{ 'MY_OVERVIEW.MY_TEAMS' | translate }}
        </h2>
        @for (t of myTeams(); track t.id) {
          <a
            [routerLink]="['/tournaments', t.tournamentId]"
            class="card !p-3.5 flex items-center gap-3 no-underline text-inherit border-l-4"
            [style.border-left-color]="rankColor(rowByTeamId().get(t.id)?.position)"
          >
            <span
              class="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold"
              [style.background-color]="avatar(t).bg"
              [style.color]="avatar(t).fg"
            >
              @if (avatar(t).src; as s) {
                <img [src]="s" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
              } @else {
                {{ avatar(t).initials }}
              }
            </span>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm truncate">{{ t.teamName }}</div>
              <div class="text-xs text-gray-400 truncate">{{ tournamentName(t.tournamentId) }}</div>
            </div>
            @if (rowByTeamId().get(t.id); as r) {
              <span class="shrink-0 flex items-center gap-2.5">
                <span class="text-right leading-tight">
                  <span class="block text-[11px] text-gray-400">
                    @if (r.groupName) {
                      {{ 'MY_OVERVIEW.GROUP_LABEL' | translate: { name: groupShort(r.groupName) } }}
                    } @else {
                      {{ r.points }} {{ 'STANDINGS.PTS_ABBR' | translate }}
                    }
                  </span>
                </span>
                <span
                  class="w-11 h-11 rounded-full flex flex-col items-center justify-center font-black leading-none"
                  [style.background-color]="rankColor(r.position) + '26'"
                  [style.color]="rankColor(r.position)"
                >
                  <span class="text-[9px] font-extrabold opacity-80">#</span>
                  <span class="text-lg -mt-0.5">{{ r.position }}</span>
                </span>
              </span>
            }
          </a>
        } @empty {
          <app-empty-state
            icon="groups"
            [title]="'MY_OVERVIEW.NO_TEAMS_TITLE' | translate"
            [subtitle]="'MY_OVERVIEW.NO_TEAMS_SUBTITLE' | translate"
          />
        }
      </section>

      @if (upcoming().length) {
        <section class="flex flex-col gap-2.5">
          <h2 class="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-500">
            <span class="w-1 h-4 rounded-full bg-accent-amber"></span>{{ 'MY_OVERVIEW.UPCOMING' | translate }}
            <span class="rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold px-2 py-0.5 normal-case">{{ upcoming().length }}</span>
          </h2>
          @for (m of upcoming(); track m.id) {
            <app-match-row [match]="m" [managers]="managersMap()" [avatars]="avatarsMap()" [showResultLink]="canEditResult(m)" [ownTeamIds]="myTeamIds()" [context]="tournamentName(m.tournamentId)" />
          }
        </section>
      }
    </div>
  `,
})
export class MyOverviewComponent {
  auth = inject(AuthService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  private matchService = inject(MatchService);
  private standingsService = inject(StandingsService);
  private rankingService = inject(RankingService);
  private championService = inject(ChampionService);

  displayName = this.auth.displayName;

  /** Login / uploaded profile picture, else initials in the hero. */
  photo = computed(() => this.auth.appUser()?.photoURL || this.auth.firebaseUser()?.photoURL || null);
  initials = computed(() => initialsAvatar(this.displayName() || '?').initials);

  /** Rank badge colours: gold / silver / bronze for the podium, frosted white otherwise. */
  medal(rank: number): { bg: string; fg: string } {
    if (rank === 1) return { bg: 'linear-gradient(135deg,#fde68a,#f59e0b)', fg: '#5b3a00' };
    if (rank === 2) return { bg: 'linear-gradient(135deg,#f1f5f9,#94a3b8)', fg: '#1e293b' };
    if (rank === 3) return { bg: 'linear-gradient(135deg,#fcd9b0,#c2813a)', fg: '#4a2a05' };
    return { bg: 'rgba(255,255,255,0.22)', fg: '#ffffff' };
  }

  /** Accent for a team card by its standing: podium colours, brand green otherwise. */
  rankColor(position: number | undefined): string {
    if (position === 1) return '#f5a623';
    if (position === 2) return '#94a3b8';
    if (position === 3) return '#c2813a';
    return '#0fa863';
  }

  private uid = computed(() => this.auth.firebaseUser()?.uid ?? '');

  myTeams = toSignal(
    toObservable(this.uid).pipe(
      distinctUntilChanged(),
      switchMap((u) => (u ? this.teamService.streamByManager(u) : of([] as Team[])))
    ),
    { initialValue: [] as Team[] }
  );

  myTeamIds = computed(() => new Set(this.myTeams().map((t) => t.id)));

  /** Admin can edit any result; a team manager can edit results only for matches their own team
   *  played in (either side) — enforced for real by firestore.rules (`matches` update rule), this
   *  just decides whether the "/matches/:id/result" link shows up at all. Every match in
   *  `upcoming()`/`recent()` already involves one of the viewer's own teams (see `myMatches`
   *  below), so this is mostly a formality here, but kept for consistency with the other tabs. */
  canEditResult(match: Match): boolean {
    return this.auth.isAdmin() || this.myTeamIds().has(match.homeTeamId) || this.myTeamIds().has(match.awayTeamId);
  }
  private myTournamentIds = computed(() => [...new Set(this.myTeams().map((t) => t.tournamentId))]);

  /** Emits the sorted tournament-id list (as a stable key) whenever it actually changes. */
  private tidKey$ = toObservable(computed(() => [...this.myTournamentIds()].sort().join('|'))).pipe(
    distinctUntilChanged()
  );
  private idsFromKey = (key: string) => (key ? key.split('|') : []);

  private matchesInMyTournaments = toSignal(
    this.tidKey$.pipe(
      switchMap((key) => {
        const ids = this.idsFromKey(key);
        return ids.length
          ? combineLatest(ids.map((id) => this.matchService.streamByTournament(id))).pipe(map((a) => a.flat()))
          : of([] as Match[]);
      })
    ),
    { initialValue: [] as Match[] }
  );

  private rowsInMyTournaments = toSignal(
    this.tidKey$.pipe(
      switchMap((key) => {
        const ids = this.idsFromKey(key);
        return ids.length
          ? combineLatest(ids.map((id) => this.standingsService.streamRows(id))).pipe(map((a) => a.flat()))
          : of([] as StandingRow[]);
      })
    ),
    { initialValue: [] as StandingRow[] }
  );

  private allTeamsInMyTournaments = toSignal(
    this.tidKey$.pipe(
      switchMap((key) => {
        const ids = this.idsFromKey(key);
        return ids.length
          ? combineLatest(ids.map((id) => this.teamService.streamByTournament(id))).pipe(map((a) => a.flat()))
          : of([] as Team[]);
      })
    ),
    { initialValue: [] as Team[] }
  );

  rowByTeamId = computed(() => new Map(this.rowsInMyTournaments().map((r) => [r.teamId, r] as const)));
  managersMap = computed(() =>
    Object.fromEntries(this.allTeamsInMyTournaments().filter((t) => t.manager).map((t) => [t.id, t.manager] as const))
  );
  avatarsMap = computed(() => this.teamAvatars.byId(this.allTeamsInMyTournaments()));
  private tournamentById = computed(
    () => new Map(this.tournamentService.all().map((t) => [t.id, t] as const))
  );

  private myMatches = computed(() => {
    const ids = this.myTeamIds();
    return this.matchesInMyTournaments().filter((m) => ids.has(m.homeTeamId) || ids.has(m.awayTeamId));
  });
  upcoming = computed(() =>
    this.myMatches()
      .filter((m) => m.status !== 'completed')
      .sort((a, b) => a.matchDate - b.matchDate)
      .slice(0, 5)
  );
  private myManagerNames = computed(
    () => new Set(this.myTeams().map((t) => (t.manager ?? '').trim()).filter(Boolean))
  );

  /** Matches by uid (stable across a rename) when possible, falling back to name matching only
   *  for legacy teams with no linked account. */
  myRank = computed(() => {
    const uid = this.uid();
    const names = this.myManagerNames();
    if (!uid && !names.size) return null;
    const list = this.rankingService.ranking();
    const idx = list.findIndex((e) => (uid && e.uid === uid) || names.has(e.manager));
    return idx < 0 ? null : { entry: list[idx], rank: idx + 1, total: list.length };
  });

  myTrophies = computed(() => {
    const names = new Set([...this.myManagerNames()].map((n) => n.toLowerCase()));
    const dn = userDisplayName(this.auth.appUser(), '').toLowerCase();
    if (dn) names.add(dn);
    return this.championService.all().filter((c) => c.kind !== 'team' && names.has((c.playerName ?? '').trim().toLowerCase()));
  });

  stats = computed(() => {
    const e = this.myRank()?.entry;
    const played = e?.played ?? 0;
    const wins = e?.wins ?? 0;
    return {
      played,
      wins,
      draws: e?.draws ?? 0,
      losses: e?.losses ?? 0,
      points: e?.points ?? 0,
      gd: e?.goalDifference ?? 0,
      winRate: played ? Math.round((wins / played) * 100) : 0,
      tournaments: this.myTournamentIds().length,
      trophies: this.myTrophies().length,
    };
  });

  avatar(team: Team) {
    return this.teamAvatars.resolve(team);
  }

  /** Stored group names are "Group B"; the label already says "Bảng/Group", so just "B". */
  groupShort(name: string): string {
    return name.replace(/^group\s+/i, '').trim() || name;
  }

  tournamentName(id: string): string {
    return this.tournamentById().get(id)?.name ?? '—';
  }
}
