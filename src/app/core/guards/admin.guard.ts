import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { firstValueFrom } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

/** Blocks non-admin access to admin-only routes (tournament create/edit, result entry). */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(toObservable(auth.isAuthResolved).pipe(filter((resolved) => resolved)));

  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/']);
};
