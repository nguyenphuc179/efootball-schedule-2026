export type TournamentType = 'round_robin' | 'knockout' | 'group_knockout' | 'team_match';

/** A tournament is "in_progress" from creation until an admin ends it. */
export type TournamentStatus = 'in_progress' | 'completed';

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
  endedAt?: number | null; // set when an admin manually ends the tournament -> status stays 'completed'
  /** uid of the one non-admin manager (if any) an admin has designated to click the fixture/bracket
   *  "Generate" buttons themselves, for visible transparency around the draw — see the "Phân quyền"
   *  tab. Admin can always generate too; this only ever adds permission, never removes it. */
  fixtureGeneratorUid?: string | null;
  /** team_match only: house rules for picking the football club in a match (see `resolveTeamMatchRules`). */
  teamMatchRules?: Partial<TeamMatchRules> | null;
  /** team_match only: link of the Facebook group the "Share" button opens (after copying the results image). */
  facebookGroupUrl?: string | null;
}

export interface TeamMatchRules {
  /** A side whose player has assigned clubs must pick one before the result can be saved. */
  requireClub: boolean;
  /** A player may not reuse a club in another of their own matches. */
  uniquePerPlayer: boolean;
  /** The two players in one match may not pick the same club. */
  noMirror: boolean;
  /** A club may be used once per group: no two players of the same group share a club. */
  uniquePerGroup: boolean;
}

/** Applied to tournaments saved before the rules existed (they behaved like this). */
export const DEFAULT_TEAM_MATCH_RULES: TeamMatchRules = {
  requireClub: true,
  uniquePerPlayer: true,
  noMirror: false,
  uniquePerGroup: false,
};

export function resolveTeamMatchRules(t?: Pick<Tournament, 'teamMatchRules'> | null): TeamMatchRules {
  return { ...DEFAULT_TEAM_MATCH_RULES, ...(t?.teamMatchRules ?? {}) };
}

export type TournamentDraft = Omit<
  Tournament,
  'id' | 'createdDate' | 'status' | 'createdBy' | 'endedAt'
>;

/** i18n keys (not display text) — pipe through `| translate` at the usage site. */
export const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  round_robin: 'TOURNAMENT_TYPE.ROUND_ROBIN',
  knockout: 'TOURNAMENT_TYPE.KNOCKOUT',
  group_knockout: 'TOURNAMENT_TYPE.GROUP_KNOCKOUT',
  team_match: 'TOURNAMENT_TYPE.TEAM_MATCH',
};

/** i18n keys (not display text) — pipe through `| translate` at the usage site. */
export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  in_progress: 'TOURNAMENT_STATUS.IN_PROGRESS',
  completed: 'TOURNAMENT_STATUS.COMPLETED',
};

/** Coerces any legacy status ('upcoming' / 'ongoing') to the current two-state model. */
export function normalizeStatus(status: unknown): TournamentStatus {
  return status === 'completed' ? 'completed' : 'in_progress';
}
