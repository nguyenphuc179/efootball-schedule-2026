import { Match } from '../../../models/match.model';
import { Team, teamGroup } from '../../../models/team.model';
import { TeamMatchRules } from '../../../models/tournament.model';

/** Why a football club can't be picked right now, strongest reason first. */
export type ClubBlockReason = 'self' | 'opponent' | 'teammate';

/**
 * Clubs a side may not pick in the match `matchId`, with the reason, per the tournament's rules.
 * `opponentClub` is the club currently chosen for the other side of that same match.
 */
export function clubBlockReasons(args: {
  matches: Match[];
  teams: Team[];
  rules: TeamMatchRules;
  matchId: string;
  teamId: string;
  opponentClub: string;
}): Map<string, ClubBlockReason> {
  const { matches, teams, rules, matchId, teamId, opponentClub } = args;
  const reasons = new Map<string, ClubBlockReason>();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return reasons;

  const group = teamGroup(team);
  const sameGroup = new Set(teams.filter((t) => group && teamGroup(t) === group).map((t) => t.id));

  // Weakest first, so a stronger reason overwrites it.
  if (rules.uniquePerGroup) {
    for (const [id, club] of usedClubs(matches, matchId)) {
      if (id !== teamId && sameGroup.has(id)) reasons.set(club, 'teammate');
    }
  }
  if (rules.noMirror && opponentClub) reasons.set(opponentClub, 'opponent');
  if (rules.uniquePerPlayer) {
    for (const [id, club] of usedClubs(matches, matchId)) {
      if (id === teamId) reasons.set(club, 'self');
    }
  }
  return reasons;
}

function* usedClubs(matches: Match[], exceptMatchId: string): Generator<[string, string]> {
  for (const m of matches) {
    if (m.id === exceptMatchId) continue;
    if (m.homeClub) yield [m.homeTeamId, m.homeClub];
    if (m.awayClub) yield [m.awayTeamId, m.awayClub];
  }
}

export type RuleKey = keyof TeamMatchRules;

export interface RuleViolation {
  matchId: string;
  rule: RuleKey;
}

/** Saved matches that break `rules` (used to warn when the rules change mid-tournament). */
export function findRuleViolations(matches: Match[], teams: Team[], rules: TeamMatchRules): RuleViolation[] {
  const out: RuleViolation[] = [];
  const ordered = [...matches].sort((a, b) => a.matchDate - b.matchDate || a.id.localeCompare(b.id));
  const byId = new Map(teams.map((t) => [t.id, t] as const));
  const seenByPlayer = new Set<string>(); // `${teamId}|${club}`
  const firstUserByGroupClub = new Map<string, string>(); // `${group}|${club}` -> teamId

  for (const m of ordered) {
    const sides = [
      { teamId: m.homeTeamId, club: m.homeClub },
      { teamId: m.awayTeamId, club: m.awayClub },
    ];

    if (rules.requireClub && m.status === 'completed') {
      for (const s of sides) {
        if (!s.club && (byId.get(s.teamId)?.allowedClubs?.length ?? 0) > 0) out.push({ matchId: m.id, rule: 'requireClub' });
      }
    }
    if (rules.noMirror && m.homeClub && m.homeClub === m.awayClub) {
      out.push({ matchId: m.id, rule: 'noMirror' });
    }
    for (const s of sides) {
      if (!s.club) continue;
      const playerKey = s.teamId + '|' + s.club;
      if (rules.uniquePerPlayer && seenByPlayer.has(playerKey)) out.push({ matchId: m.id, rule: 'uniquePerPlayer' });
      seenByPlayer.add(playerKey);

      const group = teamGroup(byId.get(s.teamId));
      if (rules.uniquePerGroup && group) {
        const groupKey = group + '|' + s.club;
        const first = firstUserByGroupClub.get(groupKey);
        if (first && first !== s.teamId) out.push({ matchId: m.id, rule: 'uniquePerGroup' });
        else if (!first) firstUserByGroupClub.set(groupKey, s.teamId);
      }
    }
  }
  return out;
}

/** Distinct number of matches in a violation list. */
export function violatingMatchCount(violations: RuleViolation[]): number {
  return new Set(violations.map((v) => v.matchId)).size;
}

export interface FootballClubStat {
  club: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/** Per-football-club record from completed matches that recorded a club (win 3, draw 1). */
export function computeFootballClubStats(matches: Match[]): FootballClubStat[] {
  const stats = new Map<string, FootballClubStat>();
  const get = (club: string): FootballClubStat => {
    let s = stats.get(club);
    if (!s) {
      s = { club, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
      stats.set(club, s);
    }
    return s;
  };

  for (const m of matches) {
    if (m.status !== 'completed' || m.homeScore == null || m.awayScore == null) continue;
    const sides: [string | null | undefined, number, number][] = [
      [m.homeClub, m.homeScore, m.awayScore],
      [m.awayClub, m.awayScore, m.homeScore],
    ];
    for (const [club, gf, ga] of sides) {
      if (!club) continue;
      const s = get(club);
      s.played++;
      s.goalsFor += gf;
      s.goalsAgainst += ga;
      if (gf > ga) s.wins++;
      else if (gf < ga) s.losses++;
      else s.draws++;
    }
  }

  const list = [...stats.values()];
  for (const s of list) {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
    s.points = s.wins * 3 + s.draws;
  }
  return list.sort(
    (a, b) => b.wins - a.wins || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.club.localeCompare(b.club)
  );
}
