import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { initialsAvatar } from '../../shared/utils/avatar.util';
import { downscaleToDataUri } from '../../shared/utils/image-downscale.util';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-6 max-w-xl mx-auto">
      <div class="flex flex-col items-center gap-2 mb-6">
        <div class="relative">
          <div
            class="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
            [style.background-color]="avatar().bg"
          >
            @if (auth.appUser()?.photoURL && !photoFailed()) {
              <img
                [src]="auth.appUser()!.photoURL"
                class="w-full h-full object-cover"
                referrerpolicy="no-referrer"
                (error)="photoFailed.set(true)"
              />
            } @else {
              <span class="text-2xl font-bold" [style.color]="avatar().fg">{{ avatar().initials }}</span>
            }
          </div>
          <button
            type="button"
            class="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary-600 text-white flex items-center justify-center shadow disabled:opacity-50"
            [disabled]="uploadingAvatar()"
            (click)="avatarFileInput.click()"
            [attr.aria-label]="'PROFILE.UPLOAD_AVATAR' | translate"
          >
            <span class="material-icons text-[14px]">{{ uploadingAvatar() ? 'hourglass_top' : 'photo_camera' }}</span>
          </button>
          <input #avatarFileInput type="file" accept="image/*" hidden (change)="onAvatarSelected($event)" />
        </div>
        <div class="font-bold text-lg">{{ auth.displayName() }}</div>
        <div class="text-sm text-gray-400">{{ auth.appUser()?.email }}</div>
        @if (auth.appUser()) {
          <span class="badge bg-primary-50 text-primary-700 capitalize">{{ roleLabelKey() | translate }}</span>
        }
        @if (avatarError()) {
          <p class="text-xs text-red-500">{{ avatarError() }}</p>
        }
      </div>

      <div class="card !p-0 flex flex-col divide-y divide-gray-100">
        @if (auth.isAdmin()) {
          <a routerLink="/members" class="flex items-center gap-3 px-4 py-3 no-underline text-inherit">
            <span class="material-icons text-[20px] text-gray-500">group</span>
            <span class="flex-1 text-sm font-semibold">{{ 'MEMBERS.TITLE' | translate }}</span>
            <span class="material-icons text-gray-300">chevron_right</span>
          </a>
        }
        <a routerLink="/guide" class="flex items-center gap-3 px-4 py-3 no-underline text-inherit">
          <span class="material-icons text-[20px] text-gray-500">menu_book</span>
          <span class="flex-1 text-sm font-semibold">{{ 'NAV.GUIDE' | translate }}</span>
          <span class="material-icons text-gray-300">chevron_right</span>
        </a>
        <a routerLink="/skills" class="flex items-center gap-3 px-4 py-3 no-underline text-inherit">
          <span class="material-icons text-[20px] text-gray-500">auto_awesome</span>
          <span class="flex-1 text-sm font-semibold">{{ 'NAV.SKILLS' | translate }}</span>
          <span class="material-icons text-gray-300">chevron_right</span>
        </a>
      </div>

      <button class="btn-secondary !text-accent-red w-full flex items-center justify-center gap-2 mt-4" (click)="logout()">
        <span class="material-icons text-[18px]">logout</span> {{ 'PROFILE.SIGN_OUT' | translate }}
      </button>
    </div>
  `,
})
export class ProfileComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  private translate = inject(TranslateService);

  avatar = computed(() =>
    initialsAvatar(this.auth.displayName() || this.auth.appUser()?.email)
  );
  photoFailed = signal(false);
  uploadingAvatar = signal(false);
  avatarError = signal('');

  roleLabelKey = computed(() =>
    this.auth.appUser()?.role === 'admin' ? 'PROFILE.ROLE_ADMIN' : 'PROFILE.ROLE_VIEWER'
  );

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again later
    const uid = this.auth.firebaseUser()?.uid;
    if (!file || !uid) return;

    this.avatarError.set('');
    this.uploadingAvatar.set(true);
    try {
      const dataUri = await downscaleToDataUri(file);
      await this.auth.setUserPhotoURL(uid, dataUri);
      this.photoFailed.set(false);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.avatarError.set(`${this.translate.instant('PROFILE.AVATAR_UPLOAD_FAILED')} (${detail})`);
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
