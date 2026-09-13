export type ActivityAction =
  | 'tournament_create'
  | 'tournament_update'
  | 'tournament_end'
  | 'tournament_reopen'
  | 'tournament_delete'
  | 'tournament_reset_matches'
  | 'team_create'
  | 'team_update'
  | 'team_delete'
  | 'result_update'
  | 'match_delete'
  | 'fixtures_generate'
  | 'final_stage_generate'
  | 'poll_create'
  | 'poll_delete'
  | 'poll_vote'
  | 'user_role_change'
  | 'user_disabled_change'
  | 'user_name_override'
  | 'user_photo_set'
  | 'lineup_upload'
  | 'lineup_remove'
  | 'lineup_approve'
  | 'lineup_unapprove'
  | 'champion_create'
  | 'champion_update'
  | 'champion_delete'
  | 'manager_image_set'
  | 'manager_image_remove'
  | 'activity_log_purge';

/** Audit trail entry — one per notable mutation across the app. Immutable once written (see
 *  firestore.rules `activityLogs/{logId}`); `actorEmail`/`actorName` are a snapshot at write time
 *  so history stays truthful even if the account is later renamed. Admins can read every entry
 *  ("/history"); a non-admin can only read entries where they're the `actorUid` or the
 *  `subjectUid` — their own personal "Thông báo của tôi" view on the same page/route. */
export interface ActivityLog {
  id: string;
  /** Real Firebase Auth uid for app-originated actions. The external lineup capture tool (no
   *  Firebase Auth session — see `LineupService`/`LINEUP_TOOL_INTEGRATION.md`) instead writes the
   *  fixed sentinel `'capture-tool'`, enforced by firestore.rules; it never matches a real manager,
   *  so these entries don't show up under the "/history" actor filter, only in the unfiltered list. */
  actorUid: string;
  actorEmail: string | null;
  actorName: string;
  action: ActivityAction;
  description: string;
  tournamentId: string | null;
  /** The user this action is ABOUT, when different from whoever performed it — e.g. on
   *  `lineup_upload`/`lineup_remove` this is the team manager whose slot was touched (the actor is
   *  usually an admin, or the `'capture-tool'` sentinel). `null` when not applicable (most actions
   *  have no distinct "subject"). Lets that manager read the entry under firestore.rules even
   *  though they're not the actor — see `subjectUid` branch of the `activityLogs` read rule. */
  subjectUid: string | null;
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

/** Per-user bulk read cursor — doc id is the owner's own uid (any signed-in, non-disabled user, not
 *  just admins). Everything with `createdDate <= lastSeenAt` counts as seen for that user regardless
 *  of `activityLogSeen/{uid}/items`. Kept separate from individual entries because `activityLogs`
 *  itself is immutable (`allow update: if false`), so "mark all as seen" stays a single cheap write. */
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
