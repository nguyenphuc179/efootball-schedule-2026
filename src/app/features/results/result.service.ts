import { Injectable, inject } from '@angular/core';
import { MatchService } from '../fixtures/match.service';
import { FinalStageService } from '../fixtures/final-stage.service';
import { StandingsService } from '../standings/standings.service';
import { NotificationService } from '../notifications/notification.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { Match } from '../../models/match.model';

/**
 * Orchestrates "enter a match result": updates the match document, recalculates the whole
 * tournament's standings, and fires a `result_updated` notification — matching the spec's
 * "After saving: Update Standing / Update Statistics / Trigger notifications" requirement.
 *
 * Firestore JS SDK transactions can't easily span an unbounded number of documents (standings
 * recalculation touches one row per team), so this uses a sequential write + batch recalculation
 * instead of a single `runTransaction`. If the client goes offline mid-flow, the match update is
 * queued by Firestore's persistence layer and delivered on reconnect; the standings recalculation
 * is safe to re-run (idempotent) and is also triggered on every app resume for the currently
 * viewed tournament as a safety net (see TournamentDetailComponent).
 */
@Injectable({ providedIn: 'root' })
export class ResultService {
  private matchService = inject(MatchService);
  private finalStageService = inject(FinalStageService);
  private standingsService = inject(StandingsService);
  private notificationService = inject(NotificationService);
  private offlineSync = inject(OfflineSyncService);

  async saveResult(
    match: Match,
    homeScore: number,
    awayScore: number,
    penalties?: { home: number; away: number } | null
  ): Promise<void> {
    const usePens = homeScore === awayScore && !!penalties;
    await this.offlineSync.trackWrite(
      this.matchService.update(match.id, {
        homeScore,
        awayScore,
        // Only a level knockout match keeps a shootout; otherwise clear any stale values.
        penaltyHome: usePens ? penalties!.home : null,
        penaltyAway: usePens ? penalties!.away : null,
        status: 'completed',
      })
    );

    await this.standingsService.recalculate(match.tournamentId);

    // Knockout result → push winners/losers into the next round's placeholders.
    if (!match.groupName) {
      await this.finalStageService.syncFromResults(match.tournamentId).catch(() => undefined);
    }

    await this.notificationService.broadcast({
      title: 'Result Updated',
      body: `${match.homeTeamName ?? 'Home'} ${homeScore} - ${awayScore} ${match.awayTeamName ?? 'Away'}`,
      type: 'result_updated',
      audience: 'all',
      targetUid: null,
      tournamentId: match.tournamentId,
    });
  }
}
