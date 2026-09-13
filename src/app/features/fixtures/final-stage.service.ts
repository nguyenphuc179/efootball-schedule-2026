import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MatchService } from './match.service';
import { StandingsService } from '../standings/standings.service';
import { TournamentService } from '../tournament/tournament.service';
import { TeamService } from '../teams/team.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
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

/** A team the seed dialog can place — the group-stage qualifiers (first seed) or, once some
 *  knockout rounds are done, whoever's about to enter the next undecided round. The admin
 *  re-orders these (drag, or a random draw) before that round is actually built. */
export interface FinalStageSeed {
  id: string;
  name: string;
  logo: string | null;
  /** Set only for the initial seed (from group standings) — e.g. "Group A" rank 1. Omitted once
   *  re-seeding a later round, where "which group" no longer means much. */
  groupName?: string;
  position?: number;
}

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

/** "Semi Final 2" → "Semi-final #2", "Final" → "Final", "Third Place" → "Third place". */
export function prettyRound(round: string, translate: TranslateService): string {
  if (round === 'Final') return translate.instant('MATCH.FINAL');
  if (round === 'Third Place') return translate.instant('MATCH.THIRD_PLACE');
  const num = / (\d+)$/.exec(round)?.[1];
  const base = roundBase(round);
  const name =
    base === 'Semi Final'
      ? translate.instant('MATCH.SEMI_FINAL')
      : base === 'Quarter Final'
        ? translate.instant('MATCH.QUARTER_FINAL')
        : base;
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
  private teamService = inject(TeamService);
  private activityLog = inject(ActivityLogService);

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
   *  - `customOrder` given (from the seed dialog: random draw / drag & drop) → always (re)seeds
   *    the bracket in that order, wiping any existing Final Stage matches/results first. The
   *    dialog is responsible for confirming with the admin before calling this when results would
   *    be lost; the group stage itself is never touched.
   *  - no `customOrder` → the safe, no-dialog path: seeds with the default order if there's no
   *    bracket yet, otherwise just resolves "Winner/Loser of …" placeholders from played matches.
   */
  async generate(
    tournamentId: string,
    qualifiersPerGroup = 2,
    customOrder?: FinalStageSeed[]
  ): Promise<void> {
    const matches = await this.matchService.getByTournamentOnce(tournamentId);
    const existing = matches.filter((m) => !m.groupName);

    // An explicit order from the seed dialog is always honoured, even over an already-played
    // bracket — the dialog confirms with the admin first, since this discards results for that
    // round onward (earlier, already-decided rounds are left alone; see applyCustomSeed()).
    if (customOrder) {
      await this.applyCustomSeed(tournamentId, matches, customOrder);
      return;
    }

    if (existing.length > 0) {
      for (const m of existing) {
        if (m.status === 'completed' && m.homeTeamId && m.awayTeamId && !matchWinner(m)) {
          throw new Error('FINAL_STAGE_ERROR.MATCH_LEVEL');
        }
      }
      await this.syncFromResults(tournamentId);
      return;
    }

    await this.seedBracket(tournamentId, matches, qualifiersPerGroup);
  }

  /**
   * The teams that will advance, in the default seed order (group winners cross-seeded so they
   * only meet in the final) — fetched to pre-fill the seed dialog before the bracket is built.
   * Throws the same validation errors `generate()` would.
   */
  async getQualifiedSeeds(tournamentId: string, qualifiersPerGroup: number): Promise<FinalStageSeed[]> {
    const matches = await this.matchService.getByTournamentOnce(tournamentId);
    if (!this.isGroupStageComplete(matches)) throw new Error('FINAL_STAGE_ERROR.GROUP_STAGE_NOT_DONE');

    const { names, groupA, groupB, k } = await this.groupedStandings(tournamentId, qualifiersPerGroup);

    const seeds: FinalStageSeed[] = [];
    for (let i = 0; i < k; i++) {
      seeds.push({ ...slot(groupB[i]), groupName: names[1], position: i + 1 });
      seeds.push({ ...slot(groupA[i]), groupName: names[0], position: i + 1 });
    }
    return seeds;
  }

  /** Every team entered — the seed source for a plain `knockout` tournament (no group stage). */
  async getTeamSeeds(tournamentId: string): Promise<FinalStageSeed[]> {
    const teams = await this.teamService.getByTournamentOnce(tournamentId);
    return teams.map((t) => ({ id: t.id, name: t.teamName, logo: t.logo }));
  }

  /**
   * The teams to offer in the seed dialog: the original group-stage qualifiers if the bracket
   * hasn't been generated yet, otherwise whoever's about to enter the first round that isn't
   * fully decided (e.g. once every quarter-final is played, the four semi-finalists) — so
   * re-seeding only rearranges what's genuinely still undecided, never a round already played.
   * Third Place is never its own "frontier" — it's rebuilt alongside the semi-final it depends
   * on. Returns `[]` once the whole bracket (main line) is decided — nothing left to reseed.
   */
  async getReseedCandidates(tournamentId: string, qualifiersPerGroup: number): Promise<FinalStageSeed[]> {
    const matches = await this.matchService.getByTournamentOnce(tournamentId);
    const knockout = matches.filter((m) => !m.groupName);
    if (knockout.length === 0) {
      const tournament = await this.tournamentService.getOnce(tournamentId);
      // A plain `knockout` tournament has no group stage to qualify from — every entered team
      // goes straight into the bracket.
      return tournament?.type === 'knockout'
        ? this.getTeamSeeds(tournamentId)
        : this.getQualifiedSeeds(tournamentId, qualifiersPerGroup);
    }

    const frontier = this.frontierRound(knockout);
    if (!frontier) return [];

    const roundMatches = [...frontier.matches].sort((a, b) => roundSortKey(a.round) - roundSortKey(b.round));
    const seeds: FinalStageSeed[] = [];
    for (const m of roundMatches) {
      seeds.push({ id: m.homeTeamId, name: m.homeTeamName ?? 'TBD', logo: m.homeTeamLogo ?? null });
      seeds.push({ id: m.awayTeamId, name: m.awayTeamName ?? 'TBD', logo: m.awayTeamLogo ?? null });
    }
    return seeds;
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
    const tournament = await this.tournamentService.getOnce(tournamentId);
    if (!tournament) throw new Error('FINAL_STAGE_ERROR.TOURNAMENT_NOT_FOUND');
    if (tournament.type !== 'group_knockout') throw new Error('FINAL_STAGE_ERROR.NO_GROUP_STAGE');
    if (!this.isGroupStageComplete(matches)) throw new Error('FINAL_STAGE_ERROR.GROUP_STAGE_NOT_DONE');

    // Default: B-first interleave so the two group winners are seeds 1 & 2 (meet only in the final).
    const { groupA, groupB, k } = await this.groupedStandings(tournamentId, qualifiersPerGroup);
    const seeds: Slot[] = [];
    for (let i = 0; i < k; i++) seeds.push(slot(groupB[i]), slot(groupA[i]));

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
    await this.activityLog.log('final_stage_generate', `Đã tạo vòng loại trực tiếp (${drafts.length} trận)`, tournamentId);
  }

  /**
   * Applies an admin-chosen seed order from the dialog. If these teams are still at the very
   * start (the group-stage qualifiers), this seeds the whole bracket exactly like `seedBracket()`.
   * Otherwise it rebuilds only from the round these teams currently occupy onward (that round,
   * Third Place, and the Final) — earlier, already-decided rounds are left completely untouched.
   */
  private async applyCustomSeed(
    tournamentId: string,
    matches: Match[],
    customOrder: FinalStageSeed[]
  ): Promise<void> {
    const tournament = await this.tournamentService.getOnce(tournamentId);
    if (!tournament) throw new Error('FINAL_STAGE_ERROR.TOURNAMENT_NOT_FOUND');

    const existingKnockout = matches.filter((m) => !m.groupName);

    // Everything from the first not-yet-decided round tier onward gets rebuilt; anything earlier
    // (already-decided rounds) is left in place. NOTE: can't find this by searching for the seed
    // teams' ids in `existingKnockout` — those same ids also appear in their own earlier, already
    // -completed matches (e.g. a semi-finalist was also a quarter-finalist), which would wrongly
    // point back at an already-decided round instead of the current one.
    const frontier = this.frontierRound(existingKnockout);
    const frontierKey = frontier ? frontier.key : -Infinity; // no bracket yet -> nothing to protect

    const toDelete = existingKnockout.filter((m) => roundSortKey(m.round) >= frontierKey);
    const toKeep = existingKnockout.filter((m) => roundSortKey(m.round) < frontierKey);
    if (toDelete.length) await this.matchService.clearMatches(toDelete.map((m) => m.id));

    const groupDates = matches.filter((m) => m.groupName).map((m) => m.matchDate);
    const baseDate = toKeep.length
      ? Math.max(...toKeep.map((m) => m.matchDate))
      : groupDates.length
        ? Math.max(...groupDates)
        : tournament.startDate; // plain `knockout` tournaments have no group stage to anchor to

    const seeds: Slot[] = customOrder.map((s) => ({ id: s.id, name: s.name, logo: s.logo }));
    const bracket = buildBracket(seeds);
    const drafts: MatchDraft[] = bracket.map((b) =>
      this.draft(tournamentId, b.round, b.home, b.away, baseDate + (b.depth + 1) * 7 * DAY_MS, tournament.location)
    );
    await this.matchService.bulkCreate(drafts);
    await this.activityLog.log('final_stage_generate', `Đã tạo lại vòng loại trực tiếp (${drafts.length} trận)`, tournamentId);
  }

  /**
   * The matches of the first round *tier* (e.g. every "Semi Final N" together, not the individual
   * numbered round strings) that isn't fully completed — Third Place is never its own tier, since
   * it's derived from the semi-final rather than an independent bracket level. `null` once the
   * whole main line is decided (or there are no knockout matches at all yet).
   */
  private frontierRound(knockout: Match[]): { key: number; matches: Match[] } | null {
    const byRound = new Map<string, Match[]>();
    for (const m of knockout) {
      const base = roundBase(m.round);
      if (base === 'Third Place') continue;
      const arr = byRound.get(base) ?? [];
      arr.push(m);
      byRound.set(base, arr);
    }
    const rounds = [...byRound.entries()].sort((a, b) => roundSortKey(a[0]) - roundSortKey(b[0]));
    const found = rounds.find(([, ms]) => !ms.every((m) => m.status === 'completed'));
    return found ? { key: roundSortKey(found[0]), matches: found[1] } : null;
  }

  /** Both groups' standings rows (sorted, ranked) plus the usable qualifier count `k`. */
  private async groupedStandings(
    tournamentId: string,
    qualifiersPerGroup: number
  ): Promise<{ names: string[]; groupA: StandingRow[]; groupB: StandingRow[]; k: number }> {
    const rows = await this.standingsService.getRowsOnce(tournamentId);

    const groups = new Map<string, StandingRow[]>();
    for (const row of rows) {
      if (!row.groupName) continue;
      const bucket = groups.get(row.groupName) ?? [];
      bucket.push(row);
      groups.set(row.groupName, bucket);
    }

    const names = [...groups.keys()].sort();
    if (names.length !== 2) throw new Error('FINAL_STAGE_ERROR.NEEDS_TWO_GROUPS');
    const [groupA, groupB] = names.map((n) => [...groups.get(n)!].sort(compareStandingRows));

    const maxK = Math.min(groupA.length, groupB.length);
    const k = Math.max(1, Math.min(Math.floor(qualifiersPerGroup) || 2, maxK));
    if (maxK < 1) throw new Error('FINAL_STAGE_ERROR.NEEDS_ONE_TEAM_PER_GROUP');

    return { names, groupA, groupB, k };
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

/**
 * The full bracket tree (every round, not just round 1 — Semi-finals, Final, Bronze match, byes
 * and all) a given seed order would produce. Used by the seed dialog to preview the actual
 * bracket shape — with `app-final-bracket` — as the admin arranges seeds, before anything's saved.
 */
export function previewBracket(
  seeds: { id: string; name: string; logo: string | null }[]
): { round: string; home: Slot; away: Slot; depth: number }[] {
  return buildBracket(seeds);
}

function label(text: string): Slot {
  return { id: '', name: text, logo: null };
}
