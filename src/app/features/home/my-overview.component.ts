import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
import { Match, matchWinner } from '../../models/match.model';
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
      <header class="flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <div class="text-xs text-gray-400">{{ 'MY_OVERVIEW.GREETING' | translate }}</div>
          <div class="text-2xl font-black tracking-tight truncate">{{ displayName() }}</div>
        </div>
        @if (myRank(); as r) {
          <a routerLink="/ranking" class="shrink-0 text-center rounded-xl bg-primary-50 text-primary-700 px-3 py-1.5 no-underline">
            <div class="text-lg font-black leading-none">#{{ r.rank }}</div>
            <div class="text-[10px] font-bold uppercase tracking-wide">/ {{ r.total }}</div>
          </a>
        }
      </header>

      <div class="grid grid-cols-3 gap-2">
        <div class="card !p-3 text-center">
          <div class="text-xl font-black">{{ stats().played }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ 'MY_OVERVIEW.PLAYED' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black">{{ stats().wins }}-{{ stats().draws }}-{{ stats().losses }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ 'MY_OVERVIEW.RECORD_LABEL' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black">{{ stats().winRate }}%</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ 'MY_OVERVIEW.WIN_RATE' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div
            class="text-xl font-black"
            [class]="stats().gd > 0 ? 'text-primary-600' : stats().gd < 0 ? 'text-accent-red' : ''"
          >
            {{ stats().gd > 0 ? '+' : '' }}{{ stats().gd }}
          </div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ 'MY_OVERVIEW.GOAL_DIFF' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black">{{ stats().tournaments }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ 'NAV.CUPS' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black text-amber-500">{{ stats().trophies }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">{{ 'MY_OVERVIEW.TROPHIES' | translate }}</div>
        </div>
      </div>

      @if (myTrophies().length) {
        <div class="flex flex-wrap gap-2">
          @for (c of myTrophies(); track c.id) {
            <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 font-bold text-xs px-3 py-1">
              <span class="material-icons text-[15px]">emoji_events</span>
              {{ 'MY_OVERVIEW.SEASON_TROPHY' | translate: { season: c.season, club: c.club } }}
            </span>
          }
        </div>
      }

      <section class="flex flex-col gap-2">
        <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500">{{ 'MY_OVERVIEW.MY_TEAMS' | translate }}</h2>
        @for (t of myTeams(); track t.id) {
          <a [routerLink]="['/tournaments', t.tournamentId]" class="card !p-3 flex items-center gap-3 no-underline text-inherit">
            <span
              class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold"
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
              <div class="font-semibold text-sm truncate">{{ t.teamName }}</div>
              <div class="text-xs text-gray-400 truncate">{{ tournamentName(t.tournamentId) }}</div>
            </div>
            @if (rowByTeamId().get(t.id); as r) {
              <span class="shrink-0 text-right leading-tight">
                <span class="block text-sm font-black">{{ 'MY_OVERVIEW.RANK' | translate: { position: r.position } }}</span>
                <span class="block text-[11px] text-gray-400">
                  @if (r.groupName) {
                    {{ 'MY_OVERVIEW.GROUP_LABEL' | translate: { name: r.groupName } }}
                  } @else {
                    {{ r.points }} {{ 'STANDINGS.PTS_ABBR' | translate }}
                  }
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
        <section class="flex flex-col gap-2">
          <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500">{{ 'MY_OVERVIEW.UPCOMING' | translate }}</h2>
          @for (m of upcoming(); track m.id) {
            <app-match-row [match]="m" [managers]="managersMap()" [avatars]="avatarsMap()" [showResultLink]="auth.isAdmin()" />
          }
        </section>
      }

      @if (recent().length) {
        <section class="flex flex-col gap-2">
          <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500">{{ 'MY_OVERVIEW.RECENT_RESULTS' | translate }}</h2>
          @for (m of recent(); track m.id) {
            <div class="flex items-center gap-2">
              <span
                class="hidden sm:flex w-6 h-6 rounded-md text-[11px] font-black items-center justify-center shrink-0"
                [class]="outcomeClass(m)"
              >{{ outcomeLabel(m) }}</span>
              <div class="flex-1 min-w-0"><app-match-row [match]="m" [managers]="managersMap()" [avatars]="avatarsMap()" /></div>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class MyOverviewComponent {
  auth = inject(AuthService);
  private translate = inject(TranslateService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  private matchService = inject(MatchService);
  private standingsService = inject(StandingsService);
  private rankingService = inject(RankingService);
  private championService = inject(ChampionService);

  displayName = this.auth.displayName;

  private uid = computed(() => this.auth.firebaseUser()?.uid ?? '');

  myTeams = toSignal(
    toObservable(this.uid).pipe(
      distinctUntilChanged(),
      switchMap((u) => (u ? this.teamService.streamByManager(u) : of([] as Team[])))
    ),
    { initialValue: [] as Team[] }
  );

  private myTeamIds = computed(() => new Set(this.myTeams().map((t) => t.id)));
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
  recent = computed(() =>
    this.myMatches()
      .filter((m) => m.status === 'completed')
      .sort((a, b) => b.matchDate - a.matchDate)
      .slice(0, 6)
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
    return this.championService.all().filter((c) => names.has((c.playerName ?? '').trim().toLowerCase()));
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

  tournamentName(id: string): string {
    return this.tournamentById().get(id)?.name ?? '—';
  }

  private outcome(m: Match): 'W' | 'D' | 'L' {
    const mineHome = this.myTeamIds().has(m.homeTeamId);
    const w = matchWinner(m);
    if (!w) return 'D';
    return (w === 'home') === mineHome ? 'W' : 'L';
  }
  outcomeLabel(m: Match): string {
    this.translate.currentLang();
    const key = { W: 'MY_OVERVIEW.OUTCOME_W', D: 'MY_OVERVIEW.OUTCOME_D', L: 'MY_OVERVIEW.OUTCOME_L' }[this.outcome(m)];
    return this.translate.instant(key);
  }
  outcomeClass(m: Match): string {
    const o = this.outcome(m);
    return o === 'W' ? 'bg-primary-500 text-white' : o === 'L' ? 'bg-accent-red text-white' : 'bg-gray-300 text-gray-700';
  }
}
