import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

/**
 * Sofascore-style fixed bottom navigation — the primary nav on mobile (<768px).
 * Stays mounted across route changes (rendered by AppComponent outside <router-outlet>)
 * so switching tabs never re-renders the nav itself.
 */
@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav
      class="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-100 shadow-nav-top pb-safe-bottom md:hidden"
      role="navigation"
      aria-label="Primary"
    >
      <ul class="grid grid-cols-5 h-16">
        @for (item of items; track item.route) {
          <li>
            <a
              [routerLink]="item.route"
              routerLinkActive
              #rla="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: item.route === '/' }"
              class="flex flex-col items-center justify-center h-full active:bg-gray-50 tap-target"
              [class]="rla.isActive ? 'text-primary-600' : 'text-gray-500'"
            >
              <span class="material-icons text-[22px] leading-none">{{ item.icon }}</span>
              <span class="text-[11px] mt-1" [class]="rla.isActive ? 'font-bold' : 'font-medium'">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class BottomNavComponent {
  private auth = inject(AuthService);

  get items(): NavItem[] {
    return [
      { label: 'Home', icon: 'home', route: '/' },
      { label: 'Cups', icon: 'emoji_events', route: '/tournaments' },
      { label: 'Ranking', icon: 'leaderboard', route: '/ranking' },
      { label: 'Fame', icon: 'military_tech', route: '/hall-of-fame' },
      { label: 'Profile', icon: 'person', route: this.auth.isSignedIn() ? '/profile' : '/login' },
    ];
  }
}
