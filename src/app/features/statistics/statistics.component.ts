import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { StatisticsService, TournamentStatistics } from './statistics.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

/**
 * Doughnut (win distribution) + Bar (goals per round) charts, sized and configured for
 * small mobile viewports (compact legends, responsive: true, maintainAspectRatio: false with a
 * fixed-height wrapper so charts never blow out the layout on narrow screens).
 */
@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, LoadingSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!stats()) {
      <app-loading-spinner label="Crunching numbers…" />
    } @else {
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ stats()!.totalMatches }}</div>
          <div class="text-xs text-gray-500">Total Matches</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ stats()!.totalGoals }}</div>
          <div class="text-xs text-gray-500">Total Goals</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ stats()!.averageGoalsPerMatch }}</div>
          <div class="text-xs text-gray-500">Goals / Match</div>
        </div>
        <div class="card text-center">
          <div class="text-sm font-extrabold text-primary-600 truncate">{{ stats()!.topScoringTeam?.teamName ?? '—' }}</div>
          <div class="text-xs text-gray-500">Top Scorer ({{ stats()!.topScoringTeam?.goals ?? 0 }})</div>
        </div>
      </div>

      <div class="card mb-4">
        <h3 class="font-bold text-sm mb-3">Win Distribution</h3>
        <div class="h-52">
          <canvas baseChart [data]="doughnutData()" type="doughnut" [options]="doughnutOptions"></canvas>
        </div>
      </div>

      <div class="card">
        <h3 class="font-bold text-sm mb-3">Goals per Round</h3>
        <div class="h-52">
          <canvas baseChart [data]="barData()" type="bar" [options]="barOptions"></canvas>
        </div>
      </div>
    }
  `,
})
export class StatisticsComponent implements OnChanges {
  @Input({ required: true }) tournamentId!: string;

  private statisticsService = inject(StatisticsService);
  stats = signal<TournamentStatistics | null>(null);

  doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
  };

  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  ngOnChanges(): void {
    if (this.tournamentId) {
      this.statisticsService.computeForTournament(this.tournamentId).then((s) => this.stats.set(s));
    }
  }

  doughnutData(): ChartConfiguration<'doughnut'>['data'] {
    const s = this.stats()!;
    return {
      labels: ['Home Wins', 'Away Wins', 'Draws'],
      datasets: [
        {
          data: [s.winDistribution.homeWins, s.winDistribution.awayWins, s.winDistribution.draws],
          backgroundColor: ['#0fa863', '#3b82f6', '#f5a623'],
          borderWidth: 0,
        },
      ],
    };
  }

  barData(): ChartConfiguration<'bar'>['data'] {
    const s = this.stats()!;
    return {
      labels: s.goalDistributionByRound.map((r) => r.round),
      datasets: [{ data: s.goalDistributionByRound.map((r) => r.goals), backgroundColor: '#0fa863', borderRadius: 6 }],
    };
  }
}
