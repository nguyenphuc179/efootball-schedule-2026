import { Injectable, inject, signal } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface ForegroundNotification {
  title: string;
  body: string;
  url?: string;
}

/**
 * Wraps Firebase Cloud Messaging: requests permission, registers the device token against
 * the signed-in user's profile, and surfaces foreground push messages as a signal so any
 * component (e.g. a toast/snackbar host in AppComponent) can react.
 */
@Injectable({ providedIn: 'root' })
export class FcmService {
  private messaging = inject(Messaging, { optional: true });
  private auth = inject(AuthService);

  readonly lastForegroundMessage = signal<ForegroundNotification | null>(null);
  readonly permissionState = signal<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );

  async requestPermissionAndRegister(): Promise<void> {
    if (!this.messaging || typeof Notification === 'undefined') {
      this.permissionState.set('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    this.permissionState.set(permission);
    if (permission !== 'granted') return;

    const token = await getToken(this.messaging, { vapidKey: environment.fcmVapidKey }).catch(
      (err) => {
        console.warn('FCM getToken failed (expected until real Firebase config is set):', err);
        return null;
      }
    );

    const uid = this.auth.firebaseUser()?.uid;
    if (token && uid) {
      await this.auth.registerFcmToken(uid, token);
    }

    this.listenForegroundMessages();
  }

  private listenForegroundMessages(): void {
    if (!this.messaging) return;
    onMessage(this.messaging, (payload) => {
      this.lastForegroundMessage.set({
        title: payload.notification?.title ?? 'PitchPro',
        body: payload.notification?.body ?? '',
        url: (payload.data?.['url'] as string) ?? undefined,
      });
    });
  }
}
