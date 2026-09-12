import { Injectable, inject } from '@angular/core';
import { Team } from '../../models/team.model';
import { MatchDraft } from '../../models/match.model';
import { MatchService } from './match.service';
import { StandingsService } from '../standings/standings.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Generates fixtures for the tournament types that have an upfront round-robin schedule.
 *
 * Round Robin — classic "circle method": with N teams (a bye inserted if N is odd), N-1 (or N)
 * rounds are produced where every team plays every other team exactly once.
 *
 * Group Stage + Knockout — splits teams into two groups, round-robins each. The knockout
 * ("Final Stage") is built separately by FinalStageService once every group match has a result
 * and an admin triggers it from the Final Stage tab (semi-finals seeded from the group tables,
 * then Third Place + Final).
 *
 * A pure `knockout` tournament has no upfront schedule to generate at all — it's seeded directly
 * into a bracket by FinalStageService from the Final Stage (Bracket) tab.
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
    type: 'round_robin' | 'group_knockout',
    teams: Team[],
    startDate: number,
    location: string
  ): Promise<number> {
    if (teams.length < 2) throw new Error('At least 2 teams are required to generate fixtures.');

    await this.matchService.clearForTournament(tournamentId);

    const drafts: MatchDraft[] =
      type === 'round_robin'
        ? this.generateRoundRobin(tournamentId, teams, startDate, location)
        : this.generateGroupPlusKnockout(tournamentId, teams, startDate, location);

    await this.matchService.bulkCreate(drafts);
    // Fresh fixtures = no results yet, so reset the standings table (clears old points/form).
    await this.standingsService.recalculate(tournamentId);
    return drafts.length;
  }
}
