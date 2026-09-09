import { Injectable, inject } from '@angular/core';
import { orderBy, where } from '@angular/fire/firestore';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { AuthService } from '../../core/services/auth.service';
import { AppNotification, NotificationDraft } from '../../models/notification.model';

const PATH = 'notifications';

/**
 * Writes `notifications/{id}` documents (in-app notification center, always works) and is the
 * trigger point a Cloud Function would listen to for real push fan-out via FCM — see
 * DEPLOYMENT.md §8. Client-only, this still gives every signed-in user a live notification feed.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private fs = inject(FirestoreBaseService);
  private auth = inject(AuthService);

  streamForCurrentUser() {
    const uid = this.auth.firebaseUser()?.uid;
    if (!uid) return this.fs.streamCollection<AppNotification>(PATH, where('audience', '==', '__none__'));
    return this.fs.streamCollection<AppNotification>(
      PATH,
      where('audience', 'in', ['all', 'user']),
      orderBy('createdDate', 'desc')
    );
  }

  async broadcast(draft: NotificationDraft): Promise<void> {
    await this.fs.add<NotificationDraft & { read: boolean }>(PATH, { ...draft, read: false });
  }

  async notifyUser(uid: string, draft: Omit<NotificationDraft, 'audience' | 'targetUid'>): Promise<void> {
    await this.fs.add(PATH, { ...draft, audience: 'user', targetUid: uid, read: false });
  }

  async markRead(notificationId: string): Promise<void> {
    await this.fs.update(PATH, notificationId, { read: true });
  }
}
