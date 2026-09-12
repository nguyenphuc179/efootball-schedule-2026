import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { getInitialLang } from './core/services/language.service';

import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  connectAuthEmulator,
  getAuth,
  provideAuth,
} from '@angular/fire/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore,
} from '@angular/fire/firestore';
import { connectStorageEmulator, getStorage, provideStorage } from '@angular/fire/storage';
import { getMessaging, provideMessaging } from '@angular/fire/messaging';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimations(),
    provideNativeDateAdapter(),
    provideHttpClient(withInterceptors([loadingInterceptor])),
    provideCharts(withDefaultRegisterables()),

    // --- i18n (Vietnamese default, English optional) ------------------------------------
    provideTranslateService({
      lang: getInitialLang(),
      fallbackLang: 'vi',
      loader: provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json' }),
    }),

    // --- Firebase -----------------------------------------------------------------------
    provideFirebaseApp(() => initializeApp(environment.firebase)),

    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      return auth;
    }),

    provideFirestore(() => {
      // Offline persistence with multi-tab support — required for the offline-first mobile UX
      // (viewing cached tournaments/fixtures/standings with no signal, per spec).
      let firestore;
      try {
        firestore = initializeFirestore(getApp(), {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
          ignoreUndefinedProperties: true, // optional denormalized fields (e.g. team names on TBD slots)
        });
      } catch {
        // initializeFirestore throws if Firestore was already initialized for this app
        // (e.g. hot-reload during dev) — fall back to the existing instance.
        firestore = getFirestore();
      }

      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8080);
      }
      return firestore;
    }),

    provideStorage(() => {
      const storage = getStorage();
      if (environment.useEmulators) {
        connectStorageEmulator(storage, 'localhost', 9199);
      }
      return storage;
    }),

    provideMessaging(() => getMessaging()),

    // --- PWA ------------------------------------------------------------------------------
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
