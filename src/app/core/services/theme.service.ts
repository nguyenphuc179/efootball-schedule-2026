import { Injectable, effect, signal } from '@angular/core';

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pitchpro-theme';

/**
 * App theme (Light / Dark / follow-system). Toggling `document.documentElement`'s `.dark` class
 * drives the Tailwind `dark:` variant + the override layer in styles.scss. The preference is
 * persisted; a small inline script in index.html applies it before Angular boots (no flash).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media =
    typeof window !== 'undefined' && 'matchMedia' in window
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  readonly preference = signal<ThemePref>(this.read());
  /** Whether dark styles are currently applied. */
  readonly isDark = signal<boolean>(this.resolve(this.preference()));

  constructor() {
    effect(() => {
      const pref = this.preference();
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        /* private mode / storage disabled */
      }
      this.apply(pref);
    });

    this.media?.addEventListener('change', () => {
      if (this.preference() === 'system') this.apply('system');
    });
  }

  set(pref: ThemePref): void {
    this.preference.set(pref);
  }

  private read(): ThemePref {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch {
      /* ignore */
    }
    return 'system';
  }

  private resolve(pref: ThemePref): boolean {
    return pref === 'dark' || (pref === 'system' && !!this.media?.matches);
  }

  private apply(pref: ThemePref): void {
    const dark = this.resolve(pref);
    this.isDark.set(dark);
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
}
