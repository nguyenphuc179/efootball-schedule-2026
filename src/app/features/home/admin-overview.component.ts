import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";

import { BaseChartDirective } from "ng2-charts";
import { ChartConfiguration } from "chart.js";
import { CommonModule } from "@angular/common";
import { Match } from "../../models/match.model";
import { MatchService } from "../fixtures/match.service";
import { TournamentService } from "../tournament/tournament.service";
import { toSignal } from "@angular/core/rxjs-interop";

/**
 * Admin section of the Home page (shown only to admins, below the personal stats): platform KPIs
 * plus the Match Results / Goals-by-Tournament charts. Replaces the old standalone /dashboard route.
 */
@Component({
  selector: "app-admin-overview",
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="px-4 max-w-4xl mx-auto">
      <div class="flex items-center gap-2.5 mb-4">
        <span
          class="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center"
        >
          <span class="material-icons text-[18px]">admin_panel_settings</span>
        </span>
        <h2 class="text-lg font-black tracking-tight">Quản trị</h2>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">
            {{ tournaments().length }}
          </div>
          <div class="text-xs text-gray-500">Tournaments</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">
            {{ totalTeams() }}
          </div>
          <div class="text-xs text-gray-500">Teams</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">
            {{ matches().length }}
          </div>
          <div class="text-xs text-gray-500">Matches</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-extrabold text-primary-600">
            {{ totalGoals() }}
          </div>
          <div class="text-xs text-gray-500">Goals Scored</div>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="card">
          <h3 class="font-bold text-sm mb-3">Match Results</h3>
          <div class="h-56">
            <canvas
              baseChart
              [data]="resultsChartData()"
              type="pie"
              [options]="pieOptions"
            ></canvas>
          </div>
        </div>
        <div class="card">
          <h3 class="font-bold text-sm mb-3">
            Goals Distribution (by Tournament)
          </h3>
          <div class="h-56">
            <canvas
              baseChart
              [data]="goalsChartData()"
              type="bar"
              [options]="barOptions"
            ></canvas>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminOverviewComponent {
  private tournamentService = inject(TournamentService);
  private matchService = inject(MatchService);

  tournaments = this.tournamentService.all;
  totalTeams = computed(() =>
    this.tournaments().reduce((sum, t) => sum + t.numberOfTeams, 0),
  );

  private upcoming = toSignal(this.matchService.streamUpcoming(), {
    initialValue: [] as Match[],
  });
  private completed = toSignal(this.matchService.streamRecentResults(), {
    initialValue: [] as Match[],
  });
  matches = computed(() => [...this.upcoming(), ...this.completed()]);

  totalGoals = computed(() =>
    this.completed().reduce(
      (sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0),
      0,
    ),
  );

  pieOptions: ChartConfiguration<"pie">["options"] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 12, font: { size: 11 } },
      },
    },
  };

  barOptions: ChartConfiguration<"bar">["options"] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  resultsChartData(): ChartConfiguration<"pie">["data"] {
    return {
      labels: ["Completed", "Scheduled"],
      datasets: [
        {
          data: [this.completed().length, this.upcoming().length],
          backgroundColor: ["#0fa863", "#e5e7eb"],
        },
      ],
    };
  }

  goalsChartData(): ChartConfiguration<"bar">["data"] {
    const goalsByTournament = new Map<string, number>();
    for (const m of this.completed()) {
      goalsByTournament.set(
        m.tournamentId,
        (goalsByTournament.get(m.tournamentId) ?? 0) +
          (m.homeScore ?? 0) +
          (m.awayScore ?? 0),
      );
    }
    const labels = [...goalsByTournament.keys()].map(
      (id) =>
        this.tournaments().find((t) => t.id === id)?.name ?? id.slice(0, 6),
    );
    return {
      labels,
      datasets: [
        {
          data: [...goalsByTournament.values()],
          backgroundColor: "#3b82f6",
          borderRadius: 6,
        },
      ],
    };
  }
}
