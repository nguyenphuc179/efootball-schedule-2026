/** A Hall of Fame entry — the champion of one season / tournament. */
export interface Champion {
  id: string;
  season: number; // "Mùa giải : 18"
  playerName: string; // "LÊ TÙNG DƯƠNG"
  club: string; // "Netherland"
  imageUrl: string; // champion poster (external URL — Spark plan has no Storage)
  tournamentId?: string | null; // optional link to the source tournament
  createdDate: number;
}

export type ChampionDraft = Omit<Champion, 'id' | 'createdDate'>;
