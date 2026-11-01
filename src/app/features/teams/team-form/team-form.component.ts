import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../team.service';
import { MemberService } from '../../members/member.service';
import { MatchService } from '../../fixtures/match.service';
import { Match } from '../../../models/match.model';
import { Team, teamGroup } from '../../../models/team.model';
import { AppUser, userDisplayName } from '../../../models/user.model';
import { ImageUrlFieldComponent } from '../../../shared/components/image-url-field/image-url-field.component';
import { AppSelectComponent, AppSelectOption } from '../../../shared/components/app-select/app-select.component';
import { IMAGE_SRC_PATTERN, isImageSrc, isUserImage } from '../../../shared/utils/image-url.util';
import { initialsAvatarDataUri } from '../../../shared/utils/avatar.util';
import { playerLabel } from '../../../shared/utils/player-label.util';

export interface TeamFormDialogData {
  tournamentId: string;
  team?: Team;
  tournamentType?: string;
  /** Seed number for the "Team N" default when adding a new team. */
  nextIndex?: number;
}

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
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, ImageUrlFieldComponent, AppSelectComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ (data.team ? 'TEAM_FORM.EDIT_TITLE' : 'TEAM_FORM.ADD_TITLE') | translate }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="save()">
          {{ (isSaving() ? 'COMMON.SAVING' : 'COMMON.SAVE') | translate }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2">
          <div class="w-24 h-24 rounded-full bg-surface-muted flex items-center justify-center overflow-hidden">
            <img [src]="logoPreview()" [alt]="'TEAM_FORM.LOGO' | translate" class="w-full h-full object-cover" (error)="imgError.set(true)" />
          </div>
          <span class="text-xs text-gray-400">{{ 'TEAM_FORM.DEFAULT_AVATAR_HINT' | translate }}</span>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.LOGO' | translate }} <span class="text-gray-400">({{ 'TEAM_FORM.OPTIONAL' | translate }})</span></span>
          <app-image-url-field [control]="form.controls.logo" (changed)="imgError.set(false)" />
          @if (form.controls.logo.invalid && form.controls.logo.value) {
            <span class="text-xs text-red-500">{{ 'TEAM_FORM.LOGO_INVALID' | translate }}</span>
          } @else if (imgError() && form.controls.logo.value) {
            <span class="text-xs text-red-500">{{ 'TEAM_FORM.LOGO_LOAD_ERROR' | translate }}</span>
          }
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.CLUB_NAME' | translate }}</span>
          <input class="input-field" formControlName="teamName" placeholder="Arsenal FC" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.MANAGER' | translate }}</span>
          <app-select [control]="form.controls.managerUid" [options]="managerSelectOptions()" (valueChange)="imgError.set(false)" />
          <span class="text-xs text-gray-400">{{ 'TEAM_FORM.MANAGER_HINT' | translate }}</span>
        </label>

        @if (data.tournamentType === 'team_match') {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.GROUP' | translate }}</span>
            <app-select [control]="form.controls.groupLabel" [options]="groupLabelSelectOptions()" />
            <span class="text-xs text-gray-400">{{ 'TEAM_FORM.GROUP_HINT' | translate }}</span>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.ALLOWED_CLUBS' | translate }}</span>
            <textarea class="input-field" rows="4" formControlName="allowedClubs" placeholder="Real Madrid&#10;Barcelona&#10;Man City"></textarea>
            <span class="text-xs text-gray-400">{{ 'TEAM_FORM.ALLOWED_CLUBS_HINT' | translate }}</span>
            @if (orphanClubs().length > 0) {
              <span class="text-xs text-amber-600">{{ 'TEAM_FORM.CLUBS_NOT_IN_LIST' | translate: { clubs: orphanClubs().join(', ') } }}</span>
            }
          </label>

          @if (copySourceOptions().length > 1) {
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-gray-600">{{ 'TEAM_FORM.COPY_CLUBS_FROM' | translate }}</span>
              <app-select [value]="''" [options]="copySourceOptions()" (valueChange)="copyClubsFrom($event)" />
            </div>
          }

          @if (form.controls.groupLabel.value) {
            <label class="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" formControlName="applyToGroup" />
              {{ 'TEAM_FORM.APPLY_TO_GROUP' | translate: { group: form.controls.groupLabel.value } }}
            </label>
          }
        }
      </form>
    </div>
  `,
})
export class TeamFormComponent {
  private fb = inject(FormBuilder);
  private teamService = inject(TeamService);
  private memberService = inject(MemberService);
  private translate = inject(TranslateService);
  private matchService = inject(MatchService);

  isSaving = signal(false);
  imgError = signal(false);

  private readonly editing = !!this.data.team;
  private readonly seedIndex = this.data.nextIndex ?? 1;

  private members = toSignal(this.memberService.streamMembers(), { initialValue: [] as AppUser[] });
  activeMembers = computed(() =>
    this.members()
      .filter((m) => !m.disabled)
      .map((m) => ({ uid: m.uid, name: userDisplayName(m, m.uid), photoURL: m.photoURL ?? null, email: m.email ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  /** A plain method (not `computed`) so `translate.instant()` re-runs on every check and stays in
   *  the current language — this template also uses the `translate` pipe elsewhere, which marks
   *  this OnPush component dirty on a language switch. */
  managerSelectOptions(): AppSelectOption[] {
    return [
      { value: '', label: this.translate.instant('TEAM_FORM.NO_MANAGER_OPTION') },
      ...this.activeMembers().map((m) => ({ value: m.uid, label: m.name })),
    ];
  }

  groupLabelSelectOptions(): AppSelectOption[] {
    return [
      { value: '', label: this.translate.instant('TEAM_FORM.NO_GROUP_OPTION') },
      { value: 'A', label: this.translate.instant('TEAM_MATCH.GROUP_A') },
      { value: 'B', label: this.translate.instant('TEAM_MATCH.GROUP_B') },
    ];
  }

  form = this.fb.nonNullable.group({
    teamName: [
      this.data.team?.teamName ?? (this.editing ? '' : `Team ${this.seedIndex}`),
      Validators.required,
    ],
    managerUid: [this.data.team?.managerUid ?? ''],
    // Pre-fill a real logo (pasted URL or bitmap); a generated `data:` avatar isn't something to edit.
    logo: [isUserImage(this.data.team?.logo) ? this.data.team!.logo! : '', Validators.pattern(IMAGE_SRC_PATTERN)],
    groupLabel: [teamGroup(this.data.team) ?? ''],
    allowedClubs: [(this.data.team?.allowedClubs ?? []).join('\n')],
    applyToGroup: [false],
  });

  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Pasted image (URL or bitmap, if valid) → manager's login photo → generated initials avatar. */
  logoPreview = computed(() => {
    const value = this.formValue() ?? {};
    const url = (value.logo ?? '').trim();
    if (isImageSrc(url) && !this.imgError()) return url;
    const managerPhoto = this.activeMembers().find((m) => m.uid === value.managerUid)?.photoURL;
    if (managerPhoto && !this.imgError()) return managerPhoto;
    return initialsAvatarDataUri(value.teamName || `Team ${this.seedIndex}`);
  });

  private allTeams = toSignal(this.teamService.streamByTournament(this.data.tournamentId), { initialValue: [] as Team[] });
  private tournamentMatches = toSignal(this.matchService.streamByTournament(this.data.tournamentId), { initialValue: [] as Match[] });

  /** Other players that already have a club list — pick one to copy it into the box. */
  copySourceOptions = computed((): AppSelectOption[] => {
    this.translate.currentLang();
    const others = this.allTeams().filter((t) => t.id !== this.data.team?.id && (t.allowedClubs?.length ?? 0) > 0);
    return [
      { value: '', label: this.translate.instant('TEAM_FORM.COPY_CLUBS_PLACEHOLDER') },
      ...others.map((t) => ({ value: t.id, label: playerLabel(t.teamName, t.manager) })),
    ];
  });

  copyClubsFrom(teamId: string): void {
    const src = this.allTeams().find((t) => t.id === teamId);
    if (src) this.form.controls.allowedClubs.setValue((src.allowedClubs ?? []).join('\n'));
  }

  private parseClubs(text: string): string[] {
    return [...new Set(text.split(/[\n,]/).map((c) => c.trim()).filter(Boolean))];
  }

  /** Clubs this player already played with in saved matches that are no longer in the typed list. */
  orphanClubs = computed((): string[] => {
    const id = this.data.team?.id;
    if (!id) return [];
    const list = new Set(this.parseClubs(this.formValue()?.allowedClubs ?? ''));
    const used = new Set<string>();
    for (const m of this.tournamentMatches()) {
      if (m.homeTeamId === id && m.homeClub) used.add(m.homeClub);
      if (m.awayTeamId === id && m.awayClub) used.add(m.awayClub);
    }
    return [...used].filter((c) => !list.has(c));
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
      // No pasted URL → leave logo null so the list falls back to the manager's login photo.
      const logo = raw.logo.trim() || null;
      const managerUid = raw.managerUid || null;
      const member = this.activeMembers().find((m) => m.uid === managerUid);
      const manager = member?.name ?? '';
      const managerPhotoURL = member?.photoURL ?? null;
      const managerEmail = member?.email?.trim().toLowerCase() || null;

      const id = this.data.team?.id;
      const groupLabel = (raw.groupLabel as 'A' | 'B' | '') || null;
      const allowedClubs = this.parseClubs(raw.allowedClubs);
      if (id) {
        await this.teamService.update(id, { teamName: raw.teamName, manager, managerUid, managerPhotoURL, managerEmail, logo, groupLabel: groupLabel as 'A' | 'B' | null | undefined, clubLabel: null, allowedClubs });
      } else {
        await this.teamService.create({
          tournamentId: this.data.tournamentId,
          teamName: raw.teamName,
          manager,
          managerUid,
          managerPhotoURL,
          managerEmail,
          logo,
          groupLabel: groupLabel as 'A' | 'B' | null | undefined,
          allowedClubs,
        });
      }
      if (this.data.tournamentType === 'team_match' && raw.applyToGroup && groupLabel) {
        const others = this.allTeams().filter((t) => t.id !== id && teamGroup(t) === groupLabel);
        await Promise.all(others.map((t) => this.teamService.update(t.id, { allowedClubs })));
      }
      this.dialogRef.close(true);
    } finally {
      this.isSaving.set(false);
    }
  }
}
