import { ChangeDetectionStrategy, Component, Inject, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TeamService } from '../team.service';
import { Team } from '../../../models/team.model';

export interface TeamFormDialogData {
  tournamentId: string;
  team?: Team;
}

/**
 * "Add/Edit Team" as a FULL-SCREEN dialog on mobile (per spec: full-screen dialogs instead of
 * centered modals). Opened via MatDialog with a width/height of 100vw/100dvh — see
 * team-list.component.ts for the `openDialog` call with that config.
 *
 * Logo is an optional external URL (paste a link) — the project runs on the Spark plan where
 * Firebase Storage is unavailable, so there's no file upload.
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
            @if (logoPreview()) {
              <img [src]="logoPreview()" alt="Team logo" class="w-full h-full object-cover" (error)="imgError.set(true)" />
            } @else {
              <span class="material-icons text-3xl text-gray-300">shield</span>
            }
          </div>
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
          <span class="text-sm font-medium text-gray-600">Team Name</span>
          <input class="input-field" formControlName="teamName" placeholder="Arsenal FC" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Manager</span>
          <input class="input-field" formControlName="manager" placeholder="Manager name" />
        </label>
      </form>
    </div>
  `,
})
export class TeamFormComponent {
  private fb = inject(FormBuilder);
  private teamService = inject(TeamService);

  isSaving = signal(false);
  imgError = signal(false);
  logoPreview = signal<string | null>(this.data.team?.logo ?? null);

  form = this.fb.nonNullable.group({
    teamName: [this.data.team?.teamName ?? '', Validators.required],
    manager: [this.data.team?.manager ?? '', Validators.required],
    logo: [this.data.team?.logo ?? '', Validators.pattern(/^https?:\/\/.+/i)],
  });

  constructor(
    public dialogRef: MatDialogRef<TeamFormComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: TeamFormDialogData
  ) {
    this.form.controls.logo.valueChanges.pipe(takeUntilDestroyed()).subscribe((url) => {
      this.logoPreview.set(url && /^https?:\/\/.+/i.test(url) ? url : null);
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const raw = this.form.getRawValue();
      const logo = raw.logo.trim() || null;
      const id = this.data.team?.id;
      if (id) {
        await this.teamService.update(id, { teamName: raw.teamName, manager: raw.manager, logo });
      } else {
        await this.teamService.create({
          tournamentId: this.data.tournamentId,
          teamName: raw.teamName,
          manager: raw.manager,
          logo,
          managerUid: null,
        });
      }
      this.dialogRef.close(true);
    } finally {
      this.isSaving.set(false);
    }
  }
}
