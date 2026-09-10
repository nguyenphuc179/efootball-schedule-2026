import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { UserMenuComponent } from './shared/components/user-menu/user-menu.component';
import { AuthService } from './core/services/auth.service';
import { OfflineSyncService } from './core/services/offline-sync.service';

/**
 * App shell. Mobile (<1024px): sticky header + routed content + fixed bottom nav.
 * Desktop (>=1024px): left sidenav replaces the bottom nav, content gets a max-width container.
 * Both breakpoints share the exact same feature components — only this shell differs.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    BottomNavComponent,
    HeaderComponent,
    UserMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col md:flex-row">
      <!-- Desktop sidenav -->
      @if (!chromeless()) {
        <aside class="hidden md:flex md:w-60 md:flex-col bg-white border-r border-gray-100 md:sticky md:top-0 md:h-dvh">
          <div class="h-14 flex items-center gap-2 px-4 border-b border-gray-100 font-extrabold text-lg">
            <span class="material-icons text-primary-500">sports_soccer</span> PitchPro
          </div>
          <nav class="flex flex-col gap-1 p-3">
            @for (item of desktopNavItems; track item.route) {
              <a
                [routerLink]="item.route"
                routerLinkActive
                #rla="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: item.route === '/' }"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors"
                [class]="
                  rla.isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                "
              >
                <span class="material-icons text-[20px]">{{ item.icon }}</span>
                {{ item.label }}
              </a>
            }
          </nav>
        </aside>
      }

      <div class="flex-1 min-w-0">
        @if (!chromeless()) {
          <app-header class="md:hidden" />

          <!-- Desktop top bar: right-aligned account control -->
          <header
            class="hidden md:flex items-center justify-end gap-1 h-14 px-6 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur z-20"
          >
            @if (auth.isSignedIn()) {
              <a
                routerLink="/notifications"
                class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
                aria-label="Notifications"
              >
                <span class="material-icons text-gray-600">notifications</span>
              </a>
            }
            <app-user-menu />
          </header>

          @if (!offlineSync.isOnline()) {
            <div class="bg-accent-amber/10 text-accent-amber text-xs text-center py-1.5 font-medium">
              You're offline — showing cached data. Changes will sync automatically.
            </div>
          } @else if (offlineSync.pendingWrites() > 0) {
            <div class="bg-primary-50 text-primary-700 text-xs text-center py-1.5 font-medium">
              Syncing {{ offlineSync.pendingWrites() }} change(s)…
            </div>
          }
        }

        <router-outlet />
      </div>

      @if (!chromeless()) {
        <app-bottom-nav />
      }
    </div>
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  offlineSync = inject(OfflineSyncService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** Routes flagged `data: { fullscreen: true }` (forms, result entry, auth) hide the app shell. */
  chromeless = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.isFullscreenRoute())
    ),
    { initialValue: false }
  );

  private isFullscreenRoute(): boolean {
    let r = this.route.snapshot.firstChild;
    while (r) {
      if (r.data['fullscreen']) return true;
      r = r.firstChild;
    }
    return false;
  }

  desktopNavItems = [
    { label: 'Home', icon: 'home', route: '/' },
    { label: 'Tournaments', icon: 'emoji_events', route: '/tournaments' },
    { label: 'Ranking', icon: 'leaderboard', route: '/ranking' },
    { label: 'Hall of Fame', icon: 'military_tech', route: '/hall-of-fame' },
  ];
}
