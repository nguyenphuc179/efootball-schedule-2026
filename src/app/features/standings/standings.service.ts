import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, orderBy, writeBatch } from '@angular/fire/firestore';
import { map } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { TeamService } from '../teams/team.service';
import { MatchService } from '../fixtures/match.service';
import { StandingRow, compareStandingRows, emptyStandingRow } from '../../models/standing.model';

const ROWS_SUBPATH = (tournamentId: string) => `standings/${tournamentId}/rows`;

/**
 * Real-time standings engine.
 *
 * `streamRows()` gives components a live-sorted list via a plain Firestore listener (cheap, no
 * client-side recompute needed on read). `recalculate()` is the write path: it re-derives every
 * team's row from ALL completed matches in the tournament and batch-writes the result — called by
 * ResultService immediately after a result is saved, and safe to re-run any time (idempotent).
 */
@Injectable({ providedIn: 'root' })
export class StandingsService {
  private fs = inject(FirestoreBaseService);
  private firestore = inject(Firestore);
  private teamService = inject(TeamService);
  private matchService = inject(MatchService);

  streamRows(tournamentId: string) {
    // Order by points server-side (a single-field index Firestore provides automatically), then
    // apply the full tiebreak chain (GD -> GF -> name, and per-group) in code. A standings table
    // is at most a few dozen rows, so this is essentially free and needs no composite index.
    return this.fs
      .streamCollection<StandingRow>(ROWS_SUBPATH(tournamentId), orderBy('points', 'desc'))
      .pipe(map((rows) => [...rows].sort(compareStandingRows)));
  }

  /** One-off read of every standings row (used by the Final Stage generator). */
  async getRowsOnce(tournamentId: string): Promise<StandingRow[]> {
    return this.fs.getOnce<StandingRow>(ROWS_SUBPATH(tournamentId));
  }

  async recalculate(tournamentId: string): Promise<void> {
    const [teams, matches, existingRows] = await Promise.all([
      this.teamService.getByTournamentOnce(tournamentId),
      this.matchService.getByTournamentOnce(tournamentId),
      this.getRowsOnce(tournamentId),
    ]);

    // Map each team to its group from the group-stage fixtures (null for non-group tournaments).
    const teamGroup = new Map<string, string | null>();
    for (const m of matches) {
      if (!m.groupName) continue;
      teamGroup.set(m.homeTeamId, m.groupName);
      teamGroup.set(m.awayTeamId, m.groupName);
    }

    const rows = new Map<string, StandingRow>();
    for (const team of teams) {
      rows.set(team.id, emptyStandingRow(team.id, team.teamName, team.logo, teamGroup.get(team.id) ?? null));
    }

    // In a group tournament the table is the group stage only — knockout results don't count.
    const hasGroupStage = matches.some((m) => m.groupName);
    const completed = matches
      .filter((m) => (hasGroupStage ? !!m.groupName : true))
      .filter((m) => m.status === 'completed' && m.homeScore !== null && m.awayScore !== null)
      .sort((a, b) => a.matchDate - b.matchDate);

    for (const match of completed) {
      const home = rows.get(match.homeTeamId);
      const away = rows.get(match.awayTeamId);
      if (!home || !away) continue; // team may have been removed after fixtures were generated

      const hs = match.homeScore as number;
      const as = match.awayScore as number;

      home.played++;
      away.played++;
      home.goalsFor += hs;
      home.goalsAgainst += as;
      away.goalsFor += as;
      away.goalsAgainst += hs;

      if (hs > as) {
        home.won++;
        home.points += 3;
        away.lost++;
        pushForm(home, 'W');
        pushForm(away, 'L');
      } else if (hs < as) {
        away.won++;
        away.points += 3;
        home.lost++;
        pushForm(away, 'W');
        pushForm(home, 'L');
      } else {
        home.drawn++;
        away.drawn++;
        home.points += 1;
        away.points += 1;
        pushForm(home, 'D');
        pushForm(away, 'D');
      }

      home.goalDifference = home.goalsFor - home.goalsAgainst;
      away.goalDifference = away.goalsFor - away.goalsAgainst;
    }

    // Rank within each group so positions read 1..N per group (1..N overall when ungrouped).
    const byGroup = new Map<string | null, StandingRow[]>();
    for (const row of rows.values()) {
      const bucket = byGroup.get(row.groupName) ?? [];
      bucket.push(row);
      byGroup.set(row.groupName, bucket);
    }
    const sorted: StandingRow[] = [];
    for (const bucket of byGroup.values()) {
      bucket.sort(compareStandingRows);
      bucket.forEach((row, idx) => (row.position = idx + 1));
      sorted.push(...bucket);
    }

    const batch = writeBatch(this.firestore);

    // Drop rows whose team no longer exists (deleted, or removed and re-added with a new id).
    // Without this the table keeps showing "ghost" rows with their last-known stats.
    const liveTeamIds = new Set(teams.map((t) => t.id));
    for (const stale of existingRows as (StandingRow & { id: string })[]) {
      if (!liveTeamIds.has(stale.teamId)) {
        batch.delete(doc(this.firestore, `${ROWS_SUBPATH(tournamentId)}/${stale.id ?? stale.teamId}`));
      }
    }

    for (const row of sorted) {
      batch.set(doc(this.firestore, `${ROWS_SUBPATH(tournamentId)}/${row.teamId}`), row);
    }
    batch.set(doc(this.firestore, `standings/${tournamentId}`), { lastUpdated: Date.now() }, { merge: true });
    await batch.commit();
  }
}

function pushForm(row: StandingRow, result: 'W' | 'D' | 'L'): void {
  row.form = [...row.form, result].slice(-5);
}
