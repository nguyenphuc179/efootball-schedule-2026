import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { MatchService } from '../../fixtures/match.service';
import { Match } from '../../../models/match.model';
import { computeFootballClubStats } from './club-rules.util';

/** team_match statistics: how each real-world football club (Real Madrid, …) performed. */
@Component({
  selector: 'app-football-club-stats',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 mb-6">
      <h3 class="text-sm font-extrabold uppercase tracking-wide text-gray-700">{{ 'TEAM_MATCH.CLUB_STATS_TITLE' | translate }}</h3>

      @if (stats().length === 0) {
        <p class="text-sm text-gray-400">{{ 'TEAM_MATCH.CLUB_STATS_EMPTY' | translate }}</p>
      } @else {
        <div class="grid grid-cols-2 gap-3">
          <div class="card !p-3 text-center">
            <div class="text-[11px] uppercase tracking-wide text-gray-400">{{ 'TEAM_MATCH.MOST_WINS' | translate }}</div>
            <div class="font-bold mt-1">{{ mostWins().clubs }}</div>
            <div class="text-xs text-gray-500">{{ mostWins().value }} {{ 'TEAM_MATCH.WINS_UNIT' | translate }}</div>
          </div>
          <div class="card !p-3 text-center">
            <div class="text-[11px] uppercase tracking-wide text-gray-400">{{ 'TEAM_MATCH.MOST_GOALS' | translate }}</div>
            <div class="font-bold mt-1">{{ mostGoals().clubs }}</div>
            <div class="text-xs text-gray-500">{{ mostGoals().value }} {{ 'TEAM_MATCH.GOALS_UNIT' | translate }}</div>
          </div>
        </div>

        <div class="hscroll-table card !p-0">
          <table class="w-full text-sm min-w-[420px]">
            <thead class="text-gray-400 text-[11px] uppercase">
              <tr class="border-b border-gray-100">
                <th class="text-left py-2 pl-3 pr-1 w-9">#</th>
                <th class="text-left py-2 px-1">{{ 'TEAM_MATCH.FOOTBALL_CLUB' | translate }}</th>
                <th class="py-2 px-2">{{ 'STANDINGS_VIEW.PLD' | translate }}</th>
                <th class="py-2 px-2 whitespace-nowrap">{{ 'STANDINGS_VIEW.W_D_L' | translate }}</th>
                <th class="py-2 px-2">+/-</th>
                <th class="py-2 px-3 text-gray-500 font-bold">{{ 'STANDINGS.PTS_ABBR' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of stats(); track row.club; let i = $index) {
                <tr class="border-b border-gray-50 last:border-0">
                  <td class="py-2 pl-3 pr-1 text-gray-500 text-xs font-bold">{{ i + 1 }}</td>
                  <td class="py-2 px-1 font-medium">{{ row.club }}</td>
                  <td class="py-2 px-2 text-center text-gray-600">{{ row.played }}</td>
                  <td class="py-2 px-2 text-center whitespace-nowrap">{{ row.wins }} - {{ row.draws }} - {{ row.losses }}</td>
                  <td class="py-2 px-2 text-center whitespace-nowrap">
                    {{ row.goalsFor }}/{{ row.goalsAgainst }}
                    <span [class]="row.goalDifference > 0 ? 'text-primary-600' : row.goalDifference < 0 ? 'text-accent-red' : 'text-gray-400'">
                      ({{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }})
                    </span>
                  </td>
                  <td class="py-2 px-3 text-center font-extrabold">{{ row.points }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class FootballClubStatsComponent {
  readonly tournamentId = input.required<string>();

  private matchService = inject(MatchService);

  private matches = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.matchService.streamByTournament(id))),
    { initialValue: [] as Match[] }
  );

  stats = computed(() => computeFootballClubStats(this.matches()));

  /** Top value, naming every club tied on it. */
  private leaders(pick: (s: ReturnType<typeof computeFootballClubStats>[number]) => number) {
    const list = this.stats();
    const value = Math.max(...list.map(pick));
    return { value, clubs: list.filter((s) => pick(s) === value).map((s) => s.club).join(', ') };
  }

  mostWins = computed(() => this.leaders((s) => s.wins));
  mostGoals = computed(() => this.leaders((s) => s.goalsFor));
}
