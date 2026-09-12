import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { friendlyAuthErrorKey } from '../../../core/utils/auth-error.util';

/** Google-only sign-in — the app has no email/password or guest-account flow. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private translate = inject(TranslateService);

  isLoading = signal(false);
  errorMessage = signal('');

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
