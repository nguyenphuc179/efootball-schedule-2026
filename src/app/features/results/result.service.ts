import { Injectable, inject } from '@angular/core';
import { Firestore, doc, runTransaction } from '@angular/fire/firestore';
import { FinalStageService } from '../fixtures/final-stage.service';
import { StandingsService } from '../standings/standings.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { AuthService } from '../../core/services/auth.service';
import { Match } from '../../models/match.model';

/** Thrown by `saveResult` when the match changed since the caller loaded it. */
export class ResultConflictError extends Error {
  constructor(readonly current: Match) {
    super('The match result was changed by someone else.');
    this.name = 'ResultConflictError';
  }
}

/**
 * Orchestrates "enter a match result": updates the match document, recalculates the whole
 * tournament's standings, and records an activity log entry — matching the spec's
 * "After saving: Update Standing / Update Statistics / Trigger notifications" requirement.
 *
 * The match write is a transaction guarded by `Match.version` (optimistic concurrency): two people
 * on the result screen at once can no longer silently overwrite each other — the later save is
 * refused with a `ResultConflictError` carrying what's there now, and the caller decides. That
 * needs a connection; offline, the save fails with `unavailable` instead of being queued.
 * Standings recalculation stays a separate, idempotent step (one row per team is too many
 * documents for the same transaction).
 */
@Injectable({ providedIn: 'root' })
export class ResultService {
  private firestore = inject(Firestore);
  private finalStageService = inject(FinalStageService);
  private standingsService = inject(StandingsService);
  private activityLog = inject(ActivityLogService);
  private offlineSync = inject(OfflineSyncService);
  private auth = inject(AuthService);

  /**
   * @param expectedVersion the `version` the caller's copy of the match had (0 when absent). The
   *   save only goes through if the stored match still has it.
   */
  async saveResult(
    match: Match,
    expectedVersion: number,
    homeScore: number,
    awayScore: number,
    penalties?: { home: number; away: number } | null,
    clubs?: { home: string | null; away: string | null } | null
  ): Promise<void> {
    const usePens = homeScore === awayScore && !!penalties;
    const ref = doc(this.firestore, `matches/${match.id}`);

    await this.offlineSync.trackWrite(
      runTransaction(this.firestore, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Match not found');
        const current = { id: snap.id, ...snap.data() } as Match;
        const version = current.version ?? 0;
        if (version !== expectedVersion) throw new ResultConflictError(current);

        tx.update(ref, {
          homeScore,
          awayScore,
          // Only a level knockout match keeps a shootout; otherwise clear any stale values.
          penaltyHome: usePens ? penalties!.home : null,
          penaltyAway: usePens ? penalties!.away : null,
          status: 'completed',
          ...(clubs ? { homeClub: clubs.home, awayClub: clubs.away } : {}),
          version: version + 1,
          resultByUid: this.auth.firebaseUser()?.uid ?? null,
          resultByName: this.auth.displayName(),
          resultAt: Date.now(),
        });
      })
    );

    await this.standingsService.recalculate(match.tournamentId);

    // Knockout result → push winners/losers into the next round's placeholders.
    if (!match.groupName) {
      await this.finalStageService.syncFromResults(match.tournamentId).catch(() => undefined);
    }

    // Team names are often numbered ("Team 2", "Team 9"), so a bare "Team 2 3 - 2 Team 9" reads as
    // one confusing run of digits — "vs" plus a "tỉ số là:" lead-in keeps team names and the score
    // visually separate.
    const homeClub = clubs ? clubs.home : match.homeClub;
    const awayClub = clubs ? clubs.away : match.awayClub;
    const side = (name: string, club?: string | null) => (club ? `${name} (${club})` : name);
    await this.activityLog.log(
      'result_update',
      `Đã cập nhật kết quả trận ${side(match.homeTeamName ?? 'Home', homeClub)} vs ${side(match.awayTeamName ?? 'Away', awayClub)}, tỉ số là: ${homeScore} - ${awayScore}`,
      match.tournamentId
    );
  }
}
