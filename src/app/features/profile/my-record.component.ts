import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { TeamService } from '../teams/team.service';
import { TeamAvatarService } from '../teams/team-avatar.service';
import { MatchService } from '../fixtures/match.service';
import { RankingService } from '../ranking/ranking.service';
import { TournamentService } from '../tournament/tournament.service';
import { MatchRowComponent } from '../../shared/components/match-row/match-row.component';
import { Team } from '../../models/team.model';
import { Match, matchWinner } from '../../models/match.model';

const PAGE = 10;

/** Profile page: the signed-in user's career numbers and their full played-match history. */
@Component({
  selector: 'app-my-record',
  standalone: true,
  imports: [MatchRowComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-3">
      <div class="grid grid-cols-4 gap-2">
        <div class="card !p-3 text-center">
          <div class="text-xl font-black leading-none">{{ stats().played }}</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.PLAYED' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black leading-none whitespace-nowrap">
            <span class="text-primary-600">{{ stats().wins }}</span>-{{ stats().draws }}-<span class="text-accent-red">{{ stats().losses }}</span>
          </div>
          <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.RECORD_LABEL' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black leading-none">{{ stats().winRate }}%</div>
          <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.WIN_RATE' | translate }}</div>
        </div>
        <div class="card !p-3 text-center">
          <div class="text-xl font-black leading-none" [class]="stats().gd > 0 ? 'text-primary-600' : stats().gd < 0 ? 'text-accent-red' : ''">
            {{ stats().gd > 0 ? '+' : '' }}{{ stats().gd }}
          </div>
          <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.GOAL_DIFF' | translate }}</div>
        </div>
      </div>

      <h2 class="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-gray-500 mt-2">
        <span class="w-1 h-4 rounded-full bg-primary-500"></span>{{ 'PROFILE.MATCH_HISTORY' | translate }}
        <span class="rounded-full bg-primary-50 text-primary-700 text-[11px] font-bold px-2 py-0.5 normal-case">{{ history().length }}</span>
      </h2>
      @for (m of shownHistory(); track m.id) {
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-md text-[11px] font-black flex items-center justify-center shrink-0" [class]="outcomeClass(m)">{{ outcomeLabel(m) }}</span>
          <div class="flex-1 min-w-0">
            <app-match-row [match]="m" [managers]="managersMap()" [avatars]="avatarsMap()" [ownTeamIds]="myTeamIds()" [context]="tournamentName(m.tournamentId)" />
          </div>
        </div>
      } @empty {
        <p class="text-sm text-gray-400">{{ 'PROFILE.NO_HISTORY' | translate }}</p>
      }
      @if (history().length > shownHistory().length) {
        <button type="button" class="btn-secondary w-full text-sm" (click)="limit.set(limit() + PAGE)">
          {{ 'PROFILE.SHOW_MORE' | translate }}
        </button>
      }
    </section>
  `,
})
export class MyRecordComponent {
  private auth = inject(AuthService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private matchService = inject(MatchService);
  private rankingService = inject(RankingService);
  private tournamentService = inject(TournamentService);
  private translate = inject(TranslateService);

  readonly PAGE = PAGE;
  limit = signal(PAGE);

  private uid = computed(() => this.auth.firebaseUser()?.uid ?? '');

  private myTeams = toSignal(
    toObservable(this.uid).pipe(
      distinctUntilChanged(),
      switchMap((u) => (u ? this.teamService.streamByManager(u) : of([] as Team[])))
    ),
    { initialValue: [] as Team[] }
  );
  myTeamIds = computed(() => new Set(this.myTeams().map((t) => t.id)));

  private tidKey$ = toObservable(
    computed(() => [...new Set(this.myTeams().map((t) => t.tournamentId))].sort().join('|'))
  ).pipe(distinctUntilChanged());

  private streamAll<T>(fn: (id: string) => Observable<T[]>) {
    return this.tidKey$.pipe(
      switchMap((key) => {
        const ids = key ? key.split('|') : [];
        return ids.length ? combineLatest(ids.map(fn)).pipe(map((a) => a.flat())) : of([] as T[]);
      })
    );
  }

  private matches = toSignal(this.streamAll((id) => this.matchService.streamByTournament(id)), {
    initialValue: [] as Match[],
  });
  private teams = toSignal(this.streamAll((id) => this.teamService.streamByTournament(id)), {
    initialValue: [] as Team[],
  });

  managersMap = computed(() =>
    Object.fromEntries(this.teams().filter((t) => t.manager).map((t) => [t.id, t.manager] as const))
  );
  avatarsMap = computed(() => this.teamAvatars.byId(this.teams()));

  history = computed(() => {
    const ids = this.myTeamIds();
    return this.matches()
      .filter((m) => m.status === 'completed' && (ids.has(m.homeTeamId) || ids.has(m.awayTeamId)))
      .sort((a, b) => b.matchDate - a.matchDate);
  });
  shownHistory = computed(() => this.history().slice(0, this.limit()));

  private tournamentById = computed(() => new Map(this.tournamentService.all().map((t) => [t.id, t] as const)));
  tournamentName(id: string): string {
    return this.tournamentById().get(id)?.name ?? '';
  }

  stats = computed(() => {
    const uid = this.uid();
    const e = this.rankingService.ranking().find((r) => uid && r.uid === uid);
    const played = e?.played ?? 0;
    const wins = e?.wins ?? 0;
    return {
      played,
      wins,
      draws: e?.draws ?? 0,
      losses: e?.losses ?? 0,
      gd: e?.goalDifference ?? 0,
      winRate: played ? Math.round((wins / played) * 100) : 0,
    };
  });

  private outcome(m: Match): 'W' | 'D' | 'L' {
    const mineHome = this.myTeamIds().has(m.homeTeamId);
    const w = matchWinner(m);
    if (!w) return 'D';
    return (w === 'home') === mineHome ? 'W' : 'L';
  }
  outcomeLabel(m: Match): string {
    this.translate.currentLang();
    return this.translate.instant(`MY_OVERVIEW.OUTCOME_${this.outcome(m)}`);
  }
  outcomeClass(m: Match): string {
    const o = this.outcome(m);
    return o === 'W' ? 'bg-primary-500 text-white' : o === 'L' ? 'bg-accent-red text-white' : 'bg-gray-300 text-gray-700';
  }
}
