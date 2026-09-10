import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/** Mobile-first login: large inputs (16px, prevents iOS auto-zoom), full-width CTAs, Google option. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <div class="text-center mb-8">
        <span class="material-icons text-primary-500 text-5xl">sports_soccer</span>
        <h1 class="text-2xl font-extrabold mt-2">Welcome back</h1>
        <p class="text-gray-500 text-sm mt-1">Sign in to manage or follow your tournaments</p>
      </div>

      @if (errorMessage()) {
        <div class="bg-red-50 text-accent-red text-sm rounded-xl px-4 py-3 mb-4">{{ errorMessage() }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-3">
        <input class="input-field" type="email" placeholder="Email" formControlName="email" autocomplete="email" />
        <input class="input-field" type="password" placeholder="Password" formControlName="password" autocomplete="current-password" />
        <button type="submit" class="btn-primary mt-2" [disabled]="form.invalid || isLoading()">
          {{ isLoading() ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>

      <div class="flex items-center gap-3 my-5 text-gray-400 text-xs">
        <div class="flex-1 h-px bg-gray-200"></div>
        OR
        <div class="flex-1 h-px bg-gray-200"></div>
      </div>

      <button class="btn-secondary flex items-center justify-center gap-2" (click)="loginWithGoogle()" [disabled]="isLoading()">
        <span class="material-icons text-[18px]">login</span>
        Continue with Google
      </button>

      <p class="text-center text-sm text-gray-500 mt-8">
        Don't have an account?
        <a routerLink="/register" class="text-primary-600 font-semibold">Create one</a>
      </p>

      <a routerLink="/" class="text-center text-sm text-gray-400 mt-4">Continue as guest →</a>
    </div>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isLoading = signal(false);
  errorMessage = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  private redirect(): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.router.navigateByUrl(returnUrl);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.loginWithEmail(email, password);
      this.redirect();
    } catch (err) {
      console.error('[Email sign-in]', err);
      this.errorMessage.set(friendlyAuthError(err));
    } finally {
      this.isLoading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.loginWithGoogle();
      this.redirect();
    } catch (err) {
      console.error('[Google sign-in]', err);
      this.errorMessage.set(friendlyAuthError(err));
    } finally {
      this.isLoading.set(false);
    }
  }
}

export function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-disabled': 'This account has been disabled — contact an admin.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    // Google popup / provider configuration
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup — allow popups for this site and try again.',
    'auth/operation-not-allowed': 'Google sign-in isn’t enabled for this project (Firebase Console → Authentication → Sign-in method).',
    'auth/unauthorized-domain': 'This address isn’t in Firebase’s authorised domains (Authentication → Settings → Authorized domains).',
    'auth/internal-error': 'Sign-in failed — the Google provider may not be configured. See the browser console for the exact error.',
    'auth/network-request-failed': 'Network error — check your connection and try again.',
    'auth/account-exists-with-different-credential':
      'That email is already registered with a different sign-in method.',
  };
  return map[code] ?? `Something went wrong. Please try again.${code ? ` (${code})` : ''}`;
}
