import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { StandingsService } from '../standings.service';
import { TournamentService } from '../../tournament/tournament.service';
import { StandingRowComponent } from '../../../shared/components/standing-row/standing-row.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StandingRow } from '../../../models/standing.model';
import { Tournament } from '../../../models/tournament.model';

/**
 * Renders standings as stacked cards by default (Sofascore-style, no data table on mobile), with
 * a "Table view" toggle that reveals a horizontally-scrollable table for power users/desktop —
 * exactly the two layouts called for in the spec.
 *
 * With no `tournamentId` input this becomes the `/standings` route: a tournament picker followed
 * by the same rendering, so guests/viewers can check any active tournament's table from the
 * bottom-nav "Standings" tab directly.
 */
@Component({
  selector: 'app-standings-view',
  standalone: true,
  imports: [CommonModule, StandingRowComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (!tournamentId()) {
        <div class="flex gap-2 overflow-x-auto pb-1">
          @for (t of tournaments(); track t.id) {
            <button
              class="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap"
              [class]="selectedTournamentId() === t.id ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'"
              (click)="selectedTournamentId.set(t.id)"
            >
              {{ t.name }}
            </button>
          }
        </div>
      }

      @if (groupedRows().length > 1) {
        <div class="flex gap-2 overflow-x-auto">
          @for (group of groupedRows(); track group.groupName) {
            <button
              class="px-3 py-1.5 rounded-lg text-xs font-semibold"
              [class]="activeGroup() === group.groupName ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'"
              (click)="activeGroup.set(group.groupName)"
            >
              {{ group.groupName }}
            </button>
          }
        </div>
      }

      <div class="flex items-center justify-end">
        <button
          class="text-xs font-semibold text-gray-500 flex items-center gap-1"
          (click)="tableView.set(!tableView())"
        >
          <span class="material-icons text-[16px]">{{ tableView() ? 'view_agenda' : 'table_chart' }}</span>
          {{ tableView() ? 'Card view' : 'Table view' }}
        </button>
      </div>

      @if (activeRows().length === 0) {
        <app-empty-state icon="leaderboard" title="No standings yet" subtitle="Standings update automatically once results are entered." />
      } @else if (tableView()) {
        <div class="hscroll-table card !p-0">
          <table class="w-full text-sm min-w-[520px]">
            <thead class="text-gray-400 text-xs uppercase">
              <tr class="border-b border-gray-100">
                <th class="text-left py-2 px-3">#</th>
                <th class="text-left py-2 px-3">Team</th>
                <th class="py-2 px-2">P</th>
                <th class="py-2 px-2">W</th>
                <th class="py-2 px-2">D</th>
                <th class="py-2 px-2">L</th>
                <th class="py-2 px-2">GF</th>
                <th class="py-2 px-2">GA</th>
                <th class="py-2 px-2">GD</th>
                <th class="py-2 px-3 font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              @for (row of activeRows(); track row.teamId) {
                <tr class="border-b border-gray-50 last:border-0">
                  <td class="py-2 px-3 font-semibold text-gray-500">{{ row.position }}</td>
                  <td class="py-2 px-3 font-medium whitespace-nowrap">{{ row.teamName }}</td>
                  <td class="py-2 px-2 text-center">{{ row.played }}</td>
                  <td class="py-2 px-2 text-center">{{ row.won }}</td>
                  <td class="py-2 px-2 text-center">{{ row.drawn }}</td>
                  <td class="py-2 px-2 text-center">{{ row.lost }}</td>
                  <td class="py-2 px-2 text-center">{{ row.goalsFor }}</td>
                  <td class="py-2 px-2 text-center">{{ row.goalsAgainst }}</td>
                  <td class="py-2 px-2 text-center">{{ row.goalDifference }}</td>
                  <td class="py-2 px-3 text-center font-bold">{{ row.points }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="flex flex-col gap-2">
          @for (row of activeRows(); track row.teamId) {
            <app-standing-row [row]="row" />
          }
        </div>
      }
    </div>
  `,
})
export class StandingsViewComponent {
  readonly tournamentId = input<string>();

  private standingsService = inject(StandingsService);
  private tournamentService = inject(TournamentService);

  tableView = signal(false);
  activeGroup = signal<string | null>(null);
  selectedTournamentId = signal<string>('');

  tournaments = this.tournamentService.all;

  constructor() {
    // Auto-select the first ongoing (else first) tournament when used as the standalone /standings route.
    queueMicrotask(() => {
      if (!this.tournamentId() && !this.selectedTournamentId()) {
        const list = this.tournaments();
        const first = list.find((t) => t.status === 'ongoing') ?? list[0];
        if (first) this.selectedTournamentId.set(first.id);
      }
    });
  }

  private effectiveTournamentId = computed(() => this.tournamentId() ?? this.selectedTournamentId());

  private rows = toSignal(
    toObservable(this.effectiveTournamentId).pipe(
      switchMap((id) => this.standingsService.streamRows(id || '__none__'))
    ),
    { initialValue: [] as StandingRow[] }
  );

  groupedRows = computed(() => {
    const byGroup = new Map<string | null, StandingRow[]>();
    for (const row of this.rows()) {
      const arr = byGroup.get(row.groupName) ?? [];
      arr.push(row);
      byGroup.set(row.groupName, arr);
    }
    return [...byGroup.entries()].map(([groupName, rows]) => ({ groupName, rows }));
  });

  activeRows = computed(() => {
    const groups = this.groupedRows();
    if (groups.length <= 1) return groups[0]?.rows ?? [];
    const active = this.activeGroup() ?? groups[0]?.groupName ?? null;
    return groups.find((g) => g.groupName === active)?.rows ?? [];
  });
}
