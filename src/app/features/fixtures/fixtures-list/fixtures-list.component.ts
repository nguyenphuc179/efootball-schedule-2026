import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatchService } from '../match.service';
import { FixtureGeneratorService } from '../fixture-generator.service';
import { KnockoutSeedDialogComponent } from '../knockout-seed-dialog.component';
import { TeamService } from '../../teams/team.service';
import { TeamAvatarService } from '../../teams/team-avatar.service';
import { TournamentService } from '../../tournament/tournament.service';
import { AuthService } from '../../../core/services/auth.service';
import { MatchRowComponent } from '../../../shared/components/match-row/match-row.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { Match } from '../../../models/match.model';
import { Team } from '../../../models/team.model';

/**
 * Used both as the "Fixtures" AND "Results" tab of Tournament Detail (filter toggle), and — with
 * no `tournamentId` input — as the cross-tournament `/matches` screen (Flashscore-style feed).
 *
 * Group-stage tournaments use the dedicated Group Stage / Final Stage tabs instead of this list.
 */
@Component({
  selector: 'app-fixtures-list',
  standalone: true,
  imports: [CommonModule, MatchRowComponent, EmptyStateComponent, LoadingSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (auth.isAdmin() && tournamentId()) {
        <button
          class="btn-primary self-start flex items-center gap-1 !py-2 !px-4 text-sm"
          [disabled]="isGenerating()"
          (click)="generateFixtures()"
        >
          <span class="material-icons text-[18px]">auto_fix_high</span>
          {{ isGenerating() ? 'Generating…' : 'Generate Fixtures' }}
        </button>
      }

      @if (isGenerating()) {
        <app-loading-spinner label="Generating fixtures…" />
      }

      @if (grouped().length === 0 && !isGenerating()) {
        <app-empty-state icon="event" title="No matches scheduled" subtitle="Fixtures will appear here once generated." />
      } @else {
        @for (group of grouped(); track group.round) {
          <div>
            <h3 class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">{{ group.round }}</h3>
            <div class="flex flex-col gap-2">
              @for (m of group.matches; track m.id) {
                <app-match-row
                  [match]="m"
                  [managers]="managerByTeam()"
                  [avatars]="avatarsByTeam()"
                  [showRound]="false"
                  [showResultLink]="auth.isAdmin() && m.status !== 'completed'"
                />
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class FixturesListComponent {
  readonly tournamentId = input<string>();
  /** 'all' | 'upcoming' | 'completed' — used by the Fixtures vs Results tabs. */
  readonly filter = input<'all' | 'upcoming' | 'completed'>('all');

  private matchService = inject(MatchService);
  private fixtureGenerator = inject(FixtureGeneratorService);
  private teamService = inject(TeamService);
  private teamAvatars = inject(TeamAvatarService);
  private tournamentService = inject(TournamentService);
  private dialog = inject(MatDialog);
  private breakpoints = inject(BreakpointObserver);
  auth = inject(AuthService);

  isGenerating = signal(false);

  private matches = toSignal(
    toObservable(this.tournamentId).pipe(
      switchMap((id) =>
        id ? this.matchService.streamByTournament(id) : this.matchService.streamUpcoming()
      )
    ),
    { initialValue: [] as Match[] }
  );

  private teams = toSignal(
    toObservable(this.tournamentId).pipe(
      switchMap((id) => (id ? this.teamService.streamByTournament(id) : of([] as Team[])))
    ),
    { initialValue: [] as Team[] }
  );
  managerByTeam = computed(() =>
    Object.fromEntries(this.teams().filter((t) => t.manager).map((t) => [t.id, t.manager]))
  );
  avatarsByTeam = computed(() => this.teamAvatars.byId(this.teams()));

  filtered = computed(() => {
    const list = this.matches();
    if (this.filter() === 'upcoming') return list.filter((m) => m.status !== 'completed');
    if (this.filter() === 'completed') return list.filter((m) => m.status === 'completed');
    return list;
  });

  grouped = computed(() => {
    const byRound = new Map<string, Match[]>();
    for (const m of this.filtered()) {
      const arr = byRound.get(m.round) ?? [];
      arr.push(m);
      byRound.set(m.round, arr);
    }
    return [...byRound.entries()].map(([round, matches]) => ({ round, matches }));
  });

  async generateFixtures(): Promise<void> {
    const id = this.tournamentId();
    if (!id) return;
    const [tournament, teams] = await Promise.all([
      this.tournamentService.getOnce(id),
      this.teamService.getByTournamentOnce(id),
    ]);
    if (!tournament || teams.length < 2) return;

    // Knockout: let the admin set the round-1 seeding (drag to reorder, or shuffle) instead of
    // always pairing teams alphabetically.
    if (tournament.type === 'knockout') {
      const isMobile = this.breakpoints.isMatched('(max-width: 767px)');
      this.dialog.open(KnockoutSeedDialogComponent, {
        data: { tournamentId: id, teams, startDate: tournament.startDate, location: tournament.location },
        width: isMobile ? '100vw' : '480px',
        height: isMobile ? '100dvh' : 'auto',
        maxHeight: isMobile ? '100dvh' : '85vh',
        maxWidth: '100vw',
        panelClass: isMobile ? 'fullscreen-dialog' : undefined,
      });
      return;
    }

    this.isGenerating.set(true);
    try {
      await this.fixtureGenerator.generateAndSave(
        id,
        tournament.type,
        teams,
        tournament.startDate,
        tournament.location
      );
    } finally {
      this.isGenerating.set(false);
    }
  }
}
