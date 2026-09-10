import { Injectable, inject } from '@angular/core';
import { MatchService } from './match.service';
import { StandingsService } from '../standings/standings.service';
import { TournamentService } from '../tournament/tournament.service';
import { Match, MatchDraft, matchWinner } from '../../models/match.model';
import { StandingRow, compareStandingRows } from '../../models/standing.model';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Slot {
  id: string;
  name: string;
  logo: string | null;
}
/** What flows out of a bracket slot: a known team, "winner of round X", or a bye (round 1 only). */
type Feed = Slot | { ref: string } | null;

const BASE_ORDER = [
  'Round of 128',
  'Round of 64',
  'Round of 32',
  'Round of 16',
  'Quarter Final',
  'Semi Final',
  'Third Place',
  'Final',
];

const roundBase = (round: string) => round.replace(/ \d+$/, '');

/** "Semi Final 2" → "Semi-final #2", "Final" → "Final", "Third Place" → "Third-place play-off". */
export function prettyRound(round: string): string {
  if (round === 'Final') return 'Final';
  if (round === 'Third Place') return 'Third-place play-off';
  const num = / (\d+)$/.exec(round)?.[1];
  const base = roundBase(round);
  const name = base === 'Semi Final' ? 'Semi-final' : base === 'Quarter Final' ? 'Quarter-final' : base;
  return num ? `${name} #${num}` : name;
}

/** Sort key: Round of 16 → QF → SF → 3rd-place → Final, numbered within each round. */
export function roundSortKey(round: string): number {
  const bi = BASE_ORDER.indexOf(roundBase(round));
  const num = Number(/ (\d+)$/.exec(round)?.[1] ?? 0);
  return (bi < 0 ? BASE_ORDER.length : bi) * 100 + num;
}

/**
 * Builds and maintains the knockout ("Final Stage") bracket for a `group_knockout` tournament.
 *
 * An admin seeds it from the Final Stage tab once every group match has a result, choosing how
 * many teams advance per group. The two groups are cross-seeded into a standard single-elimination
 * bracket (byes for the top seeds when the count isn't a power of two), plus a third-place
 * play-off whenever there's a semi-final round. "Winner of …" / "Loser of …" placeholders are
 * resolved automatically as results come in (`syncFromResults`, called from ResultService);
 * the manual button re-runs the same resolution. Entered scores are never overwritten.
 */
@Injectable({ providedIn: 'root' })
export class FinalStageService {
  private matchService = inject(MatchService);
  private standingsService = inject(StandingsService);
  private tournamentService = inject(TournamentService);

  isGroupStageComplete(matches: Match[]): boolean {
    const groupMatches = matches.filter((m) => m.groupName);
    return groupMatches.length > 0 && groupMatches.every((m) => m.status === 'completed');
  }

  groupStageProgress(matches: Match[]): { played: number; total: number } {
    const groupMatches = matches.filter((m) => m.groupName);
    return {
      played: groupMatches.filter((m) => m.status === 'completed').length,
      total: groupMatches.length,
    };
  }

  hasFinalStage(matches: Match[]): boolean {
    return matches.some((m) => !m.groupName);
  }

  /** Largest usable "teams advancing per group" — capped by the smallest group. */
  maxQualifiersPerGroup(matches: Match[]): number {
    const sizes = new Map<string, Set<string>>();
    for (const m of matches) {
      if (!m.groupName) continue;
      const seen = sizes.get(m.groupName) ?? new Set<string>();
      seen.add(m.homeTeamId).add(m.awayTeamId);
      sizes.set(m.groupName, seen);
    }
    return sizes.size ? Math.min(...[...sizes.values()].map((s) => s.size)) : 0;
  }

  /**
   * Manual "Generate / update bracket" action:
   *  - no bracket yet → seed it from the group standings (`qualifiersPerGroup` advance from each)
   *  - bracket exists → resolve the "Winner/Loser of …" placeholders from played matches
   */
  async generate(tournamentId: string, qualifiersPerGroup = 2): Promise<void> {
    const matches = await this.matchService.getByTournamentOnce(tournamentId);
    const existing = matches.filter((m) => !m.groupName);

    if (existing.length > 0) {
      for (const m of existing) {
        if (m.status === 'completed' && m.homeTeamId && m.awayTeamId && !matchWinner(m)) {
          throw new Error('A knockout match is level — enter a penalty shootout to decide it.');
        }
      }
      await this.syncFromResults(tournamentId);
      return;
    }

    await this.seedBracket(tournamentId, matches, qualifiersPerGroup);
  }

  /**
   * Fills "Winner of …" / "Loser of …" slots from decided matches. Idempotent; safe to call
   * after any knockout result. Loops so a single call can cascade through several rounds.
   */
  async syncFromResults(tournamentId: string): Promise<void> {
    for (let pass = 0; pass < 8; pass++) {
      const ko = (await this.matchService.getByTournamentOnce(tournamentId)).filter((m) => !m.groupName);
      if (ko.length === 0) return;
      const byRound = new Map(ko.map((m) => [m.round, m]));
      let wrote = false;

      for (const m of ko) {
        if (m.status === 'completed') continue;
        const patch: Partial<Match> = {};
        for (const side of ['home', 'away'] as const) {
          if (m[`${side}TeamId`]) continue;
          const parsed = /^(Winner|Loser) (.+)$/.exec(m[`${side}TeamName`] ?? '');
          if (!parsed) continue;
          const outcome = this.outcome(byRound.get(parsed[2]));
          if (!outcome) continue;
          const slot = parsed[1] === 'Winner' ? outcome.winner : outcome.loser;
          patch[`${side}TeamId`] = slot.id;
          patch[`${side}TeamName`] = slot.name;
          patch[`${side}TeamLogo`] = slot.logo;
        }
        if (Object.keys(patch).length) {
          await this.matchService.update(m.id, patch);
          wrote = true;
        }
      }
      if (!wrote) return;
    }
  }

  // --- internals ----------------------------------------------------------------------------

  private async seedBracket(
    tournamentId: string,
    matches: Match[],
    qualifiersPerGroup: number
  ): Promise<void> {
    const [tournament, rows] = await Promise.all([
      this.tournamentService.getOnce(tournamentId),
      this.standingsService.getRowsOnce(tournamentId),
    ]);
    if (!tournament) throw new Error('Tournament not found.');
    if (tournament.type !== 'group_knockout') throw new Error('This tournament has no group stage.');
    if (!this.isGroupStageComplete(matches)) throw new Error('Finish every group-stage match first.');

    const groups = new Map<string, StandingRow[]>();
    for (const row of rows) {
      if (!row.groupName) continue;
      const bucket = groups.get(row.groupName) ?? [];
      bucket.push(row);
      groups.set(row.groupName, bucket);
    }

    const names = [...groups.keys()].sort();
    if (names.length !== 2) throw new Error('The final stage needs exactly 2 groups.');
    const [groupA, groupB] = names.map((n) => [...groups.get(n)!].sort(compareStandingRows));

    const maxK = Math.min(groupA.length, groupB.length);
    const k = Math.max(1, Math.min(Math.floor(qualifiersPerGroup) || 2, maxK));
    if (maxK < 1) throw new Error('Each group needs at least 1 team.');

    // B-first interleave so the two group winners are seeds 1 & 2 (they only meet in the final).
    const seeds: Slot[] = [];
    for (let i = 0; i < k; i++) {
      seeds.push(slot(groupB[i]), slot(groupA[i]));
    }

    const lastGroupDate = Math.max(...matches.filter((m) => m.groupName).map((m) => m.matchDate));
    const bracket = buildBracket(seeds);
    const drafts: MatchDraft[] = bracket.map((b) =>
      this.draft(
        tournamentId,
        b.round,
        b.home,
        b.away,
        lastGroupDate + (b.depth + 1) * 7 * DAY_MS,
        tournament.location
      )
    );
    await this.matchService.bulkCreate(drafts);
  }

  private draft(
    tournamentId: string,
    round: string,
    home: Slot,
    away: Slot,
    matchDate: number,
    location: string
  ): MatchDraft {
    return {
      tournamentId,
      round,
      groupName: null,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeTeamName: home.name,
      awayTeamName: away.name,
      homeTeamLogo: home.logo,
      awayTeamLogo: away.logo,
      matchDate,
      matchTime: '15:00',
      location,
    };
  }

  /** Winner/loser of a decided match (penalties break a level score), or null if not decided. */
  private outcome(m: Match | undefined): { winner: Slot; loser: Slot } | null {
    if (!m || m.status !== 'completed' || !m.homeTeamId || !m.awayTeamId) return null;
    const w = matchWinner(m);
    if (!w) return null;
    const home: Slot = { id: m.homeTeamId, name: m.homeTeamName ?? 'Home', logo: m.homeTeamLogo ?? null };
    const away: Slot = { id: m.awayTeamId, name: m.awayTeamName ?? 'Away', logo: m.awayTeamLogo ?? null };
    return w === 'home' ? { winner: home, loser: away } : { winner: away, loser: home };
  }
}

// --- bracket maths -----------------------------------------------------------------------

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Standard single-elimination seed order for a bracket of `n` (power of two) positions. */
function seedOrder(n: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < n) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) next.push(s, sum - s);
    seeds = next;
  }
  return seeds;
}

function bracketLabels(size: number): string[] {
  const out: string[] = [];
  for (let s = size; s >= 2; s /= 2) {
    out.push(s === 2 ? 'Final' : s === 4 ? 'Semi Final' : s === 8 ? 'Quarter Final' : `Round of ${s}`);
  }
  return out;
}

function feedSlot(f: Exclude<Feed, null>): Slot {
  return 'ref' in f ? label(`Winner ${f.ref}`) : f;
}

function buildBracket(seeds: Slot[]): { round: string; home: Slot; away: Slot; depth: number }[] {
  const size = nextPow2(Math.max(2, seeds.length));
  const order = seedOrder(size);
  let current: Feed[] = order.map((v) => (v <= seeds.length ? seeds[v - 1] : null));
  const labels = bracketLabels(size);
  const out: { round: string; home: Slot; away: Slot; depth: number }[] = [];

  for (let depth = 0; depth < labels.length; depth++) {
    const isLast = depth === labels.length - 1;
    const next: Feed[] = [];
    let matchNo = 0;
    for (let k = 0; k < current.length / 2; k++) {
      const a = current[2 * k];
      const b = current[2 * k + 1];
      if (a === null && b === null) {
        next.push(null);
        continue;
      }
      if (a === null || b === null) {
        next.push(a ?? b); // bye — the real team advances, no match played
        continue;
      }
      matchNo++;
      const round = isLast && current.length === 2 ? 'Final' : `${labels[depth]} ${matchNo}`;
      out.push({ round, home: feedSlot(a), away: feedSlot(b), depth });
      next.push({ ref: round });
    }
    current = next;
  }

  if (out.some((m) => m.round === 'Semi Final 1') && out.some((m) => m.round === 'Semi Final 2')) {
    out.push({
      round: 'Third Place',
      home: label('Loser Semi Final 1'),
      away: label('Loser Semi Final 2'),
      depth: labels.length - 1,
    });
  }
  return out;
}

function slot(row: StandingRow): Slot {
  return { id: row.teamId, name: row.teamName, logo: row.teamLogo };
}

function label(text: string): Slot {
  return { id: '', name: text, logo: null };
}
