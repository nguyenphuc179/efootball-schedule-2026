export type PlayerPosition = 'GK' | 'DF' | 'MF' | 'FW';

export interface Player {
  id: string;
  teamId: string;
  fullName: string;
  shirtNumber: number;
  position: PlayerPosition;
  goals: number;
  yellowCards: number;
  redCards: number;
}

export type PlayerDraft = Omit<Player, 'id' | 'goals' | 'yellowCards' | 'redCards'>;
