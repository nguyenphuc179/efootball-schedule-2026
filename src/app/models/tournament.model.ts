export type TournamentType = 'round_robin' | 'knockout' | 'group_knockout';

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
