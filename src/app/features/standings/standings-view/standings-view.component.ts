import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { StandingsService } from '../standings.service';
import { TournamentService } from '../../tournament/tournament.service';
import { TeamService } from '../../teams/team.service';
import { TeamAvatarService } from '../../teams/team-avatar.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StandingRow } from '../../../models/standing.model';
import { Team } from '../../../models/team.model';
import { initialsAvatar } from '../../../shared/utils/avatar.util';

/**
 * Standings as one table per group (GiveTour-style): rank, team, played, W-D-L, goals +/-, points
 * and recent form. The two qualifying spots per group are highlighted.
 *
 * With no `tournamentId` input this becomes the `/standings` route: a tournament picker followed
 * by the same rendering, so guests/viewers can check any tournament's table from the bottom-nav.
 */
@Component({
  selector: 'app-standings-view',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @if (canRecalc()) {
        <button
          class="btn-secondary !py-1.5 !px-3 text-xs self-end flex items-center gap-1"
          [disabled]="recalculating()"
          (click)="recalculate()"
        >
          <span class="material-icons text-[16px]">refresh</span>
          {{ recalculating() ? 'Recalculating…' : 'Recalculate' }}
        </button>
      }

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

      @if (groups().length === 0) {
        <app-empty-state icon="leaderboard" title="No standings yet" subtitle="Standings update automatically once results are entered." />
      } @else {
        @for (group of groups(); track group.name) {
          <div class="flex flex-col gap-2">
            @if (group.name) {
              <h3 class="text-sm font-extrabold uppercase tracking-wide text-gray-700">{{ group.name }}</h3>
            }
            <div class="hscroll-table card !p-0">
              <table class="w-full text-sm min-w-[460px]">
                <thead class="text-gray-400 text-[11px] uppercase">
                  <tr class="border-b border-gray-100">
                    <th class="text-left py-2 pl-3 pr-1 w-9">#</th>
                    <th class="text-left py-2 px-1">Team</th>
                    <th class="py-2 px-2">PLD</th>
                    <th class="py-2 px-2 whitespace-nowrap">W-D-L</th>
                    <th class="py-2 px-2">+/-</th>
                    <th class="py-2 px-2 text-gray-500 font-bold">Pts</th>
                    <th class="py-2 px-3 text-left">Form</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of group.rows; track row.teamId) {
                    <tr class="border-b border-gray-50 last:border-0">
                      <td class="py-2 pl-3 pr-1">
                        <span
                          class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                          [class]="group.qualifiers && row.position <= group.qualifiers ? 'bg-amber-100 text-amber-700' : 'text-gray-500'"
                        >{{ row.position }}</span>
                      </td>
                      <td class="py-2 px-1">
                        <div class="flex items-center gap-2 min-w-0">
                          @if (avatar(row).src; as src) {
                            <img [src]="src" [alt]="row.teamName" class="w-6 h-6 rounded-full object-cover shrink-0" width="24" height="24" />
                          } @else {
                            <span
                              class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              [style.background-color]="avatar(row).bg"
                              [style.color]="avatar(row).fg"
                            >{{ avatar(row).initials }}</span>
                          }
                          <span class="font-medium truncate">{{ teamLabel(row) }}</span>
                        </div>
                      </td>
                      <td class="py-2 px-2 text-center text-gray-600">{{ row.played }}</td>
                      <td class="py-2 px-2 text-center whitespace-nowrap">{{ row.won }} - {{ row.drawn }} - {{ row.lost }}</td>
                      <td class="py-2 px-2 text-center whitespace-nowrap">
                        {{ row.goalsFor }}/{{ row.goalsAgainst }}
                        <span [class]="row.goalDifference > 0 ? 'text-primary-600' : row.goalDifference < 0 ? 'text-accent-red' : 'text-gray-400'">
                          ({{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }})
                        </span>
                      </td>
                      <td class="py-2 px-2 text-center font-extrabold">{{ row.points }}</td>
                      <td class="py-2 px-3">
                        <div class="flex gap-1">
                          @for (f of row.form; track $index) {
                            <span
                              class="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold"
                              [class]="formClass(f)"
                            >{{ f }}</span>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class StandingsViewComponent {
  readonly tournamentId = input<string>();

  private standingsService = inject(StandingsService);
  private tournamentService = inject(TournamentService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private auth = inject(AuthService);

  selectedTournamentId = signal<string>('');
  tournaments = this.tournamentService.all;
  recalculating = signal(false);

  constructor() {
    // Auto-select the first ongoing (else first) tournament when used as the standalone /standings route.
    queueMicrotask(() => {
      if (!this.tournamentId() && !this.selectedTournamentId()) {
        const list = this.tournaments();
        const first = list.find((t) => t.status === 'in_progress') ?? list[0];
        if (first) this.selectedTournamentId.set(first.id);
      }
    });
  }

  private effectiveTournamentId = computed(() => this.tournamentId() ?? this.selectedTournamentId());

  canRecalc = computed(() => this.auth.isAdmin() && !!this.effectiveTournamentId());

  /** Manual reconcile — also prunes "ghost" rows for teams that were deleted after fixtures existed. */
  async recalculate(): Promise<void> {
    const id = this.effectiveTournamentId();
    if (!id || this.recalculating()) return;
    this.recalculating.set(true);
    try {
      await this.standingsService.recalculate(id);
    } catch (err) {
      console.error('[Standings] manual recalculate', err);
    } finally {
      this.recalculating.set(false);
    }
  }

  private rows = toSignal(
    toObservable(this.effectiveTournamentId).pipe(
      switchMap((id) => this.standingsService.streamRows(id || '__none__'))
    ),
    { initialValue: [] as StandingRow[] }
  );

  private teams = toSignal(
    toObservable(this.effectiveTournamentId).pipe(
      switchMap((id) => (id ? this.teamService.streamByTournament(id) : of([] as Team[])))
    ),
    { initialValue: [] as Team[] }
  );
  private teamById = computed(() => new Map(this.teams().map((t) => [t.id, t] as const)));
  private managerByTeam = computed(() =>
    Object.fromEntries(this.teams().filter((t) => t.manager).map((t) => [t.id, t.manager]))
  );

  /** Same picture/initials resolution as the Teams tab, keyed off the live team behind each row. */
  avatar(row: StandingRow) {
    const team = this.teamById().get(row.teamId);
    if (team) return this.teamAvatars.resolve(team);
    return { ...initialsAvatar(row.teamName), src: row.teamLogo };
  }

  teamLabel(row: StandingRow): string {
    const manager = this.managerByTeam()[row.teamId];
    return manager ? `${row.teamName}_${manager}` : row.teamName;
  }

  /** One block per group (a single unnamed block for non-group tournaments). */
  groups = computed(() => {
    const byGroup = new Map<string | null, StandingRow[]>();
    for (const row of this.rows()) {
      const bucket = byGroup.get(row.groupName) ?? [];
      bucket.push(row);
      byGroup.set(row.groupName, bucket);
    }
    const multiGroup = byGroup.size > 1;
    return [...byGroup.entries()]
      .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''))
      .map(([name, rows]) => ({
        name,
        rows: [...rows].sort((x, y) => x.position - y.position),
        // Two qualify per group in a group+knockout tournament; no highlight otherwise.
        qualifiers: multiGroup && name ? 2 : 0,
      }));
  });

  formClass(result: 'W' | 'D' | 'L'): string {
    if (result === 'W') return 'bg-primary-500 text-white';
    if (result === 'L') return 'bg-accent-red text-white';
    return 'bg-gray-300 text-gray-700';
  }
}
