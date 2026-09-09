import { Injectable, inject } from '@angular/core';
import { MatchService } from '../fixtures/match.service';
import { TeamService } from '../teams/team.service';
import { Match } from '../../models/match.model';

export interface TournamentStatistics {
  totalMatches: number;
  completedMatches: number;
  totalGoals: number;
  averageGoalsPerMatch: number;
  topScoringTeam: { teamName: string; goals: number } | null;
  winDistribution: { homeWins: number; awayWins: number; draws: number };
  goalDistributionByRound: { round: string; goals: number }[];
}

@Injectable({ providedIn: 'root' })
export class StatisticsService {
  private matchService = inject(MatchService);
  private teamService = inject(TeamService);

  async computeForTournament(tournamentId: string): Promise<TournamentStatistics> {
    const [matches, teams] = await Promise.all([
      this.matchService.getByTournamentOnce(tournamentId),
      this.teamService.getByTournamentOnce(tournamentId),
    ]);
    return this.compute(matches, teams.map((t) => ({ id: t.id, name: t.teamName })));
  }

  compute(matches: Match[], teams: { id: string; name: string }[]): TournamentStatistics {
    const completed = matches.filter((m) => m.status === 'completed' && m.homeScore !== null && m.awayScore !== null);

    let totalGoals = 0;
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    const goalsByTeam = new Map<string, number>();
    const goalsByRound = new Map<string, number>();

    for (const m of completed) {
      const hs = m.homeScore as number;
      const as = m.awayScore as number;
      totalGoals += hs + as;

      goalsByTeam.set(m.homeTeamId, (goalsByTeam.get(m.homeTeamId) ?? 0) + hs);
      goalsByTeam.set(m.awayTeamId, (goalsByTeam.get(m.awayTeamId) ?? 0) + as);
      goalsByRound.set(m.round, (goalsByRound.get(m.round) ?? 0) + hs + as);

      if (hs > as) homeWins++;
      else if (hs < as) awayWins++;
      else draws++;
    }

    let topScoringTeam: TournamentStatistics['topScoringTeam'] = null;
    let max = -1;
    for (const [teamId, goals] of goalsByTeam) {
      if (goals > max) {
        max = goals;
        const team = teams.find((t) => t.id === teamId);
        topScoringTeam = { teamName: team?.name ?? 'Unknown', goals };
      }
    }

    return {
      totalMatches: matches.length,
      completedMatches: completed.length,
      totalGoals,
      averageGoalsPerMatch: completed.length ? Math.round((totalGoals / completed.length) * 10) / 10 : 0,
      topScoringTeam,
      winDistribution: { homeWins, awayWins, draws },
      goalDistributionByRound: [...goalsByRound.entries()].map(([round, goals]) => ({ round, goals })),
    };
  }
}
