import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { ThemePref, ThemeService } from '../../../core/services/theme.service';
import { initialsAvatar } from '../../utils/avatar.util';
import { APP_VERSION } from '../../../core/app-version';

/**
 * Top-right account control: "Hi, {name}" + avatar + a chevron that opens a small menu
 * (Profile, Dashboard for admins, Log out). Shows a Sign In button when signed out, so it
 * can stand in for the whole auth area of a header.
 */
@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.isAuthResolved()) {
      <!-- Firebase Auth hasn't confirmed signed-in/out yet (e.g. right after a page refresh, before
           the persisted session rehydrates) — a neutral skeleton here avoids flashing the "Sign In"
           button at someone who's actually already logged in. -->
      <div class="flex items-center gap-1">
        <div class="w-9 h-9 rounded-full bg-surface-muted animate-pulse"></div>
        <div class="w-24 h-8 rounded-full bg-surface-muted animate-pulse"></div>
      </div>
    } @else if (!auth.isSignedIn()) {
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
          [attr.aria-label]="themeAriaKey() | translate"
          (click)="cycleTheme()"
        >
          <span class="material-icons text-[20px]">{{ themeIcon() }}</span>
        </button>
        <a routerLink="/login" class="btn-primary !py-2 !px-4 text-sm">{{ 'USER_MENU.SIGN_IN' | translate }}</a>
      </div>
    } @else {
      <div class="relative">
        <button
          type="button"
          class="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100 active:bg-gray-100"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
        >
          <span
            class="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0"
            [style.background-color]="avatar().bg"
          >
            @if (showPhoto()) {
              <img
                [src]="photoURL()"
                alt=""
                class="w-full h-full object-cover"
                width="32"
                height="32"
                referrerpolicy="no-referrer"
                (error)="photoFailed.set(true)"
              />
            } @else {
              <span class="text-xs font-bold" [style.color]="avatar().fg">{{ avatar().initials }}</span>
            }
          </span>
          <span class="text-sm font-semibold text-surface-dark truncate max-w-[7rem] sm:max-w-[10rem]">
            {{ 'USER_MENU.GREETING' | translate: { name: firstName() } }}
          </span>
          <span
            class="material-icons text-[18px] text-gray-400 transition-transform"
            [class.rotate-180]="open()"
          >expand_more</span>
        </button>

        @if (open()) {
          <div
            class="absolute right-0 mt-2 w-56 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 text-sm"
          >
            <div class="px-3 py-2 border-b border-gray-100">
              <div class="font-semibold truncate">{{ auth.displayName() }}</div>
              <div class="text-xs text-gray-400 truncate">{{ auth.appUser()?.email }}</div>
              @if (auth.isAdmin()) {
                <span class="inline-block mt-1 text-[10px] uppercase tracking-wide bg-primary-50 text-primary-700 rounded px-1.5 py-0.5">
                  {{ 'USER_MENU.ADMIN_BADGE' | translate }}
                </span>
              }
            </div>
            <a routerLink="/profile" class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50" (click)="open.set(false)">
              <span class="material-icons text-[18px] text-gray-500">person</span> {{ 'USER_MENU.PROFILE' | translate }}
            </a>

            <div class="px-3 py-2 border-t border-gray-100">
              <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                @for (o of themeOptions; track o.value) {
                  <button
                    type="button"
                    class="flex-1 flex items-center justify-center py-1 rounded-md"
                    [class]="theme.preference() === o.value ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500'"
                    [attr.aria-label]="o.label | translate"
                    (click)="theme.set(o.value)"
                  >
                    <span class="material-icons text-[16px]">{{ o.icon }}</span>
                  </button>
                }
              </div>
            </div>

            <div class="border-t border-gray-100 my-1"></div>
            <button
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-accent-red font-semibold"
              (click)="logout()"
            >
              <span class="material-icons text-[18px]">logout</span> {{ 'USER_MENU.LOG_OUT' | translate }}
            </button>
            <div class="px-3 pt-1 pb-0.5 text-[10px] text-gray-300 text-right select-none">v{{ appVersion }}</div>
          </div>
        }
      </div>
    }
  `,
})
export class UserMenuComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  open = signal(false);
  readonly appVersion = APP_VERSION;

  readonly themeOptions: { value: ThemePref; icon: string; label: string }[] = [
    { value: 'light', icon: 'light_mode', label: 'USER_MENU.THEME_LIGHT' },
    { value: 'dark', icon: 'dark_mode', label: 'USER_MENU.THEME_DARK' },
    { value: 'system', icon: 'contrast', label: 'USER_MENU.THEME_SYSTEM' },
  ];

  themeIcon = computed(
    () => this.themeOptions.find((o) => o.value === this.theme.preference())?.icon ?? 'contrast'
  );

  themeAriaKey = computed(() => {
    switch (this.theme.preference()) {
      case 'dark':
        return 'USER_MENU.THEME_ARIA_DARK';
      case 'system':
        return 'USER_MENU.THEME_ARIA_SYSTEM';
      default:
        return 'USER_MENU.THEME_ARIA_LIGHT';
    }
  });

  cycleTheme(): void {
    const order: ThemePref[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(this.theme.preference()) + 1) % order.length];
    this.theme.set(next);
  }

  private fullName = computed(
    () =>
      this.auth.appUser()?.systemDisplayName?.trim() ||
      this.auth.appUser()?.displayName ||
      this.auth.firebaseUser()?.displayName ||
      this.auth.appUser()?.email ||
      'User'
  );

  firstName = computed(() => this.fullName().split('@')[0].split(/\s+/)[0]);

  photoURL = computed(
    () => this.auth.appUser()?.photoURL ?? this.auth.firebaseUser()?.photoURL ?? null
  );

  photoFailed = signal(false);
  showPhoto = computed(() => !!this.photoURL() && !this.photoFailed());

  avatar = computed(() => initialsAvatar(this.fullName()));

  constructor() {
    // A different account signs in -> give its photo a fresh chance to load.
    effect(() => {
      this.photoURL();
      this.photoFailed.set(false);
    });
  }

  /** Close when a click lands anywhere outside this component (backdrop elements get trapped
   *  inside the header's `backdrop-blur` stacking context, so a document listener is safer). */
  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEsc(): void {
    this.open.set(false);
  }

  async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
