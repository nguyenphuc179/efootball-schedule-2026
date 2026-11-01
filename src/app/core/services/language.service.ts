import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLanguage = 'vi' | 'en';

const STORAGE_KEY = 'pitchpro-lang';

/** BCP-47 locale for `Intl`/`toLocale*String` matching the app language — never the browser's own
 *  locale, or an English browser would show "24 Sept" inside the Vietnamese UI. */
export function dateLocale(lang: string | null | undefined): string {
  return lang === 'en' ? 'en-US' : 'vi-VN';
}

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
