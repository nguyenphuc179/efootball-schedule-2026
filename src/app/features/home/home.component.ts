import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { MyOverviewComponent } from './my-overview.component';
import { AdminOverviewComponent } from './admin-overview.component';

/**
 * Home (`/`):
 *  - guest → a short welcome + a call to sign in (tournaments are still browsable without an account);
 *  - signed in → the user's personal stats (rank, record, their teams, upcoming & recent games),
 *    with the admin platform overview appended below for admins (this replaces the old /dashboard).
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, LoadingSpinnerComponent, MyOverviewComponent, AdminOverviewComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.isAuthResolved()) {
      <div class="app-content-area flex items-center justify-center py-24">
        <app-loading-spinner [label]="'COMMON.LOADING' | translate" />
      </div>
    } @else if (!auth.isSignedIn()) {
      <div class="app-content-area min-h-[72vh] flex flex-col items-center justify-center text-center px-6 gap-5">
        <span
          class="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(15,168,99,0.7)]"
        >
          <span class="material-icons text-[32px]">sports_soccer</span>
        </span>
        <div>
          <h1 class="text-3xl font-black tracking-tight">{{ 'HOME.WELCOME_TITLE' | translate }}</h1>
          <p class="text-sm text-gray-400 mt-2 max-w-xs mx-auto">{{ 'HOME.WELCOME_SUBTITLE' | translate }}</p>
        </div>
        <a routerLink="/login" class="btn-primary !py-3 !px-8 text-base">{{ 'USER_MENU.SIGN_IN' | translate }}</a>
        <a routerLink="/tournaments" class="text-sm font-semibold text-primary-600">{{ 'HOME.VIEW_TOURNAMENTS' | translate }}</a>
      </div>
    } @else {
      <div class="app-content-area flex flex-col gap-8 pb-4">
        <app-my-overview />
        @if (auth.isAdmin()) {
          @defer (on immediate) {
            <app-admin-overview />
          }
        }
      </div>
    }
  `,
})
export class HomeComponent {
  auth = inject(AuthService);
}
