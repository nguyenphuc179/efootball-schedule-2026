import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { map } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { AuthService } from '../../core/services/auth.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { Tournament, TournamentDraft, normalizeStatus } from '../../models/tournament.model';
import { toSignal } from '@angular/core/rxjs-interop';

const PATH = 'tournaments';

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private fs = inject(FirestoreBaseService);
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private activityLog = inject(ActivityLogService);

  /** Realtime list, newest start date first — powers the Tournaments tab and Home's featured rail. */
  readonly all = toSignal(
    this.fs
      .streamCollection<Tournament>(PATH, orderBy('startDate', 'desc'))
      .pipe(map((list) => list.map((t) => ({ ...t, status: normalizeStatus(t.status) })))),
    { initialValue: [] as Tournament[] }
  );

  streamOne(id: string) {
    return this.fs
      .streamDoc<Tournament>(`${PATH}/${id}`)
      .pipe(map((t) => (t ? { ...t, status: normalizeStatus(t.status) } : t)));
  }

  async create(draft: TournamentDraft): Promise<string> {
    const uid = this.auth.firebaseUser()?.uid ?? 'unknown';
    const id = await this.fs.add<Omit<Tournament, 'id' | 'createdDate'>>(PATH, {
      ...draft,
      status: 'in_progress',
      createdBy: uid,
    });
    await this.activityLog.log('tournament_create', `Đã tạo giải đấu "${draft.name}"`, id);
    return id;
  }

  async update(id: string, draft: Partial<TournamentDraft>): Promise<void> {
    await this.fs.update(PATH, id, { ...draft });
    const name = draft.name ?? this.all().find((t) => t.id === id)?.name ?? id;
    await this.activityLog.log('tournament_update', `Đã cập nhật giải đấu "${name}"`, id);
  }

  /** Admin action: mark the tournament Completed. */
  async endTournament(id: string): Promise<void> {
    await this.fs.update(PATH, id, { status: 'completed', endedAt: Date.now() });
    const name = this.all().find((t) => t.id === id)?.name ?? id;
    await this.activityLog.log('tournament_end', `Đã kết thúc giải đấu "${name}"`, id);
  }

  /** Undo `endTournament` — back to In Progress. */
  async reopenTournament(id: string): Promise<void> {
    await this.fs.update(PATH, id, { status: 'in_progress', endedAt: null });
    const name = this.all().find((t) => t.id === id)?.name ?? id;
    await this.activityLog.log('tournament_reopen', `Đã mở lại giải đấu "${name}"`, id);
  }

  /**
   * Deletes the tournament and every record scoped to it — teams, fixtures and the standings
   * table. Firestore has no server-side cascade, so we fan out with queries and batch-delete
   * (batches cap at 500).
   */
  async remove(id: string): Promise<void> {
    const name = this.all().find((t) => t.id === id)?.name ?? id;
    const [teams, matches, standingRows] = await Promise.all([
      getDocs(query(collection(this.firestore, 'teams'), where('tournamentId', '==', id))),
      getDocs(query(collection(this.firestore, 'matches'), where('tournamentId', '==', id))),
      getDocs(collection(this.firestore, `standings/${id}/rows`)),
    ]);

    const refs = [
      ...teams.docs.map((d) => d.ref),
      ...matches.docs.map((d) => d.ref),
      ...standingRows.docs.map((d) => d.ref),
      doc(this.firestore, `standings/${id}`),
      doc(this.firestore, `${PATH}/${id}`),
    ];

    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(this.firestore);
      for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
      await batch.commit();
    }

    await this.activityLog.log('tournament_delete', `Đã xoá giải đấu "${name}"`, null);
  }

  async getOnce(id: string): Promise<Tournament | undefined> {
    return this.fs.getById<Tournament>(`${PATH}/${id}`);
  }
}
