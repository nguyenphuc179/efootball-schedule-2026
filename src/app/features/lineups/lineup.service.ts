import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { LineupImage } from '../../models/lineup.model';

/**
 * Squad lineup images are fed entirely by an external capture tool via Firestore's public REST
 * API (no auth — see firestore.rules), never through this app's own UI. This service only reads
 * them for display and lets an admin delete a bad/stale one.
 */
@Injectable({ providedIn: 'root' })
export class LineupService {
  private fs = inject(FirestoreBaseService);

  /** Must match exactly what the external tool uses to build its write path — see firestore.rules
   *  and the integration contract handed to the user for the capture tool. */
  parentId(tournamentId: string, email: string): string {
    return `${tournamentId}__${email.trim().toLowerCase()}`;
  }

  streamImages(tournamentId: string, email: string): Observable<LineupImage[]> {
    const path = `lineups/${this.parentId(tournamentId, email)}/images`;
    return this.fs
      .streamCollection<LineupImage>(path)
      .pipe(map((images) => [...images].sort((a, b) => Number(a.id) - Number(b.id))));
  }

  async remove(tournamentId: string, email: string, slot: string): Promise<void> {
    await this.fs.remove(`lineups/${this.parentId(tournamentId, email)}/images`, slot);
  }
}
