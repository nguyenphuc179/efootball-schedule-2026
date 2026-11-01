import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  /** Already-translated text. */
  message: string;
}

const DURATION_MS = 5000;
/** The same message again within this window is dropped rather than stacked. */
const DEDUPE_MS = 3000;
const MAX_VISIBLE = 3;

/** App-wide transient messages, rendered by `ToastHostComponent` in the app shell. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private nextId = 1;
  private lastShown = new Map<string, number>();

  show(message: string, kind: ToastKind = 'info'): void {
    const now = Date.now();
    if (now - (this.lastShown.get(message) ?? 0) < DEDUPE_MS) return;
    this.lastShown.set(message, now);

    const toast: Toast = { id: this.nextId++, kind, message };
    this.toasts.update((list) => [...list, toast].slice(-MAX_VISIBLE));
    setTimeout(() => this.dismiss(toast.id), DURATION_MS);
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
