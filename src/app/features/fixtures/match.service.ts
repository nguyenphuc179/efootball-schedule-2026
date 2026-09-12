import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  QueryDocumentSnapshot,
  DocumentData,
  getDoc,
  orderBy,
  where,
  writeBatch,
  doc,
  collection,
} from '@angular/fire/firestore';
import { FirestoreBaseService, PagedResult } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { Match, MatchDraft } from '../../models/match.model';

const PATH = 'matches';

@Injectable({ providedIn: 'root' })
export class MatchService {
  private fs = inject(FirestoreBaseService);
  private firestore = inject(Firestore);
  private activityLog = inject(ActivityLogService);

  streamByTournament(tournamentId: string) {
    return this.fs.streamCollection<Match>(PATH, where('tournamentId', '==', tournamentId), orderBy('matchDate', 'asc'));
  }

  streamUpcoming(limitCount = 6) {
    return this.fs.streamCollection<Match>(
      PATH,
      where('status', '==', 'scheduled'),
      orderBy('matchDate', 'asc')
    );
  }

  streamRecentResults() {
    return this.fs.streamCollection<Match>(
      PATH,
      where('status', '==', 'completed'),
      orderBy('matchDate', 'desc')
    );
  }

  async getPaged(
    tournamentId: string,
    pageSize: number,
    cursor: QueryDocumentSnapshot<DocumentData> | null
  ): Promise<PagedResult<Match>> {
    return this.fs.getPaged<Match>(
      PATH,
      pageSize,
      cursor,
      where('tournamentId', '==', tournamentId),
      orderBy('matchDate', 'asc')
    );
  }

  async getById(id: string): Promise<Match | undefined> {
    const snap = await getDoc(doc(this.firestore, `${PATH}/${id}`));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Match) : undefined;
  }

  async getByTournamentOnce(tournamentId: string): Promise<Match[]> {
    return this.fs.getOnce<Match>(PATH, where('tournamentId', '==', tournamentId), orderBy('matchDate', 'asc'));
  }

  async update(id: string, patch: Partial<Match>): Promise<void> {
    await this.fs.update(PATH, id, patch);
  }

  async remove(id: string): Promise<void> {
    const match = await this.getById(id);
    await this.fs.remove(PATH, id);
    await this.activityLog.log(
      'match_delete',
      `Đã xoá trận đấu: ${match?.homeTeamName ?? 'Home'} - ${match?.awayTeamName ?? 'Away'}`,
      match?.tournamentId ?? null
    );
  }

  /** Bulk-writes generated fixtures in batches of <=450 (Firestore batch limit is 500 writes). */
  async bulkCreate(drafts: MatchDraft[]): Promise<void> {
    const chunkSize = 450;
    for (let i = 0; i < drafts.length; i += chunkSize) {
      const chunk = drafts.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      for (const draft of chunk) {
        const ref = doc(collection(this.firestore, PATH));
        batch.set(ref, { ...draft, homeScore: null, awayScore: null, status: 'scheduled' });
      }
      await batch.commit();
    }
  }

  /** Removes all existing fixtures for a tournament (used before regenerating). */
  async clearForTournament(tournamentId: string): Promise<void> {
    await this.clearMatches((await this.getByTournamentOnce(tournamentId)).map((m) => m.id));
  }

  /** Batched delete for an explicit set of match ids (e.g. wiping just the knockout stage before re-seeding it). */
  async clearMatches(ids: string[]): Promise<void> {
    const chunkSize = 450;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      for (const id of chunk) {
        batch.delete(doc(this.firestore, `${PATH}/${id}`));
      }
      await batch.commit();
    }
  }
}
