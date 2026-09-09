import { Injectable, inject } from '@angular/core';
import { orderBy, where } from '@angular/fire/firestore';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { AuthService } from '../../core/services/auth.service';
import { Tournament, TournamentDraft, deriveTournamentStatus } from '../../models/tournament.model';
import { toSignal } from '@angular/core/rxjs-interop';

const PATH = 'tournaments';

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private fs = inject(FirestoreBaseService);
  private auth = inject(AuthService);

  /** Realtime list, newest start date first — powers the Tournaments tab and Home's featured rail. */
  readonly all = toSignal(this.fs.streamCollection<Tournament>(PATH, orderBy('startDate', 'desc')), {
    initialValue: [] as Tournament[],
  });

  streamOne(id: string) {
    return this.fs.streamDoc<Tournament>(`${PATH}/${id}`);
  }

  streamByStatus(status: Tournament['status']) {
    return this.fs.streamCollection<Tournament>(
      PATH,
      where('status', '==', status),
      orderBy('startDate', 'asc')
    );
  }

  async create(draft: TournamentDraft): Promise<string> {
    const uid = this.auth.firebaseUser()?.uid ?? 'unknown';
    const status = deriveTournamentStatus(draft.startDate, draft.endDate);
    return this.fs.add<Omit<Tournament, 'id' | 'createdDate'>>(PATH, {
      ...draft,
      status,
      createdBy: uid,
    });
  }

  async update(id: string, draft: Partial<TournamentDraft>): Promise<void> {
    const patch: Partial<Tournament> = { ...draft };
    if (draft.startDate && draft.endDate) {
      patch.status = deriveTournamentStatus(draft.startDate, draft.endDate);
    }
    await this.fs.update(PATH, id, patch);
  }

  async remove(id: string): Promise<void> {
    await this.fs.remove(PATH, id);
  }

  async getOnce(id: string): Promise<Tournament | undefined> {
    return this.fs.getById<Tournament>(`${PATH}/${id}`);
  }
}
