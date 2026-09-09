import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { friendlyAuthError } from '../login/login.component';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col justify-center px-6 py-10 max-w-md mx-auto">
      <div class="text-center mb-8">
        <span class="material-icons text-primary-500 text-5xl">emoji_events</span>
        <h1 class="text-2xl font-extrabold mt-2">Create your account</h1>
        <p class="text-gray-500 text-sm mt-1">Follow tournaments or start organizing your own</p>
      </div>

      @if (errorMessage()) {
        <div class="bg-red-50 text-accent-red text-sm rounded-xl px-4 py-3 mb-4">{{ errorMessage() }}</div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-3">
        <input class="input-field" type="text" placeholder="Full name" formControlName="displayName" autocomplete="name" />
        <input class="input-field" type="email" placeholder="Email" formControlName="email" autocomplete="email" />
        <input class="input-field" type="password" placeholder="Password" formControlName="password" autocomplete="new-password" />
        <input class="input-field" type="password" placeholder="Confirm password" formControlName="confirmPassword" autocomplete="new-password" />
        @if (form.errors?.['passwordMismatch'] && form.get('confirmPassword')?.touched) {
          <p class="text-accent-red text-xs -mt-2">Passwords do not match.</p>
        }
        <button type="submit" class="btn-primary mt-2" [disabled]="form.invalid || isLoading()">
          {{ isLoading() ? 'Creating account…' : 'Create Account' }}
        </button>
      </form>

      <p class="text-center text-sm text-gray-500 mt-8">
        Already have an account?
        <a routerLink="/login" class="text-primary-600 font-semibold">Sign in</a>
      </p>
    </div>
  `,
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  isLoading = signal(false);
  errorMessage = signal('');

  form = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator }
  );

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const { displayName, email, password } = this.form.getRawValue();
      await this.auth.registerWithEmail(email, password, displayName);
      this.router.navigateByUrl('/');
    } catch (err) {
      this.errorMessage.set(friendlyAuthError(err));
    } finally {
      this.isLoading.set(false);
    }
  }
}
