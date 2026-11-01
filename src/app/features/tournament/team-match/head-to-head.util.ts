import { Match } from '../../../models/match.model';
import { Team, teamGroup } from '../../../models/team.model';

export type H2HResult = 'W' | 'D' | 'L';

export interface H2HCell {
  /** Goals of the ROW player first. */
  rowGoals: number;
  colGoals: number;
  result: H2HResult;
}

export interface H2HMatrix {
  rows: Team[]; // Group A players
  cols: Team[]; // Group B players
  /** `${rowId}|${colId}` -> cell, for completed matches only. */
  cells: Map<string, H2HCell>;
}

/** Group A players × Group B players: the result of each pairing, from the row player's side. */
export function buildHeadToHead(matches: Match[], teams: Team[]): H2HMatrix {
  const rows = teams.filter((t) => teamGroup(t) === 'A');
  const cols = teams.filter((t) => teamGroup(t) === 'B');
  const rowIds = new Set(rows.map((t) => t.id));
  const colIds = new Set(cols.map((t) => t.id));
  const cells = new Map<string, H2HCell>();

  for (const m of matches) {
    if (m.status !== 'completed' || m.homeScore == null || m.awayScore == null) continue;
    let rowId = m.homeTeamId;
    let colId = m.awayTeamId;
    let rowGoals = m.homeScore;
    let colGoals = m.awayScore;
    if (!rowIds.has(rowId) && rowIds.has(colId)) {
      [rowId, colId] = [colId, rowId];
      [rowGoals, colGoals] = [colGoals, rowGoals];
    }
    if (!rowIds.has(rowId) || !colIds.has(colId)) continue;
    cells.set(rowId + '|' + colId, {
      rowGoals,
      colGoals,
      result: rowGoals > colGoals ? 'W' : rowGoals < colGoals ? 'L' : 'D',
    });
  }
  return { rows, cols, cells };
}
