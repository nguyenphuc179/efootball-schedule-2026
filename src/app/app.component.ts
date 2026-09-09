import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { BottomNavComponent } from './shared/components/bottom-nav/bottom-nav.component';
import { HeaderComponent } from './shared/components/header/header.component';
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
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, BottomNavComponent, HeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col md:flex-row">
      <!-- Desktop sidenav -->
      <aside class="hidden md:flex md:w-56 md:flex-col md:border-r md:border-gray-100 md:py-6 md:px-3 md:gap-1 md:sticky md:top-0 md:h-dvh">
        <div class="flex items-center gap-2 font-extrabold text-lg px-2 mb-6">
          <span class="material-icons text-primary-500">sports_soccer</span> PitchPro
        </div>
        @for (item of desktopNavItems; track item.route) {
          <a
            [routerLink]="item.route"
            routerLinkActive="bg-primary-50 text-primary-700"
            [routerLinkActiveOptions]="{ exact: item.route === '/' }"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 font-medium text-sm"
          >
            <span class="material-icons text-[20px]">{{ item.icon }}</span>
            {{ item.label }}
          </a>
        }
        @if (auth.isAdmin()) {
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-primary-50 text-primary-700"
            class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-600 font-medium text-sm mt-auto"
          >
            <span class="material-icons text-[20px]">dashboard</span> Dashboard
          </a>
        }
      </aside>

      <div class="flex-1 min-w-0">
        <app-header class="md:hidden" />

        @if (!offlineSync.isOnline()) {
          <div class="bg-accent-amber/10 text-accent-amber text-xs text-center py-1.5 font-medium">
            You're offline — showing cached data. Changes will sync automatically.
          </div>
        } @else if (offlineSync.pendingWrites() > 0) {
          <div class="bg-primary-50 text-primary-700 text-xs text-center py-1.5 font-medium">
            Syncing {{ offlineSync.pendingWrites() }} change(s)…
          </div>
        }

        <router-outlet />
      </div>

      <app-bottom-nav />
    </div>
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  offlineSync = inject(OfflineSyncService);

  desktopNavItems = [
    { label: 'Home', icon: 'home', route: '/' },
    { label: 'Tournaments', icon: 'emoji_events', route: '/tournaments' },
    { label: 'Matches', icon: 'sports_soccer', route: '/matches' },
    { label: 'Standings', icon: 'leaderboard', route: '/standings' },
    { label: 'Profile', icon: 'person', route: '/profile' },
  ];
}
