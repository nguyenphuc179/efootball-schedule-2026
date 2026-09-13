import { Injectable, computed, inject } from '@angular/core';
import { where } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { TournamentService } from '../tournament/tournament.service';
import { Match, matchWinner } from '../../models/match.model';
import { Team } from '../../models/team.model';
import { AppUser, userDisplayName } from '../../models/user.model';
import { liveUserProfiles, uidsKey } from '../../shared/utils/live-user-profiles.util';

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

/** One row of `RankingService.historyFor()` — a manager's record with a single team in a single
 *  tournament (a team belongs to exactly one tournament, so this doubles as "which tournaments
 *  has this person played in"). */
export interface ManagerTournamentEntry {
  tournamentId: string;
  tournamentName: string;
  teamName: string;
  teamLogo: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
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
  private tournamentService = inject(TournamentService);

  private teams = toSignal(this.fs.streamCollection<Team>('teams'), { initialValue: [] as Team[] });
  private matches = toSignal(
    this.fs.streamCollection<Match>('matches', where('status', '==', 'completed')),
    { initialValue: [] as Match[] }
  );

  /** Stable, order-independent key so the profile stream below only re-subscribes when the
   *  actual SET of manager uids changes, not on every unrelated team edit. */
  private managerUidsKey = computed(() => uidsKey(this.teams().map((t) => t.managerUid)));

  /** Live current name + email for every manager who holds a team, keyed by uid — falls back to
   *  each team's denormalized `manager` name string for a guest viewer (see `liveUserProfiles`). */
  private managerProfiles = toSignal(liveUserProfiles(this.fs, toObservable(this.managerUidsKey)), {
    initialValue: new Map<string, AppUser>(),
  });

  /** teamId -> resolved identity, shared by `ranking` and `historyFor`. `key` groups teams under
   *  the same person even across a rename (uid-based); a team with no linked account groups by its
   *  raw manager-name string instead. */
  private identityByTeamId = computed(() => {
    const profiles = this.managerProfiles();
    const map = new Map<string, { key: string; name: string; uid?: string; email?: string }>();
    for (const t of this.teams()) {
      const fallbackName = t.manager?.trim();
      if (t.managerUid) {
        const profile = profiles.get(t.managerUid);
        const name = (profile && userDisplayName(profile, '')) || fallbackName;
        if (!name) continue;
        map.set(t.id, { key: t.managerUid, name, uid: t.managerUid, email: profile?.email?.trim() || undefined });
      } else if (fallbackName) {
        map.set(t.id, { key: `name:${fallbackName}`, name: fallbackName });
      }
    }
    return map;
  });

  readonly ranking = computed<ManagerRank[]>(() => {
    const identityOf = this.identityByTeamId();

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

  /** One row per team this manager has ever held (= one row per tournament) — the "Xếp hạng" row's
   *  detail drill-down, since `ranking` above only keeps the all-time total. Matches the same
   *  identity key `ranking` groups by (`ManagerRank.uid`, falling back to `name:<manager>` for a
   *  legacy team with no linked account), so a row here always lines up with exactly one leaderboard
   *  entry. */
  historyFor(manager: ManagerRank): ManagerTournamentEntry[] {
    const key = manager.uid ?? `name:${manager.manager}`;
    const identity = this.identityByTeamId();
    const tournaments = this.tournamentService.all();

    const entries = new Map<string, ManagerTournamentEntry>(); // teamId -> entry
    for (const t of this.teams()) {
      if (identity.get(t.id)?.key !== key) continue;
      entries.set(t.id, {
        tournamentId: t.tournamentId,
        tournamentName: tournaments.find((tt) => tt.id === t.tournamentId)?.name ?? t.tournamentId,
        teamName: t.teamName,
        teamLogo: t.logo,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    for (const m of this.matches()) {
      if (m.homeScore == null || m.awayScore == null) continue;
      const winnerSide = matchWinner(m);
      for (const side of ['home', 'away'] as const) {
        const entry = entries.get(side === 'home' ? m.homeTeamId : m.awayTeamId);
        if (!entry) continue;
        const gf = side === 'home' ? m.homeScore : m.awayScore;
        const ga = side === 'home' ? m.awayScore : m.homeScore;
        entry.played++;
        entry.goalDifference += gf - ga;
        if (!winnerSide) {
          entry.draws++;
          entry.points += DRAW;
        } else if (winnerSide === side) {
          entry.wins++;
          entry.points += WIN;
        } else {
          entry.losses++;
        }
      }
    }

    return [...entries.values()].sort(
      (a, b) => b.points - a.points || a.tournamentName.localeCompare(b.tournamentName)
    );
  }
}
