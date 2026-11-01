import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { friendlyAuthErrorKey } from '../../../core/utils/auth-error.util';

/** Google-only sign-in — the app has no email/password or guest-account flow. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="fixed top-3 left-3 w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
      (click)="goBack()"
      [attr.aria-label]="'COMMON.BACK' | translate"
      [title]="'COMMON.BACK' | translate"
    >
      <span class="material-icons">arrow_back</span>
    </button>
    <div class="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <div class="text-center mb-8">
        <span class="material-icons text-primary-500 text-5xl">sports_soccer</span>
        <h1 class="text-2xl font-extrabold mt-2">{{ 'LOGIN.TITLE' | translate }}</h1>
        <p class="text-gray-500 text-sm mt-1">{{ 'LOGIN.SUBTITLE' | translate }}</p>
      </div>

      @if (errorMessage()) {
        <div class="bg-red-50 text-accent-red text-sm rounded-xl px-4 py-3 mb-4">{{ errorMessage() }}</div>
      }

      <button class="btn-primary flex items-center justify-center gap-2" (click)="loginWithGoogle()" [disabled]="isLoading()">
        <span class="material-icons text-[18px]">login</span>
        {{ (isLoading() ? 'LOGIN.SIGNING_IN' : 'LOGIN.CONTINUE_WITH_GOOGLE') | translate }}
      </button>

      <a routerLink="/guide" class="text-center text-sm text-primary-600 font-semibold mt-4">
        {{ 'NAV.GUIDE' | translate }}
      </a>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private translate = inject(TranslateService);

  private location = inject(Location);

  isLoading = signal(false);
  errorMessage = signal('');

  /** Whether we got here from another page of the app (vs. opening /login directly), read while
   *  the navigation that created this component is still in flight. */
  private cameFromApp = !!this.router.getCurrentNavigation()?.previousNavigation;

  goBack(): void {
    if (this.cameFromApp) this.location.back();
    else this.router.navigateByUrl('/');
  }

  private redirect(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.router.navigateByUrl(returnUrl);
  }

  async loginWithGoogle(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.loginWithGoogle();
      this.redirect();
    } catch (err) {
      console.error('[Google sign-in]', err);
      const { key, params } = friendlyAuthErrorKey(err);
      this.errorMessage.set(this.translate.instant(key, params));
    } finally {
      this.isLoading.set(false);
    }
  }
}
