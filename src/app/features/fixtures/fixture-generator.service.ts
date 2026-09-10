import { Injectable, inject } from '@angular/core';
import { Team } from '../../models/team.model';
import { MatchDraft } from '../../models/match.model';
import { MatchService } from './match.service';
import { StandingsService } from '../standings/standings.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Generates fixtures for the three supported tournament types.
 *
 * Round Robin — classic "circle method": with N teams (a bye inserted if N is odd), N-1 (or N)
 * rounds are produced where every team plays every other team exactly once.
 *
 * Knockout — single-elimination bracket. If the team count isn't a power of two, the smallest
 * power of two ≥ N is used and the excess teams get first-round byes (advance automatically),
 * exactly like a real-world seeded bracket. Round names follow the requested convention:
 * Round of 16 → Quarter Final → Semi Final → Final.
 *
 * Group Stage + Knockout — splits teams into two groups, round-robins each. The knockout
 * ("Final Stage") is built separately by FinalStageService once every group match has a result
 * and an admin triggers it from the Final Stage tab (semi-finals seeded from the group tables,
 * then Third Place + Final).
 */
@Injectable({ providedIn: 'root' })
export class FixtureGeneratorService {
  private matchService = inject(MatchService);
  private standingsService = inject(StandingsService);

  // ---------------------------------------------------------------------------------------
  // Round Robin
  // ---------------------------------------------------------------------------------------
  generateRoundRobin(
    tournamentId: string,
    teams: Team[],
    startDate: number,
    location: string,
    groupName: string | null = null
  ): MatchDraft[] {
    const ids: (string | null)[] = teams.map((t) => t.id);
    if (ids.length % 2 !== 0) ids.push(null); // bye

    const n = ids.length;
    const rounds = n - 1;
    const half = n / 2;
    const drafts: MatchDraft[] = [];
    const teamById = new Map(teams.map((t) => [t.id, t]));

    let arr = [...ids];
    for (let round = 0; round < rounds; round++) {
      const roundDate = startDate + round * 7 * DAY_MS; // one round per week by default
      const label = groupName ? `${groupName} - Round ${round + 1}` : `Round ${round + 1}`;
      for (let i = 0; i < half; i++) {
        const home = arr[i];
        const away = arr[n - 1 - i];
        if (home === null || away === null) continue; // bye match, skip
        // Alternate home/away by round to balance fixtures
        const [homeId, awayId] = round % 2 === 0 ? [home, away] : [away, home];
        const homeTeam = teamById.get(homeId);
        const awayTeam = teamById.get(awayId);
        drafts.push({
          tournamentId,
          round: label,
          groupName,
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeTeamName: homeTeam?.teamName,
          awayTeamName: awayTeam?.teamName,
          homeTeamLogo: homeTeam?.logo ?? null,
          awayTeamLogo: awayTeam?.logo ?? null,
          matchDate: roundDate,
          matchTime: '15:00',
          location,
        });
      }
      // Rotate all but the first element (circle method)
      arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
    }
    return drafts;
  }

  // ---------------------------------------------------------------------------------------
  // Knockout
  // ---------------------------------------------------------------------------------------
  private nextPowerOfTwo(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  private roundLabel(teamsRemainingInRound: number): string {
    // teamsRemainingInRound = number of teams entering this round (before it's played)
    if (teamsRemainingInRound <= 2) return 'Final';
    if (teamsRemainingInRound === 4) return 'Semi Final';
    if (teamsRemainingInRound === 8) return 'Quarter Final';
    return `Round of ${teamsRemainingInRound}`;
  }

  generateKnockout(
    tournamentId: string,
    teams: Team[],
    startDate: number,
    location: string
  ): MatchDraft[] {
    const bracketSize = this.nextPowerOfTwo(teams.length);
    const byes = bracketSize - teams.length;

    // Seed simply in the given order; interleave for a standard-looking bracket (1 vs N, 2 vs N-1, ...)
    const seeds: (Team | null)[] = [...teams];
    while (seeds.length < bracketSize) seeds.push(null); // null = bye slot

    const drafts: MatchDraft[] = [];
    let currentRoundTeams = bracketSize;
    let roundDate = startDate;

    // Round 1 pairs — standard bracket seeding (1v16, 8v9, 5v12, 4v13, ...) approximated by
    // simple half-split pairing (1v2, 3v4, ...) for simplicity/readability of the generated schedule;
    // swap in a true seeded-bracket order() function if strict tournament seeding is required.
    let pairs: [Team | null, Team | null][] = [];
    for (let i = 0; i < seeds.length; i += 2) {
      pairs.push([seeds[i], seeds[i + 1]]);
    }

    while (currentRoundTeams >= 2) {
      const label = this.roundLabel(currentRoundTeams);
      const nextPairs: [Team | null, Team | null][] = [];

      for (let i = 0; i < pairs.length; i++) {
        const [a, b] = pairs[i];
        if (a && b) {
          drafts.push({
            tournamentId,
            round: label,
            groupName: null,
            homeTeamId: a.id,
            awayTeamId: b.id,
            homeTeamName: a.teamName,
            awayTeamName: b.teamName,
            homeTeamLogo: a.logo,
            awayTeamLogo: b.logo,
            matchDate: roundDate,
            matchTime: '15:00',
            location,
          });
        }
        // Placeholder for next round — winner TBD (represented with empty string, resolved by
        // ResultService advancing winners once results are entered — see advanceWinner()).
        nextPairs.push([a && b ? null : a ?? b, null]);
      }

      // Collapse placeholder pairs into the next round's actual pairing slots
      pairs = [];
      for (let i = 0; i < nextPairs.length; i += 2) {
        pairs.push([nextPairs[i][0], nextPairs[i + 1]?.[0] ?? null]);
      }

      currentRoundTeams = currentRoundTeams / 2;
      roundDate += 7 * DAY_MS;
      if (label === 'Final') break;
    }

    return drafts;
  }

  // ---------------------------------------------------------------------------------------
  // Group Stage + Knockout
  // ---------------------------------------------------------------------------------------
  generateGroupPlusKnockout(
    tournamentId: string,
    teams: Team[],
    startDate: number,
    location: string,
    groupCount = 2
  ): MatchDraft[] {
    // Two groups by default (matches the standard crossover knockout the Final Stage seeds):
    // Group A/B round-robins, then the top 2 of each advance.
    const groups: Team[][] = Array.from({ length: groupCount }, () => []);
    teams.forEach((team, idx) => groups[idx % groupCount].push(team)); // snake-distribute for balance

    const drafts: MatchDraft[] = [];
    groups.forEach((groupTeams, idx) => {
      const groupName = `Group ${String.fromCharCode(65 + idx)}`;
      drafts.push(...this.generateRoundRobin(tournamentId, groupTeams, startDate, location, groupName));
    });

    // The knockout ("Final Stage") is generated later by FinalStageService, once every group
    // match has a result and an admin triggers it — see the Final Stage tab.
    return drafts;
  }

  /** Orchestrates generation + persistence for whichever tournament type is passed in. */
  async generateAndSave(
    tournamentId: string,
    type: 'round_robin' | 'knockout' | 'group_knockout',
    teams: Team[],
    startDate: number,
    location: string
  ): Promise<number> {
    if (teams.length < 2) throw new Error('At least 2 teams are required to generate fixtures.');

    await this.matchService.clearForTournament(tournamentId);

    let drafts: MatchDraft[];
    switch (type) {
      case 'round_robin':
        drafts = this.generateRoundRobin(tournamentId, teams, startDate, location);
        break;
      case 'knockout':
        drafts = this.generateKnockout(tournamentId, teams, startDate, location);
        break;
      case 'group_knockout':
        drafts = this.generateGroupPlusKnockout(tournamentId, teams, startDate, location);
        break;
    }

    await this.matchService.bulkCreate(drafts);
    // Fresh fixtures = no results yet, so reset the standings table (clears old points/form).
    await this.standingsService.recalculate(tournamentId);
    return drafts.length;
  }
}
