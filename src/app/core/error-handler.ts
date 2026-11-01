import { ErrorHandler, Injectable, Injector, NgZone, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from './services/toast.service';
import { AuthService } from './services/auth.service';

/** Firestore / Storage / Functions error codes → user-facing message key. */
const CODE_TO_KEY: Record<string, string> = {
  'permission-denied': 'ERRORS.PERMISSION_DENIED',
  unauthenticated: 'ERRORS.UNAUTHENTICATED',
  unavailable: 'ERRORS.UNAVAILABLE',
  'deadline-exceeded': 'ERRORS.UNAVAILABLE',
  'resource-exhausted': 'ERRORS.QUOTA',
  'not-found': 'ERRORS.NOT_FOUND',
  'storage/unauthorized': 'ERRORS.PERMISSION_DENIED',
  'storage/quota-exceeded': 'ERRORS.QUOTA',
};

/** Right after sign-in/out, live listeners re-check their rules and may briefly fail with these —
 *  nothing the user did, so no toast. */
const AUTH_SETTLE_MS = 5000;
const AUTH_TRANSIENT = new Set(['permission-denied', 'unauthenticated']);

/**
 * Surfaces failures nothing else handled. Many write actions (save result, end/reset/delete a
 * tournament, save a team, generate fixtures…) only use try/finally to reset their spinner, so a
 * rejected Firestore write used to vanish into the console while the UI looked like it had saved.
 * Firebase errors now become a toast; anything else is just logged as before, so a programming
 * error never shows the user a confusing popup.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private toast = inject(ToastService);
  private translate = inject(TranslateService);
  private zone = inject(NgZone);
  // Lazily: AuthService pulls in Firebase, which mustn't be constructed just to build the handler.
  private injector = inject(Injector);

  handleError(error: unknown): void {
    console.error(error);

    const code = firebaseCode(unwrap(error));
    if (!code) return;
    if (AUTH_TRANSIENT.has(code) && Date.now() - this.injector.get(AuthService).lastAuthChangeAt < AUTH_SETTLE_MS) return;

    const key = CODE_TO_KEY[code] ?? 'ERRORS.SAVE_FAILED';
    // ErrorHandler can be invoked outside the Angular zone (e.g. from a Firebase callback).
    this.zone.run(() => this.toast.error(this.translate.instant(key)));
  }
}

/** zone.js may report an unhandled promise rejection as an Error carrying the original `rejection`. */
function unwrap(error: unknown): unknown {
  const e = error as { rejection?: unknown } | null;
  return e && typeof e === 'object' && 'rejection' in e ? e.rejection : error;
}

function firebaseCode(err: unknown): string | null {
  const e = err as { name?: unknown; code?: unknown } | null;
  if (!e || typeof e !== 'object' || typeof e.code !== 'string') return null;
  // Sign-in and App Check failures have their own handling (login screen, chat widget).
  if (/^(auth|appCheck|app-check)\//.test(e.code)) return null;
  const looksFirebase = e.name === 'FirebaseError' || e.code.includes('/') || e.code in CODE_TO_KEY;
  return looksFirebase ? e.code.replace(/^firestore\//, '') : null;
}
