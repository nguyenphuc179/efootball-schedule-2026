import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { LineupImage } from '../../models/lineup.model';

/**
 * Squad lineup images are normally fed by an external capture tool via Firestore's public REST
 * API (no auth — see firestore.rules). Some managers (e.g. console/PS5 players) can't run that
 * tool, so an admin can also manually upload a photo they were sent through this service — same
 * storage shape, just written from this app's own UI instead. Admins may also delete a bad/stale
 * image.
 */
@Injectable({ providedIn: 'root' })
export class LineupService {
  private fs = inject(FirestoreBaseService);
  private activityLog = inject(ActivityLogService);

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

  /** Manual fallback for managers who can't use the capture tool — `image` must already satisfy
   *  firestore.rules (a `data:image/...` URI under ~900 KB), e.g. via `downscaleToDataUri`. */
  async upload(tournamentId: string, email: string, slot: string, image: string): Promise<void> {
    await this.fs.set(`lineups/${this.parentId(tournamentId, email)}/images`, slot, { image });
    await this.activityLog.log('lineup_upload', `Đã tải lên ảnh đội hình (ô ${slot}) cho ${email}`, tournamentId);
  }

  async remove(tournamentId: string, email: string, slot: string): Promise<void> {
    await this.fs.remove(`lineups/${this.parentId(tournamentId, email)}/images`, slot);
    await this.activityLog.log('lineup_remove', `Đã xoá ảnh đội hình (ô ${slot}) của ${email}`, tournamentId);
  }
}
