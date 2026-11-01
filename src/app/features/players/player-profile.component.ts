import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RankingService, PlayerMatch, playerKeyOf, playerScoreText, headToHead } from '../ranking/ranking.service';
import { ChampionService } from '../hall-of-fame/champion.service';
import { ManagerImageService } from '../ranking/manager-image.service';
import { TournamentService } from '../tournament/tournament.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { initialsAvatar } from '../../shared/utils/avatar.util';

const RECENT_PAGE = 10;
const TOP_CLUBS = 5;

interface ClubStat {
  club: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

interface OpponentStat {
  key: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

/**
 * `/players/:key` — one player's public profile: all-time record and rank, trophies, every
 * season, favourite clubs, record against each opponent and recent matches. Linked from the
 * ranking page; shareable as a plain URL.
 */
@Component({
  selector: 'app-player-profile',
  standalone: true,
  imports: [RouterLink, TranslatePipe, LoadingSpinnerComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <button type="button" class="flex items-center gap-1 text-sm font-semibold text-gray-500 mb-3 !min-h-0 h-9" (click)="back()">
        <span class="material-icons text-[20px]">arrow_back</span>{{ 'NAV.RANKING' | translate }}
      </button>

      @if (!player()) {
        @if (rankingLoaded()) {
          <app-empty-state icon="person_off" [title]="'PLAYER.NOT_FOUND' | translate" />
        } @else {
          <app-loading-spinner />
        }
      } @else {
        @let p = player()!;
        <!-- Header -->
        <div class="flex items-center gap-4 mb-5">
          <span class="w-20 h-20 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-2xl font-black" [style.background-color]="avatar().bg" [style.color]="avatar().fg">
            @if (portrait(); as url) {
              <img [src]="url" [alt]="p.manager" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
            } @else {
              {{ avatar().initials }}
            }
          </span>
          <div class="min-w-0 flex-1">
            <h1 class="text-2xl font-black tracking-tight truncate">{{ p.manager }}</h1>
            <div class="text-sm text-gray-400 mt-0.5">
              {{ 'PLAYER.RANK' | translate: { rank: rank(), total: total() } }} · {{ p.points }} {{ 'STANDINGS.PTS_ABBR' | translate }}
            </div>
            <a [routerLink]="['/head-to-head']" [queryParams]="{ a: key() }" class="inline-flex items-center gap-1 mt-2 text-xs font-bold text-primary-600 no-underline !min-h-0">
              <span class="material-icons text-[16px]">compare_arrows</span>{{ 'PLAYER.COMPARE' | translate }}
            </a>
          </div>
        </div>

        <!-- Record -->
        <div class="grid grid-cols-4 gap-2 mb-6">
          <div class="card !p-3 text-center">
            <div class="text-xl font-black leading-none">{{ p.played }}</div>
            <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.PLAYED' | translate }}</div>
          </div>
          <div class="card !p-3 text-center">
            <div class="text-xl font-black leading-none whitespace-nowrap"><span class="text-primary-600">{{ p.wins }}</span>-{{ p.draws }}-<span class="text-accent-red">{{ p.losses }}</span></div>
            <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.RECORD_LABEL' | translate }}</div>
          </div>
          <div class="card !p-3 text-center">
            <div class="text-xl font-black leading-none">{{ winRate() }}%</div>
            <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.WIN_RATE' | translate }}</div>
          </div>
          <div class="card !p-3 text-center">
            <div class="text-xl font-black leading-none" [class]="p.goalDifference > 0 ? 'text-primary-600' : p.goalDifference < 0 ? 'text-accent-red' : ''">{{ p.goalDifference > 0 ? '+' : '' }}{{ p.goalDifference }}</div>
            <div class="text-[11px] text-gray-400 mt-1">{{ 'MY_OVERVIEW.GOAL_DIFF' | translate }}</div>
          </div>
        </div>

        @if (trophies().length) {
          <section class="mb-6">
            <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">{{ 'RANKING.DETAIL_TROPHIES' | translate }}</h2>
            <div class="flex flex-wrap gap-2">
              @for (c of trophies(); track c.id) {
                <span class="inline-flex items-center gap-1.5 rounded-full font-bold text-xs px-3 py-1.5 border text-amber-700" style="background-image: linear-gradient(90deg, rgba(245,166,35,0.28), rgba(245,166,35,0.08)); border-color: rgba(245,166,35,0.45)">
                  <span class="material-icons text-[16px] text-accent-amber">emoji_events</span>
                  {{ 'MY_OVERVIEW.SEASON_TROPHY' | translate: { season: c.season, club: c.club } }}
                </span>
              }
            </div>
          </section>
        }

        <section class="mb-6">
          <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">{{ 'RANKING.DETAIL_HISTORY' | translate }}</h2>
          @if (seasons().length === 0) {
            <p class="text-sm text-gray-400">{{ 'RANKING.DETAIL_HISTORY_EMPTY' | translate }}</p>
          } @else {
            <div class="card !p-0 flex flex-col divide-y divide-gray-100">
              @for (h of seasons(); track h.tournamentId + h.teamName) {
                <a [routerLink]="['/tournaments', h.tournamentId]" class="flex items-center gap-3 px-4 py-2.5 no-underline text-inherit">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate">{{ h.tournamentName }}</div>
                    <div class="text-xs text-gray-400 truncate">{{ h.teamName }} · {{ h.wins }}-{{ h.draws }}-{{ h.losses }}</div>
                  </div>
                  <span class="text-right shrink-0 leading-none">
                    <span class="font-black text-sm">{{ h.points }}</span>
                    <span class="block text-[9px] text-gray-400 uppercase tracking-wide">{{ 'STANDINGS.PTS_ABBR' | translate }}</span>
                  </span>
                </a>
              }
            </div>
          }
        </section>

        @if (clubs().length) {
          <section class="mb-6">
            <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">{{ 'PLAYER.FAVORITE_CLUBS' | translate }}</h2>
            <div class="card !p-0 flex flex-col divide-y divide-gray-100">
              @for (c of clubs(); track c.club) {
                <div class="flex items-center gap-3 px-4 py-2.5">
                  <span class="material-icons text-[18px] text-primary-600">shield</span>
                  <span class="flex-1 min-w-0 text-sm font-semibold truncate">{{ c.club }}</span>
                  <span class="text-xs text-gray-400 shrink-0">{{ 'PLAYER.TIMES' | translate: { count: c.played } }} · {{ c.wins }}-{{ c.draws }}-{{ c.losses }}</span>
                </div>
              }
            </div>
          </section>
        }

        @if (opponents().length) {
          <section class="mb-6">
            <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">{{ 'PLAYER.VS_OPPONENTS' | translate }}</h2>
            <div class="card !p-0 flex flex-col divide-y divide-gray-100">
              @for (o of opponents(); track o.key) {
                <a [routerLink]="['/head-to-head']" [queryParams]="{ a: key(), b: o.key }" class="flex items-center gap-3 px-4 py-2.5 no-underline text-inherit">
                  <span class="flex-1 min-w-0 text-sm font-semibold truncate">{{ o.name }}</span>
                  <span class="text-xs text-gray-400 shrink-0">{{ 'PLAYER.TIMES' | translate: { count: o.played } }}</span>
                  <span class="text-sm font-black tabular-nums shrink-0 w-16 text-right">
                    <span class="text-primary-600">{{ o.wins }}</span>-{{ o.draws }}-<span class="text-accent-red">{{ o.losses }}</span>
                  </span>
                  <span class="material-icons text-[18px] text-gray-300 shrink-0">chevron_right</span>
                </a>
              }
            </div>
          </section>
        }

        <section class="mb-6">
          <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">{{ 'PLAYER.RECENT_MATCHES' | translate }}</h2>
          @for (pm of shownMatches(); track pm.match.id) {
            <div class="flex items-center gap-2.5 py-2 border-b border-gray-100 last:border-0">
              <span class="w-6 h-6 rounded-md text-[11px] font-black flex items-center justify-center shrink-0" [class]="outcomeClass(pm)">{{ 'MY_OVERVIEW.OUTCOME_' + pm.result | translate }}</span>
              <div class="flex-1 min-w-0 leading-tight">
                <div class="text-sm font-semibold truncate">{{ 'PLAYER.VS' | translate }} {{ pm.opponentName }}</div>
                <div class="text-[11px] text-gray-400 truncate">
                  {{ tournamentName(pm.match.tournamentId) }}@if (pm.club || pm.opponentClub) { · {{ pm.club || '?' }} vs {{ pm.opponentClub || '?' }} }
                </div>
              </div>
              <span class="text-sm font-extrabold tabular-nums whitespace-nowrap shrink-0" [class]="pm.result === 'W' ? 'text-primary-600' : pm.result === 'L' ? 'text-accent-red' : 'text-gray-500'">{{ score(pm) }}</span>
            </div>
          } @empty {
            <p class="text-sm text-gray-400">{{ 'PROFILE.NO_HISTORY' | translate }}</p>
          }
          @if (allMatches().length > shownMatches().length) {
            <button type="button" class="btn-secondary w-full text-sm mt-3" (click)="limit.set(limit() + RECENT_PAGE)">{{ 'PROFILE.SHOW_MORE' | translate }}</button>
          }
        </section>
      }
    </div>
  `,
})
export class PlayerProfileComponent {
  /** Route param (`withComponentInputBinding`). */
  readonly key = input.required<string>();

  private ranking = inject(RankingService);
  private champions = inject(ChampionService);
  private images = inject(ManagerImageService);
  private tournaments = inject(TournamentService);
  private router = inject(Router);

  readonly RECENT_PAGE = RECENT_PAGE;
  limit = signal(RECENT_PAGE);

  /** The leaderboard is derived from live streams, so an empty list just means "not loaded yet". */
  rankingLoaded = computed(() => this.ranking.ranking().length > 0);

  player = computed(() => this.ranking.byKey(this.key()));
  rank = computed(() => this.ranking.ranking().findIndex((r) => playerKeyOf(r) === this.key()) + 1);
  total = computed(() => this.ranking.ranking().length);
  winRate = computed(() => {
    const p = this.player();
    return p && p.played ? Math.round((p.wins / p.played) * 100) : 0;
  });

  avatar = computed(() => initialsAvatar(this.player()?.manager));
  portrait = computed(() => {
    const p = this.player();
    return p ? this.images.byManager().get(p.manager) : undefined;
  });

  trophies = computed(() => {
    const p = this.player();
    return p ? this.champions.forManager(p) : [];
  });
  seasons = computed(() => {
    const p = this.player();
    return p ? this.ranking.historyFor(p) : [];
  });

  allMatches = computed(() => this.ranking.matchesByPlayer().get(this.key()) ?? []);
  shownMatches = computed(() => this.allMatches().slice(0, this.limit()));

  clubs = computed((): ClubStat[] => {
    const byClub = new Map<string, ClubStat>();
    for (const pm of this.allMatches()) {
      if (!pm.club) continue;
      const c = byClub.get(pm.club) ?? { club: pm.club, played: 0, wins: 0, draws: 0, losses: 0 };
      c.played++;
      if (pm.result === 'W') c.wins++;
      else if (pm.result === 'L') c.losses++;
      else c.draws++;
      byClub.set(pm.club, c);
    }
    return [...byClub.values()].sort((a, b) => b.played - a.played || b.wins - a.wins).slice(0, TOP_CLUBS);
  });

  opponents = computed((): OpponentStat[] => {
    const all = this.allMatches();
    const keys = new Map<string, string>();
    for (const pm of all) if (pm.opponentKey) keys.set(pm.opponentKey, pm.opponentName);
    return [...keys.entries()]
      .map(([key, name]) => {
        const h = headToHead(all, key);
        return { key, name, played: h.played, wins: h.aWins, draws: h.draws, losses: h.bWins };
      })
      .sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
  });

  private tournamentById = computed(() => new Map(this.tournaments.all().map((t) => [t.id, t] as const)));
  tournamentName(id: string): string {
    return this.tournamentById().get(id)?.name ?? '';
  }

  score(pm: PlayerMatch): string {
    return playerScoreText(pm);
  }

  outcomeClass(pm: PlayerMatch): string {
    return pm.result === 'W' ? 'bg-primary-500 text-white' : pm.result === 'L' ? 'bg-accent-red text-white' : 'bg-gray-300 text-gray-700';
  }

  /** Read while the navigation that created this page is still in flight. */
  private cameFromApp = !!this.router.getCurrentNavigation()?.previousNavigation;

  back(): void {
    if (this.cameFromApp) history.back();
    else this.router.navigate(['/ranking']);
  }
}
