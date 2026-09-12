import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { FcmService } from '../../core/services/fcm.service';
import { MembersComponent } from '../members/members.component';
import { initialsAvatar } from '../../shared/utils/avatar.util';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, MembersComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-6 max-w-xl mx-auto">
      <div class="flex flex-col items-center gap-2 mb-6">
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
        <div class="font-bold text-lg">{{ auth.displayName() }}</div>
        <div class="text-sm text-gray-400">{{ auth.appUser()?.email }}</div>
        <span class="badge bg-primary-50 text-primary-700 capitalize">{{ roleLabelKey() | translate }}</span>
      </div>

      <div class="card mb-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold text-sm">{{ 'PROFILE.PUSH_NOTIFICATIONS' | translate }}</div>
            <div class="text-xs text-gray-400">{{ 'PROFILE.PUSH_HINT' | translate }}</div>
          </div>
          <button class="btn-secondary !py-1.5 !px-3 text-xs" (click)="enablePush()">
            {{ pushLabel() | translate }}
          </button>
        </div>
      </div>

      <button class="btn-secondary w-full flex items-center justify-center gap-2 text-accent-red" (click)="logout()">
        <span class="material-icons text-[18px]">logout</span> {{ 'PROFILE.SIGN_OUT' | translate }}
      </button>

      @if (auth.isAdmin()) {
        <div class="mt-6">
          <app-members />
        </div>
      }
    </div>
  `,
})
export class ProfileComponent {
  auth = inject(AuthService);
  private fcm = inject(FcmService);
  private router = inject(Router);

  avatar = computed(() =>
    initialsAvatar(this.auth.displayName() || this.auth.appUser()?.email)
  );
  photoFailed = signal(false);

  roleLabelKey = computed(() =>
    this.auth.appUser()?.role === 'admin' ? 'PROFILE.ROLE_ADMIN' : 'PROFILE.ROLE_VIEWER'
  );

  pushLabel(): string {
    const state = this.fcm.permissionState();
    if (state === 'granted') return 'PROFILE.PUSH_ENABLED';
    if (state === 'unsupported') return 'PROFILE.PUSH_UNSUPPORTED';
    return 'PROFILE.PUSH_ENABLE';
  }

  async enablePush(): Promise<void> {
    await this.fcm.requestPermissionAndRegister();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigateByUrl('/');
  }
}
