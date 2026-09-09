import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatchService } from '../../fixtures/match.service';
import { ResultService } from '../result.service';
import { TeamService } from '../../teams/team.service';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { Match } from '../../../models/match.model';
import { Team } from '../../../models/team.model';

/**
 * One-handed result entry: large +/- steppers (no keyboard), thumb-reachable Save button.
 * Matches the spec's mockup exactly: Team A [ score ] VS [ score ] Team B, then Save Result.
 */
@Component({
  selector: 'app-result-entry',
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="router.navigate(['..'])">
          <span class="material-icons">arrow_back</span>
        </button>
        <h1 class="font-bold ml-1">Enter Result</h1>
      </div>

      @if (!match()) {
        <app-loading-spinner label="Loading match…" />
      } @else {
        <div class="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-8">
          <div class="flex items-center justify-center gap-8 w-full max-w-sm">
            <div class="flex flex-col items-center gap-3 flex-1">
              <div class="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center overflow-hidden">
                @if (homeTeam()?.logo) {
                  <img [src]="homeTeam()!.logo" class="w-full h-full object-cover" />
                } @else {
                  <span class="material-icons text-primary-400 text-2xl">shield</span>
                }
              </div>
              <div class="font-semibold text-sm text-center">{{ match()!.homeTeamName ?? homeTeam()?.teamName }}</div>
              <div class="flex flex-col items-center gap-1">
                <button class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="inc('home')">
                  <span class="material-icons">expand_less</span>
                </button>
                <div class="text-4xl font-extrabold w-16 text-center tabular-nums">{{ homeScore() }}</div>
                <button class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="dec('home')">
                  <span class="material-icons">expand_more</span>
                </button>
              </div>
            </div>

            <div class="font-bold text-gray-300 text-lg">VS</div>

            <div class="flex flex-col items-center gap-3 flex-1">
              <div class="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center overflow-hidden">
                @if (awayTeam()?.logo) {
                  <img [src]="awayTeam()!.logo" class="w-full h-full object-cover" />
                } @else {
                  <span class="material-icons text-primary-400 text-2xl">shield</span>
                }
              </div>
              <div class="font-semibold text-sm text-center">{{ match()!.awayTeamName ?? awayTeam()?.teamName }}</div>
              <div class="flex flex-col items-center gap-1">
                <button class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="inc('away')">
                  <span class="material-icons">expand_less</span>
                </button>
                <div class="text-4xl font-extrabold w-16 text-center tabular-nums">{{ awayScore() }}</div>
                <button class="w-11 h-11 rounded-full bg-surface-muted flex items-center justify-center active:bg-gray-200" (click)="dec('away')">
                  <span class="material-icons">expand_more</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-gray-100">
          <button class="btn-primary w-full" [disabled]="isSaving()" (click)="save()">
            {{ isSaving() ? 'Saving…' : 'Save Result' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ResultEntryComponent {
  private route = inject(ActivatedRoute);
  router = inject(Router);
  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private resultService = inject(ResultService);

  private matchId = this.route.snapshot.paramMap.get('id')!;
  match = signal<Match | undefined>(undefined);
  homeTeam = signal<Team | undefined>(undefined);
  awayTeam = signal<Team | undefined>(undefined);

  homeScore = signal(0);
  awayScore = signal(0);
  isSaving = signal(false);

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    const found = await this.matchService.getById(this.matchId);
    if (!found) return;
    this.match.set(found);
    this.homeScore.set(found.homeScore ?? 0);
    this.awayScore.set(found.awayScore ?? 0);

    const teams = await this.teamService.getByTournamentOnce(found.tournamentId);
    this.homeTeam.set(teams.find((t) => t.id === found.homeTeamId));
    this.awayTeam.set(teams.find((t) => t.id === found.awayTeamId));
  }

  inc(side: 'home' | 'away'): void {
    if (side === 'home') this.homeScore.update((v) => v + 1);
    else this.awayScore.update((v) => v + 1);
  }

  dec(side: 'home' | 'away'): void {
    if (side === 'home') this.homeScore.update((v) => Math.max(0, v - 1));
    else this.awayScore.update((v) => Math.max(0, v - 1));
  }

  async save(): Promise<void> {
    const m = this.match();
    if (!m) return;
    this.isSaving.set(true);
    try {
      await this.resultService.saveResult(m, this.homeScore(), this.awayScore());
      this.router.navigate(['/tournaments', m.tournamentId], { queryParams: { tab: 'results' } });
    } finally {
      this.isSaving.set(false);
    }
  }
}
