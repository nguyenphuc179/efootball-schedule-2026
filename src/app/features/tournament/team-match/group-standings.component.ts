import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { MatchService } from '../../fixtures/match.service';
import { TeamService } from '../../teams/team.service';
import { Match } from '../../../models/match.model';
import { Team, teamGroup } from '../../../models/team.model';
import { GroupKey, GroupStats, compareGroups, computeGroupStats } from './group-stats.util';

interface GroupRow extends GroupStats {
  key: GroupKey;
  position: number;
  members: number;
}

/** Two-row group table for `team_match` tournaments, ranked by points → goal difference → goals scored. */
@Component({
  selector: 'app-group-standings',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length > 0) {
      <div class="flex flex-col gap-2">
        <h3 class="text-sm font-extrabold uppercase tracking-wide text-gray-700">{{ 'TEAM_MATCH.GROUP_STANDINGS' | translate }}</h3>
        <div class="hscroll-table card !p-0">
          <table class="w-full text-sm">
            <thead class="text-gray-400 text-[11px] uppercase">
              <tr class="border-b border-gray-100">
                <th class="text-left py-2 pl-3 pr-1 w-9">#</th>
                <th class="text-left py-2 px-1">{{ 'TEAM_FORM.GROUP' | translate }}</th>
                <th class="py-2 px-2">{{ 'STANDINGS_VIEW.PLD' | translate }}</th>
                <th class="py-2 px-2 whitespace-nowrap">{{ 'STANDINGS_VIEW.W_D_L' | translate }}</th>
                <th class="py-2 px-2">+/-</th>
                <th class="py-2 px-3 text-gray-500 font-bold">{{ 'STANDINGS.PTS_ABBR' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.key) {
                <tr class="border-b border-gray-50 last:border-0">
                  <td class="py-2 pl-3 pr-1">
                    <span
                      class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                      [class]="row.position === 1 && row.played > 0 ? 'bg-amber-100 text-amber-700' : 'text-gray-500'"
                    >{{ row.position }}</span>
                  </td>
                  <td class="py-2 px-1 font-medium whitespace-nowrap">
                    {{ (row.key === 'A' ? 'TEAM_MATCH.GROUP_A' : 'TEAM_MATCH.GROUP_B') | translate }}
                    <span class="text-xs text-gray-400">({{ row.members }})</span>
                  </td>
                  <td class="py-2 px-2 text-center text-gray-600">{{ row.played }}</td>
                  <td class="py-2 px-2 text-center whitespace-nowrap">{{ row.wins }}-{{ row.draws }}-{{ row.losses }}</td>
                  <td class="py-2 px-2 text-center whitespace-nowrap">
                    <span class="hidden sm:inline">{{ row.goalsFor }}/{{ row.goalsAgainst }}</span>
                    <span [class]="row.goalDifference > 0 ? 'text-primary-600' : row.goalDifference < 0 ? 'text-accent-red' : 'text-gray-400'">
                      <span class="hidden sm:inline">(</span>{{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }}<span class="hidden sm:inline">)</span>
                    </span>
                  </td>
                  <td class="py-2 px-3 text-center font-extrabold">{{ row.points }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="text-[11px] text-gray-400">{{ 'TEAM_MATCH.TIEBREAK_HINT' | translate }}</p>
      </div>
    }
  `,
})
export class GroupStandingsComponent {
  readonly tournamentId = input.required<string>();

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);

  private teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );
  private matches = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.matchService.streamByTournament(id))),
    { initialValue: [] as Match[] }
  );

  rows = computed((): GroupRow[] => {
    const a = this.teams().filter((t) => teamGroup(t) === 'A');
    const b = this.teams().filter((t) => teamGroup(t) === 'B');
    if (a.length === 0 || b.length === 0) return [];

    const stats = computeGroupStats(this.matches(), new Set(a.map((t) => t.id)), new Set(b.map((t) => t.id)));
    const { leader } = compareGroups(stats.A, stats.B);
    const order: GroupKey[] = leader === 'B' ? ['B', 'A'] : ['A', 'B'];
    const members = { A: a.length, B: b.length };
    const tied = leader === null;
    return order.map((key, i) => ({ ...stats[key], key, members: members[key], position: tied ? 1 : i + 1 }));
  });
}
