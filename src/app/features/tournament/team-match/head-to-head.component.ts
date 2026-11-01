import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { MatchService } from '../../fixtures/match.service';
import { TeamService } from '../../teams/team.service';
import { Match } from '../../../models/match.model';
import { Team } from '../../../models/team.model';
import { H2HCell, buildHeadToHead } from './head-to-head.util';
import { playerLabel } from '../../../shared/utils/player-label.util';

/** Group A × Group B grid of who beat whom (read from the row player's side). */
@Component({
  selector: 'app-head-to-head',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (matrix().rows.length > 0 && matrix().cols.length > 0) {
      <div class="flex flex-col gap-2 mb-6">
        <h3 class="text-sm font-extrabold uppercase tracking-wide text-gray-700">{{ 'TEAM_MATCH.H2H_TITLE' | translate }}</h3>
        <div class="hscroll-table card !p-0">
          <table class="text-sm">
            <thead class="text-gray-400 text-[11px]">
              <tr class="border-b border-gray-100">
                <th class="text-left py-2 pl-3 pr-2 sticky left-0 bg-white">{{ 'TEAM_MATCH.GROUP_A' | translate }} ↓ / {{ 'TEAM_MATCH.GROUP_B' | translate }} →</th>
                @for (col of matrix().cols; track col.id) {
                  <th class="py-2 px-2 font-semibold whitespace-nowrap">{{ label(col) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of matrix().rows; track row.id) {
                <tr class="border-b border-gray-50 last:border-0">
                  <td class="py-2 pl-3 pr-2 font-medium whitespace-nowrap sticky left-0 bg-white">{{ label(row) }}</td>
                  @for (col of matrix().cols; track col.id) {
                    <td class="py-2 px-2 text-center">
                      @if (cell(row.id, col.id); as c) {
                        <span class="inline-block min-w-[3rem] rounded px-1.5 py-0.5 text-xs font-bold tabular-nums" [class]="cellClass(c)">
                          {{ c.rowGoals }} - {{ c.colGoals }}
                        </span>
                      } @else {
                        <span class="text-gray-300">–</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="text-[11px] text-gray-400">{{ 'TEAM_MATCH.H2H_HINT' | translate }}</p>
      </div>
    }
  `,
})
export class HeadToHeadComponent {
  readonly tournamentId = input.required<string>();

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);

  private matches = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.matchService.streamByTournament(id))),
    { initialValue: [] as Match[] }
  );
  private teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );

  matrix = computed(() => buildHeadToHead(this.matches(), this.teams()));

  cell(rowId: string, colId: string): H2HCell | undefined {
    return this.matrix().cells.get(rowId + '|' + colId);
  }

  label(team: Team): string {
    return playerLabel(team.teamName, team.manager);
  }

  cellClass(c: H2HCell): string {
    if (c.result === 'W') return 'bg-primary-500 text-white';
    if (c.result === 'L') return 'bg-accent-red text-white';
    return 'bg-gray-300 text-gray-700';
  }
}
