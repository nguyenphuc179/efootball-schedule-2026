import { Injectable, computed, inject } from '@angular/core';
import { where } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { Match, matchWinner } from '../../models/match.model';
import { Team } from '../../models/team.model';
import { AppUser, userDisplayName } from '../../models/user.model';

/** Points: a win (incl. a penalty-shootout win) = 3, a genuine draw = 1. */
const WIN = 3;
const DRAW = 1;

export interface ManagerRank {
  manager: string;
  /** The manager's account uid — absent only for legacy teams with no linked account. Match on
   *  this (not the display name) to find "is this ranking row me/this person", since the name can
   *  change. */
  uid?: string;
  email?: string;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  teamCount: number;
}

/**
 * All-time manager leaderboard. A manager's score is the sum of points across every completed
 * match played by any team they hold, in any tournament (group stage through knockout). Once all
 * their teams are out there are no more matches to score, so it stops naturally.
 *
 * Grouped by `managerUid` (not the team's denormalized `manager` name string) so a manager who
 * holds several teams — created at different times, possibly under different display names —
 * always lands in one row, and a rename shows up immediately instead of waiting for every team
 * to be re-saved. Teams with no linked account (legacy data) fall back to grouping by name.
 */
@Injectable({ providedIn: 'root' })
export class RankingService {
  private fs = inject(FirestoreBaseService);

  private teams = toSignal(this.fs.streamCollection<Team>('teams'), { initialValue: [] as Team[] });
  private matches = toSignal(
    this.fs.streamCollection<Match>('matches', where('status', '==', 'completed')),
    { initialValue: [] as Match[] }
  );

  /** Stable, order-independent key so the profile stream below only re-subscribes when the
   *  actual SET of manager uids changes, not on every unrelated team edit. */
  private managerUidsKey = computed(() =>
    [...new Set(this.teams().map((t) => t.managerUid).filter((u): u is string => !!u))].sort().join('|')
  );

  /** Live current name + email for every manager who holds a team, keyed by uid. Firestore rules
   *  require sign-in to read a `users/{uid}` doc (`allow get: if isSignedIn()`) — for a guest this
   *  silently resolves to nothing per uid, and the ranking below falls back to each team's
   *  denormalized `manager` name string instead. */
  private managerProfiles = toSignal(
    toObservable(this.managerUidsKey).pipe(
      switchMap((key) => {
        const uids = key ? key.split('|') : [];
        if (!uids.length) return of(new Map<string, AppUser>());
        return combineLatest(
          uids.map((uid) => this.fs.streamDoc<AppUser>(`users/${uid}`).pipe(catchError(() => of(undefined))))
        ).pipe(
          map(
            (users) =>
              new Map(
                uids.map((uid, i) => [uid, users[i]] as const).filter((e): e is [string, AppUser] => !!e[1])
              )
          )
        );
      })
    ),
    { initialValue: new Map<string, AppUser>() }
  );

  readonly ranking = computed<ManagerRank[]>(() => {
    const profiles = this.managerProfiles();

    // teamId -> resolved identity. `key` groups teams under the same person even across a rename
    // (uid-based); a team with no linked account groups by its raw manager-name string instead.
    const identityOf = new Map<string, { key: string; name: string; uid?: string; email?: string }>();
    for (const t of this.teams()) {
      const fallbackName = t.manager?.trim();
      if (t.managerUid) {
        const profile = profiles.get(t.managerUid);
        const name = (profile && userDisplayName(profile, '')) || fallbackName;
        if (!name) continue;
        identityOf.set(t.id, { key: t.managerUid, name, uid: t.managerUid, email: profile?.email?.trim() || undefined });
      } else if (fallbackName) {
        identityOf.set(t.id, { key: `name:${fallbackName}`, name: fallbackName });
      }
    }

    const teamCountByKey = new Map<string, number>();
    for (const { key } of identityOf.values()) {
      teamCountByKey.set(key, (teamCountByKey.get(key) ?? 0) + 1);
    }

    const stats = new Map<string, ManagerRank>();
    const row = (key: string, name: string, uid: string | undefined, email: string | undefined): ManagerRank => {
      let r = stats.get(key);
      if (!r) {
        r = {
          manager: name,
          uid,
          email,
          points: 0,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalDifference: 0,
          teamCount: teamCountByKey.get(key) ?? 0,
        };
        stats.set(key, r);
      }
      return r;
    };

    // Every team-holding manager shows up even before their first match (0 played).
    for (const { key, name, uid, email } of identityOf.values()) row(key, name, uid, email);

    for (const m of this.matches()) {
      if (m.homeScore == null || m.awayScore == null) continue;
      const winnerSide = matchWinner(m); // 'home' | 'away' | null (pens break a level score)
      for (const side of ['home', 'away'] as const) {
        const identity = identityOf.get(side === 'home' ? m.homeTeamId : m.awayTeamId);
        if (!identity) continue;
        const r = row(identity.key, identity.name, identity.uid, identity.email);
        const gf = side === 'home' ? m.homeScore : m.awayScore;
        const ga = side === 'home' ? m.awayScore : m.homeScore;
        r.played++;
        r.goalDifference += gf - ga;
        if (!winnerSide) {
          r.draws++;
          r.points += DRAW;
        } else if (winnerSide === side) {
          r.wins++;
          r.points += WIN;
        } else {
          r.losses++;
        }
      }
    }

    return [...stats.values()].sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        b.goalDifference - a.goalDifference ||
        a.manager.localeCompare(b.manager)
    );
  });
}
