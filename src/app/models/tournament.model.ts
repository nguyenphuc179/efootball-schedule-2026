export type TournamentType = 'round_robin' | 'knockout' | 'group_knockout';
export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  image: string | null;
  location: string;
  startDate: number; // epoch millis
  endDate: number;
  status: TournamentStatus;
  type: TournamentType;
  numberOfTeams: number;
  createdBy: string; // uid
  createdDate: number;
}

export type TournamentDraft = Omit<Tournament, 'id' | 'createdDate' | 'status' | 'createdBy'>;

export const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  round_robin: 'Round Robin',
  knockout: 'Knockout',
  group_knockout: 'Group Stage + Knockout',
};

export function deriveTournamentStatus(startDate: number, endDate: number, now = Date.now()): TournamentStatus {
  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'completed';
  return 'ongoing';
}
