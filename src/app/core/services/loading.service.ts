import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private count = signal(0);
  readonly isLoading = signal(false);

  start(): void {
    this.count.update((n) => n + 1);
    this.isLoading.set(true);
  }

  stop(): void {
    this.count.update((n) => Math.max(0, n - 1));
    this.isLoading.set(this.count() > 0);
  }
}
