import { ChangeDetectionStrategy, Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { StatisticsService, TournamentStatistics } from './statistics.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { roundLabel } from '../../shared/utils/round-label.util';

/**
 * Doughnut (win distribution) + Bar (goals per round) charts, sized and configured for
 * small mobile viewports (compact legends, responsive: true, maintainAspectRatio: false with a
 * fixed-height wrapper so charts never blow out the layout on narrow screens).
 */
@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, LoadingSpinnerComponent, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!stats()) {
      <app-loading-spinner [label]="'STATISTICS.CRUNCHING' | translate" />
    } @else {
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ stats()!.totalMatches }}</div>
          <div class="text-xs text-gray-500">{{ 'STATISTICS.TOTAL_MATCHES' | translate }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ stats()!.totalGoals }}</div>
          <div class="text-xs text-gray-500">{{ 'STATISTICS.TOTAL_GOALS' | translate }}</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ stats()!.averageGoalsPerMatch }}</div>
          <div class="text-xs text-gray-500">{{ 'STATISTICS.GOALS_PER_MATCH' | translate }}</div>
        </div>
        <div class="card text-center">
          <div class="text-sm font-extrabold text-primary-600 truncate">{{ stats()!.topScoringTeam?.teamName ?? '—' }}</div>
          <div class="text-xs text-gray-500">{{ 'STATISTICS.TOP_SCORER' | translate: { goals: stats()!.topScoringTeam?.goals ?? 0 } }}</div>
        </div>
      </div>

      @if (hasResults()) {
        <div class="card mb-4">
          <h3 class="font-bold text-sm mb-3">{{ 'STATISTICS.WIN_DISTRIBUTION' | translate }}</h3>
          <div class="h-52">
            <canvas baseChart [data]="doughnutData()" type="doughnut" [options]="doughnutOptions"></canvas>
          </div>
        </div>

        <div class="card">
          <h3 class="font-bold text-sm mb-3">{{ 'STATISTICS.GOALS_PER_ROUND' | translate }}</h3>
          <div class="h-52">
            <canvas baseChart [data]="barData()" type="bar" [options]="barOptions"></canvas>
          </div>
        </div>
      } @else {
        <app-empty-state
          icon="insights"
          [title]="'STATISTICS.NO_RESULTS_TITLE' | translate"
          [subtitle]="'STATISTICS.NO_RESULTS_SUBTITLE' | translate"
        />
      }
    }
  `,
})
export class StatisticsComponent implements OnChanges {
  @Input({ required: true }) tournamentId!: string;

  private statisticsService = inject(StatisticsService);
  private translate = inject(TranslateService);
  stats = signal<TournamentStatistics | null>(null);

  hasResults = computed(() => {
    const w = this.stats()?.winDistribution;
    return !!w && w.homeWins + w.awayWins + w.draws > 0;
  });

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
      labels: [
        this.translate.instant('STATISTICS.HOME_WINS'),
        this.translate.instant('STATISTICS.AWAY_WINS'),
        this.translate.instant('STATISTICS.DRAWS'),
      ],
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
    // "Group A - Round 1" and "Group B - Round 1" are both "Round 1" on the chart — one bar each.
    const byLabel = new Map<string, number>();
    for (const r of s.goalDistributionByRound) {
      const label = roundLabel(r.round, this.translate);
      byLabel.set(label, (byLabel.get(label) ?? 0) + r.goals);
    }
    return {
      labels: [...byLabel.keys()],
      datasets: [{ data: [...byLabel.values()], backgroundColor: '#0fa863', borderRadius: 6 }],
    };
  }
}
