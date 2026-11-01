import { Match } from '../../../models/match.model';

export type GroupKey = 'A' | 'B';

export interface GroupStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/** What separated the two clubs, in tie-break order. */
export type GroupDecider = 'points' | 'goalDifference' | 'goalsFor';

function emptyStats(): GroupStats {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
}

/** Group totals from completed matches: win 3, draw 1, loss 0 per individual match. */
export function computeGroupStats(
  matches: Match[],
  aIds: Set<string>,
  bIds: Set<string>
): Record<GroupKey, GroupStats> {
  const stats: Record<GroupKey, GroupStats> = { A: emptyStats(), B: emptyStats() };

  for (const m of matches) {
    if (m.status !== 'completed' || m.homeScore == null || m.awayScore == null) continue;
    const home: GroupKey | null = aIds.has(m.homeTeamId) ? 'A' : bIds.has(m.homeTeamId) ? 'B' : null;
    if (!home) continue;
    const away: GroupKey = home === 'A' ? 'B' : 'A';

    stats[home].played++;
    stats[away].played++;
    stats[home].goalsFor += m.homeScore;
    stats[home].goalsAgainst += m.awayScore;
    stats[away].goalsFor += m.awayScore;
    stats[away].goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      stats[home].wins++;
      stats[away].losses++;
    } else if (m.homeScore < m.awayScore) {
      stats[away].wins++;
      stats[home].losses++;
    } else {
      stats[home].draws++;
      stats[away].draws++;
    }
  }

  for (const key of ['A', 'B'] as const) {
    const s = stats[key];
    s.goalDifference = s.goalsFor - s.goalsAgainst;
    s.points = s.wins * 3 + s.draws;
  }
  return stats;
}

/** Points first, then goal difference, then goals scored. `leader: null` = still level on all three. */
export function compareGroups(a: GroupStats, b: GroupStats): { leader: GroupKey | null; decidedBy: GroupDecider | null } {
  const steps: [GroupDecider, number, number][] = [
    ['points', a.points, b.points],
    ['goalDifference', a.goalDifference, b.goalDifference],
    ['goalsFor', a.goalsFor, b.goalsFor],
  ];
  for (const [decidedBy, x, y] of steps) {
    if (x !== y) return { leader: x > y ? 'A' : 'B', decidedBy };
  }
  return { leader: null, decidedBy: null };
}
