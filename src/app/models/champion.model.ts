export type ChampionKind = 'individual' | 'team';

/** A Hall of Fame entry — the champion of one season / tournament (a player, or a whole team). */
export interface Champion {
  id: string;
  season: number; // "Mùa giải : 18"
  playerName: string; // "LÊ TÙNG DƯƠNG" — or the team's name for a team champion
  club: string; // "Netherland" (empty for a team champion)
  imageUrl: string; // champion poster (external URL — Spark plan has no Storage)
  tournamentId?: string | null; // optional link to the source tournament
  /** Links this entry to a member account, so the Hall of Fame can resolve the current display
   *  name + email live instead of relying on the (possibly stale) `playerName` snapshot below. */
  managerUid?: string | null;
  /** Missing on entries saved before team champions existed — those are individual. */
  kind?: ChampionKind;
  /** Team champions only: names of the team's members, shown under the team photo. */
  members?: string[] | null;
  createdDate: number;
}

export type ChampionDraft = Omit<Champion, 'id' | 'createdDate'>;
