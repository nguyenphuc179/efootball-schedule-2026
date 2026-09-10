import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TeamService } from '../team.service';
import { MemberService } from '../../members/member.service';
import { Team } from '../../../models/team.model';
import { AppUser } from '../../../models/user.model';
import { initialsAvatarDataUri } from '../../../shared/utils/avatar.util';

export interface TeamFormDialogData {
  tournamentId: string;
  team?: Team;
  /** Seed number for the "Team N" default when adding a new team. */
  nextIndex?: number;
}

/** A pasted image link — as opposed to an empty value or the generated `data:` avatar. */
const isExternalLogo = (logo: string | null | undefined): logo is string => /^https?:\/\/.+/i.test(logo ?? '');

/**
 * "Add/Edit Team" as a FULL-SCREEN dialog on mobile (per spec: full-screen dialogs instead of
 * centered modals). Opened via MatDialog with a width/height of 100vw/100dvh — see
 * team-list.component.ts for the `openDialog` call with that config.
 *
 * Logo is an optional external URL (paste a link) — the project runs on the Spark plan where
 * Firebase Storage is unavailable, so there's no file upload. Manager is picked from the active
 * members; it wires up `managerUid`, which firestore.rules use to let that person manage the team.
 */
@Component({
  selector: 'app-team-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ data.team ? 'Edit Team' : 'Add Team' }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="save()">
          {{ isSaving() ? 'Saving…' : 'Save' }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2">
          <div class="w-24 h-24 rounded-full bg-surface-muted flex items-center justify-center overflow-hidden">
            <img [src]="logoPreview()" alt="Team logo" class="w-full h-full object-cover" (error)="imgError.set(true)" />
          </div>
          <span class="text-xs text-gray-400">Default avatar used until you add a logo URL</span>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Logo URL <span class="text-gray-400">(optional)</span></span>
          <input
            class="input-field"
            formControlName="logo"
            inputmode="url"
            placeholder="https://example.com/logo.png"
            (input)="imgError.set(false)"
          />
          @if (form.controls.logo.invalid && form.controls.logo.value) {
            <span class="text-xs text-red-500">Must start with http:// or https://</span>
          } @else if (imgError() && form.controls.logo.value) {
            <span class="text-xs text-red-500">That image couldn't be loaded — check the link.</span>
          }
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Club Name</span>
          <input class="input-field" formControlName="teamName" placeholder="Arsenal FC" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Manager</span>
          <select class="input-field" formControlName="managerUid">
            <option value="">— No manager —</option>
            @for (m of activeMembers(); track m.uid) {
              <option [value]="m.uid">{{ m.name }}</option>
            }
          </select>
          <span class="text-xs text-gray-400">Chosen from active members — they can then manage this team's roster.</span>
        </label>
      </form>
    </div>
  `,
})
export class TeamFormComponent {
  private fb = inject(FormBuilder);
  private teamService = inject(TeamService);
  private memberService = inject(MemberService);

  isSaving = signal(false);
  imgError = signal(false);

  private readonly editing = !!this.data.team;
  private readonly seedIndex = this.data.nextIndex ?? 1;

  private members = toSignal(this.memberService.streamMembers(), { initialValue: [] as AppUser[] });
  activeMembers = computed(() =>
    this.members()
      .filter((m) => !m.disabled)
      .map((m) => ({ uid: m.uid, name: m.displayName || m.email || m.uid }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  form = this.fb.nonNullable.group({
    teamName: [
      this.data.team?.teamName ?? (this.editing ? '' : `Team ${this.seedIndex}`),
      Validators.required,
    ],
    managerUid: [this.data.team?.managerUid ?? ''],
    // Only surface a real pasted URL — the generated `data:` avatar isn't something to edit.
    logo: [isExternalLogo(this.data.team?.logo) ? this.data.team!.logo! : '', Validators.pattern(/^https?:\/\/.+/i)],
  });

  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** The typed URL if it looks valid and loads, otherwise a generated initials avatar. */
  logoPreview = computed(() => {
    const value = this.formValue() ?? {};
    const url = (value.logo ?? '').trim();
    if (/^https?:\/\/.+/i.test(url) && !this.imgError()) return url;
    return initialsAvatarDataUri(value.teamName || `Team ${this.seedIndex}`);
  });

  constructor(
    public dialogRef: MatDialogRef<TeamFormComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: TeamFormDialogData
  ) {}

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const raw = this.form.getRawValue();
      const logo = raw.logo.trim() || initialsAvatarDataUri(raw.teamName);
      const managerUid = raw.managerUid || null;
      const manager = this.activeMembers().find((m) => m.uid === managerUid)?.name ?? '';

      const id = this.data.team?.id;
      if (id) {
        await this.teamService.update(id, { teamName: raw.teamName, manager, managerUid, logo });
      } else {
        await this.teamService.create({
          tournamentId: this.data.tournamentId,
          teamName: raw.teamName,
          manager,
          managerUid,
          logo,
        });
      }
      this.dialogRef.close(true);
    } finally {
      this.isSaving.set(false);
    }
  }
}
