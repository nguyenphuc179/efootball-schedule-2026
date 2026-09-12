export type ActivityAction =
  | 'tournament_create'
  | 'tournament_update'
  | 'tournament_end'
  | 'tournament_reopen'
  | 'tournament_delete'
  | 'team_create'
  | 'team_update'
  | 'team_delete'
  | 'player_add'
  | 'player_remove'
  | 'result_update'
  | 'match_delete'
  | 'fixtures_generate'
  | 'poll_create'
  | 'poll_delete'
  | 'poll_vote'
  | 'user_role_change'
  | 'user_disabled_change'
  | 'user_name_override'
  | 'lineup_upload'
  | 'lineup_remove'
  | 'champion_create'
  | 'champion_update'
  | 'champion_delete'
  | 'manager_image_set'
  | 'manager_image_remove'
  | 'activity_log_purge';

/** Admin-only audit trail entry — one per notable mutation across the app. Immutable once written
 *  (see firestore.rules `activityLogs/{logId}`); `actorEmail`/`actorName` are a snapshot at write
 *  time so history stays truthful even if the account is later renamed. */
export interface ActivityLog {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  actorName: string;
  action: ActivityAction;
  description: string;
  tournamentId: string | null;
  /** The app route the actor was on when the action happened (Angular `Router.url`, e.g.
   *  `/ranking` or `/tournaments/abc123`) — auto-captured by `ActivityLogService.log()`, never
   *  passed in by callers. Lets an admin see which screen a change was made from. */
  sourcePath: string;
  /** Stable menu bucket for `sourcePath` (see `menuInfoForPath` in
   *  `shared/utils/activity-menu.util.ts`) — a plain equality-filterable field, since `sourcePath`
   *  itself varies per tournament/match id and can't be filtered on directly. */
  menuKey: string;
  createdDate: number;
}

/** Per-admin bulk read cursor — doc id is the admin's own uid. Everything with `createdDate <=
 *  lastSeenAt` counts as seen for that admin regardless of `activityLogSeen/{uid}/items`. Kept
 *  separate from individual entries because `activityLogs` itself is immutable
 *  (`allow update: if false`), so "mark all as seen" stays a single cheap write. */
export interface ActivityLogSeen {
  lastSeenAt: number;
}

/** One individually-marked-seen entry, newer than the bulk `lastSeenAt` cursor — doc id is the
 *  `activityLogs` entry's own id. Only needed for the "mark this one as seen" action; a later
 *  "mark all as seen" makes any of these redundant (but harmless) since it advances the cursor
 *  past them anyway. */
export interface ActivityLogSeenItem {
  id: string;
  seenAt: number;
}
