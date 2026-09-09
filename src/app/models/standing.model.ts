export interface StandingRow {
  teamId: string;
  teamName: string;
  teamLogo: string | null;
  groupName: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number;
  form: ('W' | 'D' | 'L')[]; // most recent last, max 5
}

export function emptyStandingRow(teamId: string, teamName: string, teamLogo: string | null, groupName: string | null = null): StandingRow {
  return {
    teamId,
    teamName,
    teamLogo,
    groupName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    position: 0,
    form: [],
  };
}

/** Ranking priority: Points -> Goal Difference -> Goals Scored -> Team Name (per spec). */
export function compareStandingRows(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamName.localeCompare(b.teamName);
}
