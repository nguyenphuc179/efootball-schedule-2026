import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * Drives a global loading indicator for plain HTTP calls (e.g. any external REST API you add
 * later — geocoding a venue address, a weather widget, etc). Firestore/Storage SDK calls do NOT
 * go through Angular's HttpClient, so this does not intercept them; component-level loading
 * signals are used for those (see feature services' `isLoading` signals).
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
