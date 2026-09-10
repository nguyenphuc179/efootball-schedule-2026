import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { MatchService } from '../match.service';
import { FixtureGeneratorService } from '../fixture-generator.service';
import { TeamService } from '../../teams/team.service';
import { TournamentService } from '../../tournament/tournament.service';
import { AuthService } from '../../../core/services/auth.service';
import { MatchCardComponent } from '../../../shared/components/match-card/match-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { Match } from '../../../models/match.model';

/**
 * Used both as the "Fixtures" AND "Results" tab of Tournament Detail (filter toggle), and — with
 * no `tournamentId` input — as the cross-tournament `/matches` screen (Flashscore-style feed).
 *
 * Group-stage tournaments use the dedicated Group Stage / Final Stage tabs instead of this list.
 */
@Component({
  selector: 'app-fixtures-list',
  standalone: true,
  imports: [CommonModule, MatchCardComponent, EmptyStateComponent, LoadingSpinnerComponent],
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
                <app-match-card [match]="m" [showResultLink]="auth.isAdmin() && m.status !== 'completed'" />
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
  private tournamentService = inject(TournamentService);
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
    this.isGenerating.set(true);
    try {
      const [tournament, teams] = await Promise.all([
        this.tournamentService.getOnce(id),
        this.teamService.getByTournamentOnce(id),
      ]);
      if (!tournament) return;
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
