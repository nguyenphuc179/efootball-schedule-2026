export interface Team {
  id: string;
  tournamentId: string;
  teamName: string;
  logo: string | null;
  manager: string;
  managerUid: string | null;
  /** Cached from the manager's login profile at save time — used as the avatar when no logo is set. */
  managerPhotoURL: string | null;
  /** Cached from the manager's login profile at save time (lowercased/trimmed) — lets the external
   *  capture tool look up "which tournaments does this Gmail manage a team in" via a plain
   *  `where('managerEmail', '==', email)` query on this public-read collection, with no Firebase
   *  Auth or backend involved. See LINEUP_TOOL_INTEGRATION.md. */
  managerEmail: string | null;
  playersCount: number;
  createdDate: number;
}

export type TeamDraft = Omit<Team, 'id' | 'createdDate' | 'playersCount'>;
