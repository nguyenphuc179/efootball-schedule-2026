export interface Team {
  id: string;
  tournamentId: string;
  teamName: string;
  logo: string | null;
  manager: string;
  managerUid: string | null;
  /** Cached from the manager's login profile at save time — used as the avatar when no logo is set. */
  managerPhotoURL: string | null;
  playersCount: number;
  createdDate: number;
}

export type TeamDraft = Omit<Team, 'id' | 'createdDate' | 'playersCount'>;
