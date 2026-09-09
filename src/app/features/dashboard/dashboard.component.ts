import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { TournamentService } from '../tournament/tournament.service';
import { MatchService } from '../fixtures/match.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { Match } from '../../models/match.model';

/** Admin-only dashboard: KPI widgets + Match Results / Goals Distribution / Team Performance charts. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-4xl mx-auto">
      <h1 class="text-xl font-extrabold mb-4">Admin Dashboard</h1>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ tournaments().length }}</div>
          <div class="text-xs text-gray-500">Tournaments</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ totalTeams() }}</div>
          <div class="text-xs text-gray-500">Teams</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ matches().length }}</div>
          <div class="text-xs text-gray-500">Matches</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">{{ totalGoals() }}</div>
          <div class="text-xs text-gray-500">Goals Scored</div>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="card">
          <h3 class="font-bold text-sm mb-3">Match Results</h3>
          <div class="h-56">
            <canvas baseChart [data]="resultsChartData()" type="pie" [options]="pieOptions"></canvas>
          </div>
        </div>
        <div class="card">
          <h3 class="font-bold text-sm mb-3">Goals Distribution (by Tournament)</h3>
          <div class="h-56">
            <canvas baseChart [data]="goalsChartData()" type="bar" [options]="barOptions"></canvas>
          </div>
        </div>
      </div>

      <div class="mt-6 flex flex-col gap-2">
        <a routerLink="/tournaments/create" class="btn-primary w-full text-center">Create New Tournament</a>
        <a routerLink="/tournaments" class="btn-secondary w-full text-center">Manage Tournaments</a>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  private tournamentService = inject(TournamentService);
  private matchService = inject(MatchService);

  tournaments = this.tournamentService.all;
  totalTeams = computed(() => this.tournaments().reduce((sum, t) => sum + t.numberOfTeams, 0));

  private upcoming = toSignal(this.matchService.streamUpcoming(), { initialValue: [] as Match[] });
  private completed = toSignal(this.matchService.streamRecentResults(), { initialValue: [] as Match[] });
  matches = computed(() => [...this.upcoming(), ...this.completed()]);

  totalGoals = computed(() =>
    this.completed().reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0)
  );

  pieOptions: ChartConfiguration<'pie'>['options'] = {
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

  resultsChartData(): ChartConfiguration<'pie'>['data'] {
    const completed = this.completed().length;
    const upcoming = this.upcoming().length;
    return {
      labels: ['Completed', 'Scheduled'],
      datasets: [{ data: [completed, upcoming], backgroundColor: ['#0fa863', '#e5e7eb'] }],
    };
  }

  goalsChartData(): ChartConfiguration<'bar'>['data'] {
    const goalsByTournament = new Map<string, number>();
    for (const m of this.completed()) {
      goalsByTournament.set(
        m.tournamentId,
        (goalsByTournament.get(m.tournamentId) ?? 0) + (m.homeScore ?? 0) + (m.awayScore ?? 0)
      );
    }
    const labels = [...goalsByTournament.keys()].map(
      (id) => this.tournaments().find((t) => t.id === id)?.name ?? id.slice(0, 6)
    );
    return {
      labels,
      datasets: [{ data: [...goalsByTournament.values()], backgroundColor: '#3b82f6', borderRadius: 6 }],
    };
  }
}
