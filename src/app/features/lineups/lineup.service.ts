import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { LineupApproval, LineupImage } from '../../models/lineup.model';

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

  /** Live approved/not-approved lookup by slot for one manager — see `LineupApproval`. */
  streamApprovals(tournamentId: string, email: string): Observable<Map<string, boolean>> {
    const path = `lineups/${this.parentId(tournamentId, email)}/approvals`;
    return this.fs
      .streamCollection<LineupApproval>(path)
      .pipe(map((rows) => new Map(rows.map((r) => [r.id, r.approved]))));
  }

  /** Manual fallback for managers who can't use the capture tool — `image` must already satisfy
   *  firestore.rules (a `data:image/...` URI under ~900 KB), e.g. via `downscaleToDataUri`.
   *  `managerName` is the resolved display name (see `userDisplayName`) of the manager the slot
   *  belongs to, for the "/history" description — callers pass the raw email as a fallback when no
   *  nicer name is known. Who actually performed the upload is stamped onto the description
   *  automatically by `ActivityLogService.log()`, not built here. `managerUid`, when known, is
   *  stamped as `subjectUid` so that manager can read this entry back under firestore.rules on
   *  their own personal "/history" feed even though they're not the actor. */
  async upload(
    tournamentId: string,
    email: string,
    slot: string,
    image: string,
    managerName: string,
    managerUid: string | null
  ): Promise<void> {
    const parentId = this.parentId(tournamentId, email);
    await this.fs.set(`lineups/${parentId}/images`, slot, { image });
    // A new screenshot in this slot needs a fresh review — drop any stale approval from before.
    await this.fs.remove(`lineups/${parentId}/approvals`, slot);
    await this.activityLog.log(
      'lineup_upload',
      `Đã tải lên ảnh đội hình (ô ${slot}) cho ${managerName}`,
      tournamentId,
      managerUid
    );
  }

  async remove(
    tournamentId: string,
    email: string,
    slot: string,
    managerName: string,
    managerUid: string | null
  ): Promise<void> {
    const parentId = this.parentId(tournamentId, email);
    await this.fs.remove(`lineups/${parentId}/images`, slot);
    await this.fs.remove(`lineups/${parentId}/approvals`, slot);
    await this.activityLog.log(
      'lineup_remove',
      `Đã xoá ảnh đội hình (ô ${slot}) của ${managerName}`,
      tournamentId,
      managerUid
    );
  }

  /** Admin-only per-image review toggle — see `LineupApproval`. */
  async setApproved(
    tournamentId: string,
    email: string,
    slot: string,
    approved: boolean,
    managerName: string,
    managerUid: string | null
  ): Promise<void> {
    await this.fs.set(`lineups/${this.parentId(tournamentId, email)}/approvals`, slot, { approved });
    await this.activityLog.log(
      approved ? 'lineup_approve' : 'lineup_unapprove',
      approved
        ? `Đã duyệt ảnh đội hình (ô ${slot}) của ${managerName}`
        : `Đã bỏ duyệt ảnh đội hình (ô ${slot}) của ${managerName}`,
      tournamentId,
      managerUid
    );
  }
}
