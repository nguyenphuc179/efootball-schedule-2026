import { Injectable, computed, inject } from '@angular/core';
import { where } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { Match, matchWinner } from '../../models/match.model';
import { Team } from '../../models/team.model';

/** Points: a win (incl. a penalty-shootout win) = 3, a genuine draw = 1. */
const WIN = 3;
const DRAW = 1;

export interface ManagerRank {
  manager: string;
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
 */
@Injectable({ providedIn: 'root' })
export class RankingService {
  private fs = inject(FirestoreBaseService);

  private teams = toSignal(this.fs.streamCollection<Team>('teams'), { initialValue: [] as Team[] });
  private matches = toSignal(
    this.fs.streamCollection<Match>('matches', where('status', '==', 'completed')),
    { initialValue: [] as Match[] }
  );

  readonly ranking = computed<ManagerRank[]>(() => {
    const managerOf = new Map<string, string>(); // teamId -> manager name
    for (const t of this.teams()) {
      const name = t.manager?.trim();
      if (name) managerOf.set(t.id, name);
    }

    const stats = new Map<string, ManagerRank>();
    const row = (manager: string): ManagerRank => {
      let r = stats.get(manager);
      if (!r) {
        r = { manager, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalDifference: 0, teamCount: 0 };
        stats.set(manager, r);
      }
      return r;
    };
    for (const name of new Set(managerOf.values())) {
      row(name).teamCount = [...managerOf.values()].filter((m) => m === name).length;
    }

    for (const m of this.matches()) {
      if (m.homeScore == null || m.awayScore == null) continue;
      const winnerSide = matchWinner(m); // 'home' | 'away' | null (pens break a level score)
      for (const side of ['home', 'away'] as const) {
        const manager = managerOf.get(side === 'home' ? m.homeTeamId : m.awayTeamId);
        if (!manager) continue;
        const r = row(manager);
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
