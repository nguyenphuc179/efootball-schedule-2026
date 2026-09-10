export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'postponed';

export interface Match {
  id: string;
  tournamentId: string;
  round: string; // "Round 1", "Quarter Final", "Semi Final", "Final", "Group A - Round 1", ...
  groupName: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  // Penalty shootout — only set on a knockout match that finished level.
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  matchDate: number; // epoch millis
  matchTime: string; // "HH:mm"
  location: string;
  status: MatchStatus;
  // Denormalized for fast card rendering without extra reads:
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string | null;
  awayTeamLogo?: string | null;
}

// Keeps the optional denormalized name/logo fields so the generator can populate them
// for known teams (knockout placeholder slots simply leave them undefined → card shows "TBD").
export type MatchDraft = Omit<
  Match,
  'id' | 'homeScore' | 'awayScore' | 'status' | 'penaltyHome' | 'penaltyAway'
>;

/** Winner of a finished match, deciding a level score on penalties. Null while undecided. */
export function matchWinner(m: Match): 'home' | 'away' | null {
  if (m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.awayScore > m.homeScore) return 'away';
  if (m.penaltyHome != null && m.penaltyAway != null && m.penaltyHome !== m.penaltyAway) {
    return m.penaltyHome > m.penaltyAway ? 'home' : 'away';
  }
  return null;
}

/** "2 - 1", or "1 - 1 (4-3 pen)" when a level match was settled on penalties. */
export function matchScoreText(m: Match, whenNotPlayed = '- : -'): string {
  if (m.homeScore == null || m.awayScore == null) return whenNotPlayed;
  const base = `${m.homeScore} - ${m.awayScore}`;
  if (m.homeScore === m.awayScore && m.penaltyHome != null && m.penaltyAway != null) {
    return `${base} (${m.penaltyHome}-${m.penaltyAway} pen)`;
  }
  return base;
}
