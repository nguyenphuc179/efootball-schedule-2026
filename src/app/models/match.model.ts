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
export type MatchDraft = Omit<Match, 'id' | 'homeScore' | 'awayScore' | 'status'>;
