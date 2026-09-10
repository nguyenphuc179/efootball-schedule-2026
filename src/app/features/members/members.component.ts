import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MemberService } from './member.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { initialsAvatar } from '../../shared/utils/avatar.util';
import { AppUser, UserRole } from '../../models/user.model';

/**
 * Admin-only Members panel: lists every registered user, flips each between Viewer / Admin, and
 * disables (locks out) an account. You can't change your own role or disable yourself.
 *
 * "Disable" sets `users/{uid}.disabled` — firestore.rules rejects every privileged action from a
 * disabled user and the app force-signs them out. It does NOT touch the Firebase Auth account;
 * delete that in the Firebase Console if you also need to free up the email.
 */
@Component({
  selector: 'app-members',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isAdmin()) {
      <div class="card">
        <h3 class="font-bold text-sm mb-1">Members</h3>
        <p class="text-xs text-gray-400 mb-3">{{ members().length }} registered · admins can manage everything</p>

        @if (members().length === 0) {
          <p class="text-sm text-gray-400">No members yet.</p>
        } @else {
          <div class="flex flex-col divide-y divide-gray-100">
            @for (m of members(); track m.uid) {
              <div class="flex items-center gap-3 py-2.5" [class.opacity-50]="m.disabled">
                <div
                  class="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                  [style.background-color]="avatar(m).bg"
                >
                  @if (m.photoURL && !failedPhotos().has(m.uid)) {
                    <img
                      [src]="m.photoURL"
                      [alt]="m.displayName ?? ''"
                      class="w-full h-full object-cover"
                      width="36"
                      height="36"
                      referrerpolicy="no-referrer"
                      (error)="markPhotoFailed(m.uid)"
                    />
                  } @else {
                    <span class="text-xs font-bold" [style.color]="avatar(m).fg">{{ avatar(m).initials }}</span>
                  }
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold truncate">
                    {{ m.displayName || m.email || 'Unknown user' }}
                    @if (m.uid === myUid()) {
                      <span class="text-xs text-gray-400 font-normal">(you)</span>
                    }
                    @if (m.disabled) {
                      <span class="text-[10px] uppercase tracking-wide bg-red-50 text-accent-red rounded px-1.5 py-0.5 ml-1">Disabled</span>
                    }
                  </div>
                  <div class="text-xs text-gray-400 truncate">{{ m.email || m.uid }}</div>
                </div>

                <select
                  class="input-field !py-1.5 !px-2 !w-auto text-sm"
                  [value]="m.role"
                  [disabled]="m.uid === myUid() || savingUid() === m.uid || !!m.disabled"
                  (change)="changeRole(m, $any($event.target).value)"
                >
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>

                @if (m.uid !== myUid()) {
                  <button
                    class="text-xs font-semibold shrink-0 disabled:opacity-40"
                    [class]="m.disabled ? 'text-primary-600' : 'text-accent-red'"
                    [disabled]="savingUid() === m.uid"
                    (click)="toggleDisabled(m)"
                  >
                    {{ m.disabled ? 'Enable' : 'Disable' }}
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
  `,
})
export class MembersComponent {
  private memberService = inject(MemberService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  members = toSignal(this.memberService.streamMembers(), { initialValue: [] as AppUser[] });
  myUid = computed(() => this.auth.firebaseUser()?.uid);
  savingUid = signal<string | null>(null);
  errorMsg = signal('');
  failedPhotos = signal<Set<string>>(new Set());

  markPhotoFailed(uid: string): void {
    this.failedPhotos.update((set) => new Set(set).add(uid));
  }

  async changeRole(member: AppUser, role: UserRole): Promise<void> {
    if (role === member.role || member.uid === this.myUid() || member.disabled) return;
    this.savingUid.set(member.uid);
    this.errorMsg.set('');
    try {
      await this.auth.setUserRole(member.uid, role);
    } catch (err) {
      console.error('[Members] setUserRole', err);
      this.errorMsg.set('Could not update that role — check your connection and permissions.');
    } finally {
      this.savingUid.set(null);
    }
  }

  async toggleDisabled(member: AppUser): Promise<void> {
    if (member.uid === this.myUid() || this.savingUid()) return;
    const next = !member.disabled;
    const name = member.displayName || member.email || 'This member';

    if (next) {
      const ref = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Disable member?',
          message: `${name} will be signed out and blocked from doing anything in the app. Their login isn't deleted — re-enable them here any time, or delete the account in Firebase Console to free the email.`,
          destructive: true,
          confirmLabel: 'Disable',
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
    } catch (err) {
      console.error('[Members] setUserDisabled', err);
      this.errorMsg.set('Could not update that member — check your connection and permissions.');
    } finally {
      this.savingUid.set(null);
    }
  }

  avatar(member: AppUser) {
    return initialsAvatar(member.displayName || member.email);
  }
}
