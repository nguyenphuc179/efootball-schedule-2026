import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { QueryConstraint, limit, orderBy, where } from '@angular/fire/firestore';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreBaseService } from './firestore-base.service';
import { AuthService } from './auth.service';
import { userDisplayName } from '../../models/user.model';
import { menuInfoForPath } from '../../shared/utils/activity-menu.util';
import { ActivityAction, ActivityLog, ActivityLogSeen, ActivityLogSeenItem } from '../../models/activity-log.model';

const PATH = 'activityLogs';
const SEEN_PATH = 'activityLogSeen';
const SEEN_ITEMS_SUBPATH = (uid: string) => `${SEEN_PATH}/${uid}/items`;
/** Bound for the live "unseen" badge query — a banking-app-style badge doesn't need an exact
 *  count past this; the bell shows "99+" once it's hit. */
const UNSEEN_CAP = 100;

export interface SeenState {
  /** Everything with `createdDate <= lastSeenAt` is seen, regardless of `seenIds`. */
  lastSeenAt: number;
  /** Entries newer than `lastSeenAt` that were individually marked seen (see `markSeen`). */
  seenIds: Set<string>;
}

/**
 * App-wide audit trail. Any signed-in user may write an entry (see firestore.rules — the write
 * side is intentionally open so every action-taking service can log without extra auth plumbing),
 * but only for themselves as actor. Reading back is where the scopes differ: an admin can read
 * every entry ("/history"); anyone else can only read entries where they're the actor or the
 * `subjectUid` — see `streamMine()`, their own personal feed on that same page/route.
 *
 * Lives under core/services (not a feature folder) because AuthService itself needs to call
 * `log()` for role/lock-out changes — keeping this in core avoids a core -> feature -> core import
 * cycle with AuthService.
 */
@Injectable({ providedIn: 'root' })
export class ActivityLogService {
  private fs = inject(FirestoreBaseService);
  private auth = inject(AuthService);
  private router = inject(Router);

  private firebaseUser$ = toObservable(this.auth.firebaseUser);

  /** The current signed-in user's resolved display name (admin override → login name → email) —
   *  the same name `log()` stamps as `actorName` and prepends to `description` (see `log()`). */
  private currentActorName(): string {
    const email = this.auth.appUser()?.email ?? this.auth.firebaseUser()?.email ?? null;
    return userDisplayName(this.auth.appUser(), this.auth.firebaseUser()?.displayName || email || 'Unknown');
  }

  /** "admin" / "user" — role label prepended to every log description (see `log()`). Both are a
   *  deliberate exception to the "hardcoded Vietnamese sentence" rule the rest of this app's log
   *  descriptions follow — kept in English per explicit request, unlike the Members page's own
   *  Vietnamese role labels ("Quản trị"/"Người xem", `MEMBERS.ROLE_ADMIN`/`ROLE_VIEWER`), which are
   *  untouched. */
  private currentRoleLabel(): string {
    return this.auth.appUser()?.role === 'admin' ? 'admin' : 'user';
  }

  /**
   * Records one action by the currently signed-in user. Never throws — a logging failure must
   * never break the real mutation it's attached to, so callers can simply `await` this as their
   * last step without extra try/catch boilerplate.
   *
   * `description` should read as a sentence starting with a capital letter (e.g. "Đã xoá đội
   * ..." — matches every existing call site) — `log()` itself prepends "{tên} ({vai trò}) " and
   * lowercases that first letter, so the stored sentence reads as "PhucNT18 (Quản trị) đã xoá đội
   * ...". This is the ONE place that stamps who-did-it onto the sentence, so every action across
   * the app shows it consistently without every call site having to build that prefix itself.
   *
   * `subjectUid` names the user the action is ABOUT when that's someone other than the actor (e.g.
   * an admin uploading/removing a manager's lineup slot) — it's what lets that other user read this
   * entry back under firestore.rules despite not being the actor. Leave it `null` (the default)
   * when the action has no distinct subject.
   */
  async log(
    action: ActivityAction,
    description: string,
    tournamentId: string | null = null,
    subjectUid: string | null = null
  ): Promise<void> {
    try {
      const uid = this.auth.firebaseUser()?.uid;
      if (!uid) return;
      const email = this.auth.appUser()?.email ?? this.auth.firebaseUser()?.email ?? null;
      const name = this.currentActorName();
      const role = this.currentRoleLabel();
      const attributedDescription = `${name} (${role}) ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
      const sourcePath = this.router.url;
      await this.fs.add<Omit<ActivityLog, 'id' | 'createdDate'>>(PATH, {
        actorUid: uid,
        actorEmail: email,
        actorName: name,
        action,
        description: attributedDescription,
        tournamentId,
        subjectUid,
        sourcePath,
        menuKey: menuInfoForPath(sourcePath).key,
      });
    } catch (err) {
      console.error('[ActivityLogService] log failed', action, err);
    }
  }

  /** Live "actor OR subject" feed for one uid, merged/de-duped/sorted client-side (Firestore can't
   *  OR two different fields in one query) — the shared shape behind the admin manager filter
   *  (`streamFiltered`) and a non-admin's own personal feed (`streamMine`): a capture-tool or
   *  admin-driven lineup entry is stamped with a sentinel/admin `actorUid`, and the real manager
   *  only appears as `subjectUid`, so filtering on `actorUid` alone would silently hide every one of
   *  their lineup notifications. `menuKey`, when given, is pushed into both underlying queries
   *  (cheaper and more correct than fetching unfiltered then filtering the merged array client-side
   *  — see firestore.indexes.json for the composite indexes this needs on both fields). */
  private streamActorOrSubject(uid: string, menuKey: string | null, limitCount: number): Observable<ActivityLog[]> {
    const byField = (field: 'actorUid' | 'subjectUid') => {
      const constraints: QueryConstraint[] = [where(field, '==', uid)];
      if (menuKey) constraints.push(where('menuKey', '==', menuKey));
      constraints.push(orderBy('createdDate', 'desc'), limit(limitCount));
      return this.fs.streamCollection<ActivityLog>(PATH, ...constraints);
    };
    return combineLatest([byField('actorUid'), byField('subjectUid')]).pipe(
      map(([asActor, asSubject]) => {
        const merged = new Map<string, ActivityLog>();
        for (const entry of [...asActor, ...asSubject]) merged.set(entry.id, entry);
        return [...merged.values()].sort((a, b) => b.createdDate - a.createdDate).slice(0, limitCount);
      })
    );
  }

  /** One-shot exact count for the same "actor OR subject" shape as `streamActorOrSubject` — via
   *  inclusion-exclusion (`count(actor) + count(subject) - count(actor AND subject)`) rather than
   *  fetching every matching document just to `.length` them. All three are count-aggregation
   *  queries (cheap — server-computed, not billed per matched document) and equality-only (no
   *  composite index needed, unlike the live streams above which also `orderBy`). */
  private async countActorOrSubject(uid: string, menuKey: string | null): Promise<number> {
    const menuConstraint: QueryConstraint[] = menuKey ? [where('menuKey', '==', menuKey)] : [];
    const [actorCount, subjectCount, bothCount] = await Promise.all([
      this.fs.count(PATH, where('actorUid', '==', uid), ...menuConstraint),
      this.fs.count(PATH, where('subjectUid', '==', uid), ...menuConstraint),
      this.fs.count(PATH, where('actorUid', '==', uid), where('subjectUid', '==', uid), ...menuConstraint),
    ]);
    return actorCount + subjectCount - bothCount;
  }

  /** Live "/history" admin listing, newest first, capped at `limitCount` — optionally restricted to
   *  one menu bucket and/or one manager. A live `streamCollection` rather than a one-shot fetch so
   *  the list itself updates in real time (e.g. from a capture-tool upload elsewhere) instead of
   *  only the bell badge — `ActivityLogComponent` grows `limitCount` for "load more" instead of a
   *  cursor, which also keeps re-subscribing correctly instead of stitching pages of a stale
   *  snapshot together. With no manager filter it's the plain single query; with one, see
   *  `streamActorOrSubject`. */
  streamFiltered(menuKey: string | null, managerUid: string | null, limitCount: number): Observable<ActivityLog[]> {
    if (!managerUid) {
      const constraints: QueryConstraint[] = [];
      if (menuKey) constraints.push(where('menuKey', '==', menuKey));
      constraints.push(orderBy('createdDate', 'desc'), limit(limitCount));
      return this.fs.streamCollection<ActivityLog>(PATH, ...constraints);
    }
    return this.streamActorOrSubject(managerUid, menuKey, limitCount);
  }

  /** Exact total for `streamFiltered`'s current filters — powers the "Tổng thông báo" count above
   *  the "/history" listing. Not itself live (Firestore's count aggregation is one-shot), so
   *  `ActivityLogComponent` re-runs this whenever the live listing changes, which is exactly when
   *  the total could have changed anyway. */
  async countFiltered(menuKey: string | null, managerUid: string | null): Promise<number> {
    if (!managerUid) {
      const constraints: QueryConstraint[] = menuKey ? [where('menuKey', '==', menuKey)] : [];
      return this.fs.count(PATH, ...constraints);
    }
    return this.countActorOrSubject(managerUid, menuKey);
  }

  /** One-shot check: does this uid appear anywhere in the log — as the actor, or as the
   *  `subjectUid` of an entry someone else (an admin, or the capture-tool sentinel) performed?
   *  Powers the "/history" manager filter dropdown, which should list any manager there's something
   *  to show for, not only ones who personally triggered an action — no live subscription needed
   *  for a filter dropdown, so a single `limit(1)` lookup per field per candidate is enough. */
  async hasActed(uid: string): Promise<boolean> {
    const [asActor, asSubject] = await Promise.all([
      this.fs.getOnce<ActivityLog>(PATH, where('actorUid', '==', uid), limit(1)),
      this.fs.getOnce<ActivityLog>(PATH, where('subjectUid', '==', uid), limit(1)),
    ]);
    return asActor.length > 0 || asSubject.length > 0;
  }

  /** A non-admin's live personal feed: everything they were the actor OR the `subjectUid` of,
   *  optionally restricted to one menu bucket — see `streamActorOrSubject`. */
  streamMine(uid: string, menuKey: string | null, limitCount: number): Observable<ActivityLog[]> {
    return this.streamActorOrSubject(uid, menuKey, limitCount);
  }

  /** Exact total for `streamMine`'s current filter — see `countFiltered`. */
  async countMine(uid: string, menuKey: string | null): Promise<number> {
    return this.countActorOrSubject(uid, menuKey);
  }

  /** Live combination of the current user's bulk cursor + individually-marked-seen entry ids —
   *  the one source of truth both the bell badge and the "/history" list read "is this seen?"
   *  from. 0/empty (not an error) when signed out. */
  streamSeenState(): Observable<SeenState> {
    return this.firebaseUser$.pipe(
      switchMap((user) => {
        if (!user) return of<SeenState>({ lastSeenAt: 0, seenIds: new Set() });
        const lastSeenAt$ = this.fs
          .streamDoc<ActivityLogSeen>(`${SEEN_PATH}/${user.uid}`)
          .pipe(map((doc) => doc?.lastSeenAt ?? 0));
        const seenIds$ = this.fs
          .streamCollection<ActivityLogSeenItem>(SEEN_ITEMS_SUBPATH(user.uid))
          .pipe(map((items) => new Set(items.map((i) => i.id))));
        return combineLatest([lastSeenAt$, seenIds$]).pipe(
          map(([lastSeenAt, seenIds]) => ({ lastSeenAt, seenIds }))
        );
      })
    );
  }

  /** Live "unseen" count for the current user, capped at `UNSEEN_CAP` — feeds the bell icon's
   *  badge. Subtracts entries that were individually marked seen via `markSeen`. An admin's count
   *  is over the whole collection (they can read all of it); anyone else's is over just their own
   *  actor/subject entries (merged, since that's all firestore.rules lets them read) — each side
   *  capped independently, so the true total past `UNSEEN_CAP` per side is still just shown as
   *  "99+" rather than counted exactly, same tradeoff as the admin case. */
  streamUnseenCount(): Observable<number> {
    return this.streamSeenState().pipe(
      switchMap((state) => {
        if (this.auth.isAdmin()) {
          return this.fs
            .streamCollection<ActivityLog>(
              PATH,
              where('createdDate', '>', state.lastSeenAt),
              orderBy('createdDate', 'desc'),
              limit(UNSEEN_CAP)
            )
            .pipe(map((list) => list.filter((l) => !state.seenIds.has(l.id)).length));
        }
        const uid = this.auth.firebaseUser()?.uid;
        if (!uid) return of(0);
        const asActor$ = this.fs.streamCollection<ActivityLog>(
          PATH,
          where('actorUid', '==', uid),
          where('createdDate', '>', state.lastSeenAt),
          orderBy('createdDate', 'desc'),
          limit(UNSEEN_CAP)
        );
        const asSubject$ = this.fs.streamCollection<ActivityLog>(
          PATH,
          where('subjectUid', '==', uid),
          where('createdDate', '>', state.lastSeenAt),
          orderBy('createdDate', 'desc'),
          limit(UNSEEN_CAP)
        );
        return combineLatest([asActor$, asSubject$]).pipe(
          map(([asActor, asSubject]) => {
            const merged = new Map<string, ActivityLog>();
            for (const entry of [...asActor, ...asSubject]) merged.set(entry.id, entry);
            return [...merged.values()].filter((l) => !state.seenIds.has(l.id)).length;
          })
        );
      })
    );
  }

  /** Marks one entry as seen for the current user — this is what "subtracts" it from the bell
   *  badge without waiting for "mark all as seen". No-op (not an error) once it's already covered
   *  by the bulk cursor. */
  async markSeen(logId: string): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;
    await this.fs.set<Omit<ActivityLogSeenItem, 'id'>>(SEEN_ITEMS_SUBPATH(uid), logId, { seenAt: Date.now() });
  }

  /** Marks every current entry as seen for the current user (a single small cursor write — the
   *  immutable `activityLogs` entries themselves are never touched). Any previously
   *  individually-marked items become redundant but are harmless, so they're left as-is. */
  async markAllSeen(): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return;
    await this.fs.set<ActivityLogSeen>(SEEN_PATH, uid, { lastSeenAt: Date.now() }, true);
  }

  /**
   * Deletes every entry matching the given filters (both null = deletes the whole collection).
   * Equality-only filters need no composite index (no `orderBy` for a delete). Records the purge
   * itself as a brand-new entry afterwards — the deleted rows are gone, but the fact that someone
   * cleared the log at this time is not.
   *
   * A manager filter deletes both `actorUid == managerUid` and `subjectUid == managerUid` matches —
   * same reasoning as `streamFiltered()` — fetched and de-duped by id first (rather than two
   * `removeMatching` calls summed) so a doc matching both sides isn't double-counted in `count`.
   */
  async deleteAll(menuKey: string | null, actorUid: string | null): Promise<number> {
    const menuConstraint = menuKey ? [where('menuKey', '==', menuKey)] : [];
    let count: number;
    if (actorUid) {
      const [byActor, bySubject] = await Promise.all([
        this.fs.getOnce<ActivityLog>(PATH, where('actorUid', '==', actorUid), ...menuConstraint),
        this.fs.getOnce<ActivityLog>(PATH, where('subjectUid', '==', actorUid), ...menuConstraint),
      ]);
      const ids = new Set([...byActor, ...bySubject].map((entry) => entry.id));
      count = await this.fs.removeByIds(PATH, [...ids]);
    } else {
      count = await this.fs.removeMatching(PATH, ...menuConstraint);
    }

    const scope = actorUid && menuKey ? `manager + menu "${menuKey}"` : actorUid ? 'manager' : menuKey ? `menu "${menuKey}"` : 'toàn bộ';
    await this.log('activity_log_purge', `Đã xoá ${count} dòng nhật ký hoạt động (phạm vi: ${scope})`);
    return count;
  }
}
