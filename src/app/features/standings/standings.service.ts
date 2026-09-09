import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, orderBy, writeBatch } from '@angular/fire/firestore';
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
    // Ordering priority (points -> GD -> GF) mirrors compareStandingRows; team name tiebreak is
    // applied client-side since Firestore can't express a "then alphabetical" 4th orderBy cleanly
    // across ties without an extra composite index per tiebreak combination.
    return this.fs.streamCollection<StandingRow>(
      ROWS_SUBPATH(tournamentId),
      orderBy('points', 'desc'),
      orderBy('goalDifference', 'desc'),
      orderBy('goalsFor', 'desc')
    );
  }

  async recalculate(tournamentId: string): Promise<void> {
    const [teams, matches] = await Promise.all([
      this.teamService.getByTournamentOnce(tournamentId),
      this.matchService.getByTournamentOnce(tournamentId),
    ]);

    const rows = new Map<string, StandingRow>();
    for (const team of teams) {
      rows.set(team.id, emptyStandingRow(team.id, team.teamName, team.logo));
    }

    const completed = matches
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

    const sorted = [...rows.values()].sort(compareStandingRows);
    sorted.forEach((row, idx) => (row.position = idx + 1));

    const batch = writeBatch(this.firestore);
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
