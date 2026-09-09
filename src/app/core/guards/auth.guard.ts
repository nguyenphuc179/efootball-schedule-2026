import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

/** Blocks unauthenticated access; redirects to /login preserving the intended URL. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for the initial Firebase Auth state resolution (avoids a false redirect on page refresh).
  await firstValueFrom(toObservable(auth.isAuthResolved).pipe(filter((resolved) => resolved)));

  if (auth.isSignedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Redirects an already-signed-in user away from /login and /register. */
export const guestOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(toObservable(auth.isAuthResolved).pipe(filter((resolved) => resolved)));

  if (!auth.isSignedIn()) return true;
  return router.createUrlTree(['/']);
};
