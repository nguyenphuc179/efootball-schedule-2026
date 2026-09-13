import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MemberService } from './member.service';
import { AuthService } from '../../core/services/auth.service';
import { ActivityLogService } from '../../core/services/activity-log.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { initialsAvatar } from '../../shared/utils/avatar.util';
import { downscaleToDataUri } from '../../shared/utils/image-downscale.util';
import { AppUser, UserRole, userDisplayName } from '../../models/user.model';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

/**
 * Admin-only Members panel: lists every registered user, flips each between Viewer / Admin, and
 * disables (locks out) an account. You can't change your own role or disable yourself.
 *
 * Each member also has a "System display name" — an admin-set name shown everywhere in the app in
 * place of the (often inconsistent) name that came from their Google/email login. The login name
 * is kept as a fallback; the Add/Edit button here sets or clears the override.
 *
 * "Disable" sets `users/{uid}.disabled` — firestore.rules rejects every privileged action from a
 * disabled user and the app force-signs them out. It does NOT touch the Firebase Auth account;
 * delete that in the Firebase Console if you also need to free up the email.
 */
@Component({
  selector: 'app-members',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isAdmin()) {
      <div class="card">
        <button type="button" class="w-full flex items-center justify-between gap-3 text-left" (click)="toggle()">
          <span>
            <span class="block font-bold text-sm">{{ 'MEMBERS.TITLE' | translate }}</span>
            <span class="block text-xs text-gray-400">{{ 'MEMBERS.SUBTITLE' | translate: { count: members().length } }}</span>
          </span>
          <span class="material-icons text-gray-400 shrink-0">{{ expanded() ? 'expand_less' : 'expand_more' }}</span>
        </button>

        @if (expanded()) {
          <div class="mt-3">
            @if (members().length === 0) {
              <p class="text-sm text-gray-400">{{ 'MEMBERS.EMPTY' | translate }}</p>
            } @else {
              <div class="flex flex-col divide-y divide-gray-100">
            @for (m of members(); track m.uid) {
              <div class="flex items-center gap-3 py-2.5" [class.opacity-50]="m.disabled">
                <div class="relative w-9 h-9 shrink-0">
                  <button
                    type="button"
                    class="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden disabled:opacity-50"
                    [style.background-color]="avatar(m).bg"
                    [disabled]="uploadingPhotoUid() === m.uid"
                    (click)="photoInput.click()"
                    [attr.aria-label]="'MEMBERS.UPLOAD_PHOTO' | translate"
                  >
                    @if (uploadingPhotoUid() === m.uid) {
                      <span class="material-icons text-white text-[16px]">hourglass_top</span>
                    } @else if (m.photoURL && !failedPhotos().has(m.uid)) {
                      <img
                        [src]="m.photoURL"
                        [alt]="nameOf(m)"
                        class="w-full h-full object-cover"
                        width="36"
                        height="36"
                        referrerpolicy="no-referrer"
                        (error)="markPhotoFailed(m.uid)"
                      />
                    } @else {
                      <span class="text-xs font-bold" [style.color]="avatar(m).fg">{{ avatar(m).initials }}</span>
                    }
                  </button>
                  <input #photoInput type="file" accept="image/*" hidden (change)="onPhotoSelected(m, $event)" />
                </div>

                @if (editingUid() === m.uid) {
                  <div class="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      #nameInput
                      class="input-field !py-1.5 !px-2 text-sm flex-1 min-w-0"
                      [value]="nameDraft()"
                      [placeholder]="'MEMBERS.SYSTEM_NAME_PLACEHOLDER' | translate"
                      autocomplete="off"
                      (keydown.enter)="saveName(m, nameInput.value)"
                      (keydown.escape)="cancelEditName()"
                    />
                    <button
                      class="text-xs font-semibold text-primary-600 shrink-0 min-h-0 disabled:opacity-40"
                      [disabled]="savingUid() === m.uid"
                      (click)="saveName(m, nameInput.value)"
                    >
                      {{ savingUid() === m.uid ? '…' : ('COMMON.SAVE' | translate) }}
                    </button>
                    <button class="text-xs font-semibold text-gray-400 shrink-0 min-h-0" (click)="cancelEditName()">{{ 'COMMON.CANCEL' | translate }}</button>
                  </div>
                } @else {
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span class="truncate">{{ nameOf(m) }}</span>
                      @if (m.uid === myUid()) {
                        <span class="text-xs text-gray-400 font-normal">{{ 'MEMBERS.YOU' | translate }}</span>
                      }
                      @if (m.disabled) {
                        <span class="text-[10px] uppercase tracking-wide bg-red-50 text-accent-red rounded px-1.5 py-0.5">{{ 'MEMBERS.DISABLED_BADGE' | translate }}</span>
                      }
                      <button
                        class="text-[11px] font-semibold text-primary-600 shrink-0 min-h-0"
                        [disabled]="savingUid() === m.uid"
                        (click)="startEditName(m)"
                      >
                        {{ (m.systemDisplayName ? 'COMMON.EDIT' : 'MEMBERS.ADD') | translate }}
                      </button>
                    </div>
                    <div class="text-xs text-gray-400 truncate">
                      {{ m.email || m.uid }}
                      @if (m.systemDisplayName && m.displayName) {
                        <span class="italic"> · {{ 'MEMBERS.LOGIN_NAME' | translate: { name: m.displayName } }}</span>
                      }
                    </div>
                  </div>
                }

                <select
                  class="input-field !py-1.5 !px-2 !w-auto text-sm"
                  [value]="m.role"
                  [disabled]="m.uid === myUid() || savingUid() === m.uid || !!m.disabled"
                  (change)="changeRole(m, $any($event.target).value)"
                >
                  <option value="viewer">{{ 'MEMBERS.ROLE_VIEWER' | translate }}</option>
                  <option value="admin">{{ 'MEMBERS.ROLE_ADMIN' | translate }}</option>
                </select>

                @if (m.uid !== myUid()) {
                  <button
                    class="text-xs font-semibold shrink-0 disabled:opacity-40"
                    [class]="m.disabled ? 'text-primary-600' : 'text-accent-red'"
                    [disabled]="savingUid() === m.uid"
                    (click)="toggleDisabled(m)"
                  >
                    {{ (m.disabled ? 'MEMBERS.ENABLE' : 'MEMBERS.DISABLE') | translate }}
                  </button>
                }
              </div>
            }
              </div>
            }

            @if (errorMsg()) {
              <p class="text-xs text-accent-red mt-2">{{ errorMsg() }}</p>
            }
          </div>
        }
      </div>
    }
  `,
})
export class MembersComponent {
  private memberService = inject(MemberService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  auth = inject(AuthService);
  private activityLog = inject(ActivityLogService);

  members = toSignal(this.memberService.streamMembers(), { initialValue: [] as AppUser[] });
  myUid = computed(() => this.auth.firebaseUser()?.uid);
  savingUid = signal<string | null>(null);
  errorMsg = signal('');
  failedPhotos = signal<Set<string>>(new Set());
  uploadingPhotoUid = signal<string | null>(null);

  /** Which member's name is being edited inline, plus the seeded draft value. */
  editingUid = signal<string | null>(null);
  nameDraft = signal('');

  private readonly openKey = 'pitchpro-members-open';
  expanded = signal<boolean>(this.readOpen());

  private readOpen(): boolean {
    try {
      return localStorage.getItem(this.openKey) !== '0';
    } catch {
      return true;
    }
  }

  toggle(): void {
    const next = !this.expanded();
    this.expanded.set(next);
    try {
      localStorage.setItem(this.openKey, next ? '1' : '0');
    } catch {
      /* storage unavailable — fine, just don't persist */
    }
  }

  nameOf(member: AppUser): string {
    return userDisplayName(member);
  }

  markPhotoFailed(uid: string): void {
    this.failedPhotos.update((set) => new Set(set).add(uid));
  }

  async onPhotoSelected(member: AppUser, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again later
    if (!file) return;

    this.errorMsg.set('');
    this.uploadingPhotoUid.set(member.uid);
    try {
      const dataUri = await downscaleToDataUri(file);
      await this.auth.setUserPhotoURL(member.uid, dataUri);
      this.failedPhotos.update((set) => {
        if (!set.has(member.uid)) return set;
        const next = new Set(set);
        next.delete(member.uid);
        return next;
      });
      await this.activityLog.log(
        'user_photo_set',
        `Đã tải ảnh đại diện lên cho ${member.email ?? member.uid}`,
        null,
        member.uid
      );
    } catch (err) {
      console.error('[Members] setUserPhotoURL', err);
      this.errorMsg.set(this.translate.instant('MEMBERS.UPLOAD_PHOTO_FAILED'));
    } finally {
      this.uploadingPhotoUid.set(null);
    }
  }

  startEditName(member: AppUser): void {
    this.errorMsg.set('');
    this.nameDraft.set(member.systemDisplayName ?? '');
    this.editingUid.set(member.uid);
  }

  cancelEditName(): void {
    this.editingUid.set(null);
  }

  async saveName(member: AppUser, value: string): Promise<void> {
    const next = value.trim();
    if ((member.systemDisplayName ?? '') === next) {
      this.editingUid.set(null);
      return;
    }
    this.savingUid.set(member.uid);
    this.errorMsg.set('');
    try {
      await this.auth.setUserSystemDisplayName(member.uid, next || null);
      await this.activityLog.log(
        'user_name_override',
        next
          ? `Đã đổi tên hiển thị của ${member.email ?? member.uid} thành "${next}"`
          : `Đã xoá tên hiển thị tuỳ chỉnh của ${member.email ?? member.uid}`
      );
      this.editingUid.set(null);
    } catch (err) {
      console.error('[Members] setUserSystemDisplayName', err);
      this.errorMsg.set(this.translate.instant('MEMBERS.SAVE_NAME_FAILED'));
    } finally {
      this.savingUid.set(null);
    }
  }

  async changeRole(member: AppUser, role: UserRole): Promise<void> {
    if (role === member.role || member.uid === this.myUid() || member.disabled) return;
    this.savingUid.set(member.uid);
    this.errorMsg.set('');
    try {
      await this.auth.setUserRole(member.uid, role);
      await this.activityLog.log('user_role_change', `Đã đổi quyền của ${member.email ?? member.uid} thành ${role}`);
    } catch (err) {
      console.error('[Members] setUserRole', err);
      this.errorMsg.set(this.translate.instant('MEMBERS.UPDATE_ROLE_FAILED'));
    } finally {
      this.savingUid.set(null);
    }
  }

  async toggleDisabled(member: AppUser): Promise<void> {
    if (member.uid === this.myUid() || this.savingUid()) return;
    const next = !member.disabled;
    const name = userDisplayName(member, this.translate.instant('MEMBERS.THIS_MEMBER'));

    if (next) {
      const ref = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: this.translate.instant('MEMBERS.DISABLE_CONFIRM_TITLE'),
          message: this.translate.instant('MEMBERS.DISABLE_CONFIRM_MESSAGE', { name }),
          destructive: true,
          confirmLabel: this.translate.instant('MEMBERS.DISABLE'),
        },
        width: '90vw',
        maxWidth: '400px',
      });
      if (!(await ref.afterClosed().toPromise())) return;
    }

    this.savingUid.set(member.uid);
    this.errorMsg.set('');
    try {
      await this.auth.setUserDisabled(member.uid, next);
      await this.activityLog.log(
        'user_disabled_change',
        next ? `Đã khoá tài khoản ${member.email ?? member.uid}` : `Đã mở khoá tài khoản ${member.email ?? member.uid}`
      );
    } catch (err) {
      console.error('[Members] setUserDisabled', err);
      this.errorMsg.set(this.translate.instant('MEMBERS.UPDATE_MEMBER_FAILED'));
    } finally {
      this.savingUid.set(null);
    }
  }

  avatar(member: AppUser) {
    return initialsAvatar(userDisplayName(member, member.email ?? '?'));
  }
}
