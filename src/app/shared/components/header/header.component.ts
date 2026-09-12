import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';
import { ActivityLogBellComponent } from '../../../features/activity-log/activity-log-bell.component';

/**
 * App bar shown on mobile (compact, transparent-over-hero on Home) and as part of the
 * top nav on desktop (paired with the sidenav in AppComponent).
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, UserMenuComponent, ActivityLogBellComponent, TranslatePipe],
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
          <app-activity-log-bell />
          <app-user-menu />
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  lang = inject(LanguageService);
}
