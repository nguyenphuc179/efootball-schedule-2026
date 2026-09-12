import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLanguage = 'vi' | 'en';

const STORAGE_KEY = 'pitchpro-lang';

/** Read at bootstrap (before DI exists) to pick the language `provideTranslateService` starts with. */
export function getInitialLang(): AppLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    // localStorage unavailable (private mode, SSR) — fall through to the default.
  }
  return 'vi';
}

/** Thin wrapper around TranslateService: switches the active language and persists the choice. */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private translate = inject(TranslateService);

  readonly current = this.translate.currentLang;

  setLanguage(lang: AppLanguage): void {
    this.translate.use(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore — worst case the choice doesn't survive a reload
    }
  }

  toggle(): void {
    this.setLanguage(this.current() === 'en' ? 'vi' : 'en');
  }
}
