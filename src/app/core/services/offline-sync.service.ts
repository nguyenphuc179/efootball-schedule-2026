import { Injectable, signal } from '@angular/core';

/**
 * App-level online/offline awareness layered on top of Firestore's own offline persistence
 * (enabled in app.config.ts via persistentLocalCache). Firestore already queues writes made
 * while offline and replays them on reconnect; this service exists purely to give the UI an
 * explicit "you're offline" / "N changes pending" indicator, since silent queuing is confusing
 * for an admin entering results pitch-side with no signal.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  readonly isOnline = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly pendingWrites = signal(0);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.isOnline.set(true));
    window.addEventListener('offline', () => this.isOnline.set(false));
  }

  /** Call before an optimistic write that may be queued offline. */
  trackWriteStart(): void {
    this.pendingWrites.update((n) => n + 1);
  }

  /** Call once the write's promise resolves (Firestore resolves it even when merely queued locally). */
  trackWriteSettled(): void {
    this.pendingWrites.update((n) => Math.max(0, n - 1));
  }

  async trackWrite<T>(writePromise: Promise<T>): Promise<T> {
    this.trackWriteStart();
    try {
      return await writePromise;
    } finally {
      this.trackWriteSettled();
    }
  }
}
