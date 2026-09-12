import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { LanguageService } from '../../../core/services/language.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';

/**
 * App bar shown on mobile (compact, transparent-over-hero on Home) and as part of the
 * top nav on desktop (paired with the sidenav in AppComponent).
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, UserMenuComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
      <div class="flex items-center justify-between h-14 px-4 max-w-6xl mx-auto">
        <a routerLink="/" class="flex items-center gap-2 font-extrabold text-lg text-surface-dark">
          <span class="material-icons text-primary-500">sports_soccer</span>
          PitchPro
        </a>
        <div class="flex items-center gap-1">
          <button
            class="w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-100 text-xs font-extrabold text-gray-500"
            (click)="lang.toggle()"
            [attr.aria-label]="'NAV.SWITCH_LANGUAGE' | translate"
          >
            {{ lang.current() === 'en' ? 'EN' : 'VI' }}
          </button>
          @if (auth.isSignedIn()) {
            <a
              routerLink="/notifications"
              class="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-100"
              [attr.aria-label]="'NAV.NOTIFICATIONS' | translate"
            >
              <span class="material-icons text-gray-600">notifications</span>
            </a>
          }
          <app-user-menu />
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  auth = inject(AuthService);
  lang = inject(LanguageService);
}
