export interface Team {
  id: string;
  tournamentId: string;
  teamName: string;
  logo: string | null;
  /** Cached display name (admin override → login name → email, see `userDisplayName`) from the
   *  manager's account at save time — kept in sync opportunistically by `LineupViewComponent`'s
   *  backfill effect. Besides being shown in team lists, the external capture tool reads this off
   *  the same public `teams` doc it already queries by `managerEmail` and uses it as the
   *  human-friendly `actorName` for its "/history" entries instead of a raw Gmail address — see
   *  LINEUP_TOOL_INTEGRATION.md. */
  manager: string;
  managerUid: string | null;
  /** Cached from the manager's login profile at save time — used as the avatar when no logo is set. */
  managerPhotoURL: string | null;
  /** Cached from the manager's login profile at save time (lowercased/trimmed) — lets the external
   *  capture tool look up "which tournaments does this Gmail manage a team in" via a plain
   *  `where('managerEmail', '==', email)` query on this public-read collection, with no Firebase
   *  Auth or backend involved. See LINEUP_TOOL_INTEGRATION.md. */
  managerEmail: string | null;
  createdDate: number;
  /** Set only for team_match tournaments: which group this player belongs to. */
  groupLabel?: 'A' | 'B' | null;
  /** @deprecated Old name of `groupLabel`; still present on teams saved before the rename. */
  clubLabel?: 'A' | 'B' | null;
  /** team_match only: football clubs (e.g. "Real Madrid") this player may pick when entering a result. */
  allowedClubs?: string[];
}

/** A team_match player's group (A/B), reading the pre-rename `clubLabel` as a fallback. */
export function teamGroup(t: Pick<Team, 'groupLabel' | 'clubLabel'> | undefined | null): 'A' | 'B' | null {
  return t?.groupLabel ?? t?.clubLabel ?? null;
}

export type TeamDraft = Omit<Team, 'id' | 'createdDate'>;
