export interface Team {
  id: string;
  tournamentId: string;
  teamName: string;
  logo: string | null;
  manager: string;
  managerUid: string | null;
  playersCount: number;
  createdDate: number;
}

export type TeamDraft = Omit<Team, 'id' | 'createdDate' | 'playersCount'>;
