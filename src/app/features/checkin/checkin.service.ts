import { Injectable, inject } from '@angular/core';
import { orderBy, where } from '@angular/fire/firestore';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { AuthService } from '../../core/services/auth.service';
import { CheckIn, CheckInDraft } from '../../models/checkin.model';

const PATH = 'checkins';

@Injectable({ providedIn: 'root' })
export class CheckinService {
  private fs = inject(FirestoreBaseService);
  private auth = inject(AuthService);

  streamByTournament(tournamentId: string) {
    return this.fs.streamCollection<CheckIn>(PATH, where('tournamentId', '==', tournamentId), orderBy('checkedInAt', 'desc'));
  }

  async checkInTeam(tournamentId: string, teamId: string, method: CheckIn['method']): Promise<void> {
    const uid = this.auth.firebaseUser()?.uid ?? 'unknown';
    const draft: CheckInDraft & { checkedInAt: number } = {
      tournamentId,
      teamId,
      checkedInByUid: uid,
      method,
      checkedInAt: Date.now(),
    };
    await this.fs.add(PATH, draft);
  }
}
