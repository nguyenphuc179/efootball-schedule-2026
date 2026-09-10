import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MemberService } from './member.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { initialsAvatar } from '../../shared/utils/avatar.util';
import { AppUser, UserRole, userDisplayName } from '../../models/user.model';

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
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.isAdmin()) {
      <div class="card">
        <button type="button" class="w-full flex items-center justify-between gap-3 text-left" (click)="toggle()">
          <span>
            <span class="block font-bold text-sm">Members</span>
            <span class="block text-xs text-gray-400">{{ members().length }} registered · admins can manage everything</span>
          </span>
          <span class="material-icons text-gray-400 shrink-0">{{ expanded() ? 'expand_less' : 'expand_more' }}</span>
        </button>

        @if (expanded()) {
          <div class="mt-3">
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
                </div>

                @if (editingUid() === m.uid) {
                  <div class="flex-1 min-w-0 flex items-center gap-2">
                    <input
                      #nameInput
                      class="input-field !py-1.5 !px-2 text-sm flex-1 min-w-0"
                      [value]="nameDraft()"
                      placeholder="System display name"
                      autocomplete="off"
                      (keydown.enter)="saveName(m, nameInput.value)"
                      (keydown.escape)="cancelEditName()"
                    />
                    <button
                      class="text-xs font-semibold text-primary-600 shrink-0 min-h-0 disabled:opacity-40"
                      [disabled]="savingUid() === m.uid"
                      (click)="saveName(m, nameInput.value)"
                    >
                      {{ savingUid() === m.uid ? '…' : 'Save' }}
                    </button>
                    <button class="text-xs font-semibold text-gray-400 shrink-0 min-h-0" (click)="cancelEditName()">Cancel</button>
                  </div>
                } @else {
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span class="truncate">{{ nameOf(m) }}</span>
                      @if (m.uid === myUid()) {
                        <span class="text-xs text-gray-400 font-normal">(you)</span>
                      }
                      @if (m.disabled) {
                        <span class="text-[10px] uppercase tracking-wide bg-red-50 text-accent-red rounded px-1.5 py-0.5">Disabled</span>
                      }
                      <button
                        class="text-[11px] font-semibold text-primary-600 shrink-0 min-h-0"
                        [disabled]="savingUid() === m.uid"
                        (click)="startEditName(m)"
                      >
                        {{ m.systemDisplayName ? 'Edit' : 'Add' }}
                      </button>
                    </div>
                    <div class="text-xs text-gray-400 truncate">
                      {{ m.email || m.uid }}
                      @if (m.systemDisplayName && m.displayName) {
                        <span class="italic"> · login: {{ m.displayName }}</span>
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
      this.editingUid.set(null);
    } catch (err) {
      console.error('[Members] setUserSystemDisplayName', err);
      this.errorMsg.set('Could not save that name — check your connection and permissions.');
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
    const name = userDisplayName(member, 'This member');

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
    return initialsAvatar(userDisplayName(member, member.email ?? '?'));
  }
}
