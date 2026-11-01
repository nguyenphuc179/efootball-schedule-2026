import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, timeout } from 'rxjs/operators';

/** Blocks non-admin access to admin-only routes (tournament create/edit, poll create). */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // The role lives in the Firestore profile, which lands after Firebase Auth resolves — on a
  // direct load/refresh, checking right after auth would always see a non-admin. A brand-new
  // account whose profile doc doesn't exist yet never resolves, hence the timeout.
  await firstValueFrom(
    toObservable(auth.isProfileResolved).pipe(
      filter((resolved) => resolved),
      timeout({ first: 8000, with: () => of(true) })
    )
  );

  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/']);
};
