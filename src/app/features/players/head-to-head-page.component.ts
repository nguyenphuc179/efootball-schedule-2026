import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RankingService, ManagerRank, PlayerMatch, headToHead, playerKeyOf, playerScoreText } from '../ranking/ranking.service';
import { ManagerImageService } from '../ranking/manager-image.service';
import { TournamentService } from '../tournament/tournament.service';
import { AppSelectComponent, AppSelectOption } from '../../shared/components/app-select/app-select.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { initialsAvatar } from '../../shared/utils/avatar.util';

/**
 * `/head-to-head?a=<key>&b=<key>` — two players' all-time record against each other across every
 * tournament. The pick lives in the URL so a comparison can be shared as a link.
 */
@Component({
  selector: 'app-head-to-head-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe, AppSelectComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <h1 class="text-xl font-extrabold mb-4">{{ 'H2H.TITLE' | translate }}</h1>

      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-5">
        <app-select class="min-w-0" [value]="a() ?? ''" [options]="optionsFor('a')" [placeholder]="'H2H.PICK_PLAYER' | translate" (valueChange)="pick('a', $event)" />
        <span class="text-xs font-black text-gray-400">VS</span>
        <app-select class="min-w-0" [value]="b() ?? ''" [options]="optionsFor('b')" [placeholder]="'H2H.PICK_PLAYER' | translate" (valueChange)="pick('b', $event)" />
      </div>

      @if (playerA() && playerB()) {
        @let s = summary();
        <div class="card !p-4 mb-5">
          <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            @for (side of sides; track side) {
              @if (side === 'mid') {
                <div class="text-center">
                  <div class="text-4xl font-black tabular-nums whitespace-nowrap">
                    <span [class]="s.aWins > s.bWins ? 'text-primary-600' : ''">{{ s.aWins }}</span>
                    <span class="text-gray-300 mx-1.5">-</span>
                    <span [class]="s.bWins > s.aWins ? 'text-primary-600' : ''">{{ s.bWins }}</span>
                  </div>
                  <div class="text-[11px] text-gray-400 mt-1 whitespace-nowrap">{{ 'H2H.WINS' | translate }} · {{ 'H2H.DRAWS' | translate: { count: s.draws } }}</div>
                </div>
              } @else {
                @let p = side === 'a' ? playerA()! : playerB()!;
                <a [routerLink]="['/players', keyOf(p)]" class="flex flex-col items-center gap-1.5 text-center no-underline text-inherit min-w-0">
                  <span class="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-lg font-black" [style.background-color]="avatar(p).bg" [style.color]="avatar(p).fg">
                    @if (portrait(p); as url) {
                      <img [src]="url" alt="" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                    } @else {
                      {{ avatar(p).initials }}
                    }
                  </span>
                  <span class="text-sm font-bold truncate max-w-full">{{ p.manager }}</span>
                </a>
              }
            }
          </div>

          @if (s.played) {
            <div class="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 text-center">
              <div>
                <div class="text-lg font-black">{{ s.played }}</div>
                <div class="text-[11px] text-gray-400">{{ 'MY_OVERVIEW.PLAYED' | translate }}</div>
              </div>
              <div>
                <div class="text-lg font-black tabular-nums">{{ s.aGoals }} - {{ s.bGoals }}</div>
                <div class="text-[11px] text-gray-400">{{ 'H2H.GOALS' | translate }}</div>
              </div>
              <div>
                <div class="text-lg font-black tabular-nums whitespace-nowrap">{{ winRate(s.aWins) }}% - {{ winRate(s.bWins) }}%</div>
                <div class="text-[11px] text-gray-400">{{ 'MY_OVERVIEW.WIN_RATE' | translate }}</div>
              </div>
            </div>
          }
        </div>

        @if (s.played) {
          <h2 class="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">{{ 'H2H.MEETINGS' | translate }}</h2>
          <div class="card !p-0 flex flex-col divide-y divide-gray-100">
            @for (pm of s.matches; track pm.match.id) {
              <a [routerLink]="['/tournaments', pm.match.tournamentId]" class="flex items-center gap-2.5 px-4 py-2.5 no-underline text-inherit">
                <span class="w-6 h-6 rounded-md text-[11px] font-black flex items-center justify-center shrink-0" [class]="outcomeClass(pm)">{{ 'MY_OVERVIEW.OUTCOME_' + pm.result | translate }}</span>
                <div class="flex-1 min-w-0 leading-tight">
                  <div class="text-sm font-semibold truncate">{{ tournamentName(pm.match.tournamentId) }}</div>
                  @if (pm.club || pm.opponentClub) {
                    <div class="text-[11px] text-gray-400 truncate">{{ pm.club || '?' }} vs {{ pm.opponentClub || '?' }}</div>
                  }
                </div>
                <span class="text-sm font-extrabold tabular-nums whitespace-nowrap shrink-0">{{ score(pm) }}</span>
              </a>
            }
          </div>
          <p class="text-[11px] text-gray-400 mt-2">{{ 'H2H.SCORE_HINT' | translate: { name: playerA()!.manager } }}</p>
        } @else {
          <app-empty-state icon="sports_kabaddi" [title]="'H2H.NEVER_MET' | translate" />
        }
      } @else {
        <app-empty-state icon="compare_arrows" [title]="'H2H.PICK_TWO_TITLE' | translate" [subtitle]="'H2H.PICK_TWO_SUBTITLE' | translate" />
      }
    </div>
  `,
})
export class HeadToHeadPageComponent {
  /** Query params (`withComponentInputBinding`). */
  readonly a = input<string>();
  readonly b = input<string>();

  private ranking = inject(RankingService);
  private images = inject(ManagerImageService);
  private tournaments = inject(TournamentService);
  private router = inject(Router);

  readonly sides = ['a', 'mid', 'b'] as const;

  playerA = computed(() => (this.a() ? this.ranking.byKey(this.a()!) : undefined));
  playerB = computed(() => (this.b() ? this.ranking.byKey(this.b()!) : undefined));

  summary = computed(() => headToHead(this.ranking.matchesByPlayer().get(this.a() ?? '') ?? [], this.b() ?? ''));
  winRate(wins: number): number {
    const played = this.summary().played;
    return played ? Math.round((wins / played) * 100) : 0;
  }

  /** Everyone on the leaderboard except whoever is already picked on the other side. */
  optionsFor(side: 'a' | 'b'): AppSelectOption[] {
    const other = side === 'a' ? this.b() : this.a();
    return this.ranking
      .ranking()
      .filter((r) => playerKeyOf(r) !== other)
      .map((r) => ({ value: playerKeyOf(r), label: r.manager }));
  }

  pick(side: 'a' | 'b', key: string): void {
    this.router.navigate([], { queryParams: { [side]: key || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  keyOf(p: ManagerRank): string {
    return playerKeyOf(p);
  }

  avatar(p: ManagerRank) {
    return initialsAvatar(p.manager);
  }

  portrait(p: ManagerRank): string | undefined {
    return this.images.byManager().get(p.manager);
  }

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
}
