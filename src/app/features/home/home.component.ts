import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap } from 'rxjs';
import { TournamentService } from '../tournament/tournament.service';
import { MatchService } from '../fixtures/match.service';
import { StandingsService } from '../standings/standings.service';
import { AuthService } from '../../core/services/auth.service';
import { MatchCardComponent } from '../../shared/components/match-card/match-card.component';
import { StandingRowComponent } from '../../shared/components/standing-row/standing-row.component';
import { Match } from '../../models/match.model';
import { StandingRow } from '../../models/standing.model';

/** Re-subscribes to a per-tournament observable whenever the accessor's dependency changes. */
function switchToLatest<T>(accessor: () => Observable<T[]> | null): Observable<T[]> {
  return toObservable(computed(accessor)).pipe(switchMap((obs) => obs ?? of([])));
}

/**
 * Public landing page — Givetour-inspired hero + stat strip, horizontal-scroll rails for
 * featured tournaments / upcoming matches / latest results (OneFootball-style card rhythm),
 * and a mini standings preview. Fully usable by guests (no auth required to view).
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, MatchCardComponent, StandingRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area">
      <!-- Hero -->
      <section class="relative bg-gradient-to-br from-primary-600 via-primary-700 to-surface-dark text-white px-5 pt-10 pb-8 overflow-hidden">
        <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full bg-white/5"></div>
        <div class="absolute -right-4 bottom-0 w-32 h-32 rounded-full bg-white/5"></div>
        <div class="relative max-w-3xl mx-auto text-center">
          <h1 class="text-3xl font-extrabold leading-tight">Run tournaments<br />like the pros.</h1>
          <p class="text-sm text-white/80 mt-3 max-w-xs mx-auto">
            Fixtures, live results and real-time standings — built for the pitch, not the office.
          </p>
          <a routerLink="/tournaments/create" class="inline-block mt-5 bg-white text-primary-700 font-bold rounded-xl py-3 px-6">
            Create Tournament
          </a>
        </div>
      </section>

      <!-- Stat strip -->
      <section class="grid grid-cols-3 divide-x divide-gray-100 bg-white -mt-4 mx-4 rounded-card shadow-card relative z-10">
        <div class="flex flex-col items-center py-4">
          <span class="text-xl font-extrabold text-primary-600">{{ tournaments().length }}</span>
          <span class="text-[11px] text-gray-500">Tournaments</span>
        </div>
        <div class="flex flex-col items-center py-4">
          <span class="text-xl font-extrabold text-primary-600">{{ totalTeams() }}</span>
          <span class="text-[11px] text-gray-500">Teams</span>
        </div>
        <div class="flex flex-col items-center py-4">
          <span class="text-xl font-extrabold text-primary-600">{{ totalMatches() }}</span>
          <span class="text-[11px] text-gray-500">Matches</span>
        </div>
      </section>

      <!-- Featured tournaments -->
      <section class="mt-6 px-4">
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-bold">Featured Tournaments</h2>
          <a routerLink="/tournaments" class="text-xs font-semibold text-primary-600">See all</a>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          @for (t of featuredTournaments(); track t.id) {
            <a [routerLink]="['/tournaments', t.id]" class="w-40 shrink-0 card !p-3 no-underline text-inherit">
              <div class="w-full h-20 rounded-lg bg-primary-50 flex items-center justify-center overflow-hidden mb-2">
                @if (t.image) {
                  <img [src]="t.image" class="w-full h-full object-cover" alt="" />
                } @else {
                  <span class="material-icons text-primary-400 text-2xl">emoji_events</span>
                }
              </div>
              <div class="font-semibold text-sm truncate">{{ t.name }}</div>
              <div class="text-[11px] text-gray-400 truncate">{{ t.location }}</div>
            </a>
          }
        </div>
      </section>

      <!-- Upcoming matches -->
      <section class="mt-6 px-4">
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-bold">Upcoming Matches</h2>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          @for (m of upcomingMatches(); track m.id) {
            <div class="w-64 shrink-0">
              <app-match-card [match]="m" />
            </div>
          }
        </div>
      </section>

      <!-- Latest results -->
      <section class="mt-6 px-4">
        <div class="flex items-center justify-between mb-2">
          <h2 class="font-bold">Latest Results</h2>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
          @for (m of latestResults(); track m.id) {
            <div class="w-64 shrink-0">
              <app-match-card [match]="m" />
            </div>
          }
        </div>
      </section>

      <!-- Rankings preview -->
      @if (featuredTournaments().length > 0) {
        <section class="mt-6 px-4 pb-6">
          <div class="flex items-center justify-between mb-2">
            <h2 class="font-bold">Top of the Table</h2>
            <a [routerLink]="['/tournaments', featuredTournaments()[0].id]" [queryParams]="{ tab: 'standings' }" class="text-xs font-semibold text-primary-600">
              Full table
            </a>
          </div>
          <div class="flex flex-col gap-2">
            @for (row of topStandings(); track row.teamId) {
              <app-standing-row [row]="row" />
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class HomeComponent {
  private tournamentService = inject(TournamentService);
  private matchService = inject(MatchService);
  private standingsService = inject(StandingsService);
  auth = inject(AuthService);

  tournaments = this.tournamentService.all;
  featuredTournaments = computed(() => this.tournaments().slice(0, 6));

  upcomingMatchesAll = toSignal(this.matchService.streamUpcoming(), { initialValue: [] as Match[] });
  upcomingMatches = computed(() => this.upcomingMatchesAll().slice(0, 8));

  latestResultsAll = toSignal(this.matchService.streamRecentResults(), { initialValue: [] as Match[] });
  latestResults = computed(() => this.latestResultsAll().slice(0, 8));

  private topStandingsAll = computed(() => {
    const first = this.featuredTournaments()[0];
    return first ? this.standingsService.streamRows(first.id) : null;
  });

  private topStandingsSignal = toSignal(switchToLatest(() => this.topStandingsAll()), {
    initialValue: [] as StandingRow[],
  });

  topStandings = computed(() => this.topStandingsSignal().slice(0, 5));

  totalTeams = computed(() => this.tournaments().reduce((sum, t) => sum + t.numberOfTeams, 0));
  totalMatches = computed(() => this.upcomingMatchesAll().length + this.latestResultsAll().length);
}
