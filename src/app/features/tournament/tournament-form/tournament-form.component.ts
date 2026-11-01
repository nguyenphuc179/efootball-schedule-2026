import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { TournamentService } from '../tournament.service';
import { ImageUrlFieldComponent } from '../../../shared/components/image-url-field/image-url-field.component';
import { IMAGE_SRC_PATTERN, isImageSrc } from '../../../shared/utils/image-url.util';
import { DEFAULT_TEAM_MATCH_RULES, TournamentType, resolveTeamMatchRules } from '../../../models/tournament.model';
import { BANNER_TEMPLATES } from '../banner-templates';
import { MatchService } from '../../fixtures/match.service';
import { TeamService } from '../../teams/team.service';
import { Match } from '../../../models/match.model';
import { Team } from '../../../models/team.model';
import { findRuleViolations, violatingMatchCount } from '../team-match/club-rules.util';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Create/Edit tournament. Presented as a full-screen dialog-equivalent route on mobile
 * (see app.routes.ts — it's a dedicated route rather than a MatDialog so it gets its own
 * back-button/history entry, which mobile users expect for a full "page" of form fields).
 *
 * Banner image is an optional external URL (paste a link from Cloudinary/Imgur/etc.) — the
 * project runs on the Spark plan where Firebase Storage is unavailable, so there's no upload.
 */
@Component({
  selector: 'app-tournament-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDatepickerModule, MatSelectModule, ImageUrlFieldComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button class="w-9 h-9 flex items-center justify-center" (click)="cancel()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ (isEdit() ? 'TOURNAMENT_FORM.EDIT_TITLE' : 'TOURNAMENT_FORM.NEW_TITLE') | translate }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="submit()">
          {{ (isSaving() ? 'COMMON.SAVING' : 'COMMON.SAVE') | translate }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 app-content-area">
        <div class="flex flex-col items-center gap-2">
          <div class="w-full aspect-[4/1] rounded-2xl bg-surface-muted flex items-center justify-center overflow-hidden">
            @if (imagePreview()) {
              <img [src]="imagePreview()" [alt]="'TOURNAMENT_FORM.BANNER_PREVIEW' | translate" class="w-full h-full object-cover" (error)="imgError.set(true)" />
            } @else {
              <span class="material-icons text-4xl text-gray-300">image</span>
            }
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.BANNER_IMAGE' | translate }} <span class="text-gray-400">({{ 'TEAM_FORM.OPTIONAL' | translate }})</span></span>
          <app-image-url-field
            [control]="form.controls.image"
            [maxEdge]="1920"
            [maxBytes]="950000"
            (changed)="imgError.set(false)"
          />
          <span class="text-xs text-gray-400">{{ 'TOURNAMENT_FORM.BANNER_IMAGE_HINT' | translate }}</span>
          @if (form.controls.image.invalid && form.controls.image.value) {
            <span class="text-xs text-red-500">{{ 'TEAM_FORM.LOGO_INVALID' | translate }}</span>
          } @else if (imgError() && form.controls.image.value) {
            <span class="text-xs text-red-500">{{ 'TEAM_FORM.LOGO_LOAD_ERROR' | translate }}</span>
          }
        </label>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.BANNER_TEMPLATES' | translate }}</span>
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
            @for (b of bannerTemplates; track b.src) {
              <button
                type="button"
                class="relative aspect-[4/1] !min-h-0 rounded-lg overflow-hidden border-2 transition-colors"
                [class]="form.controls.image.value === b.src ? 'border-primary-500' : 'border-transparent hover:border-gray-300'"
                [attr.aria-pressed]="form.controls.image.value === b.src"
                (click)="pickBanner(b.src)"
              >
                <img [src]="b.src" alt="" class="w-full h-full object-cover" />
                <span class="absolute left-1.5 bottom-0.5 text-[10px] leading-tight font-bold text-white drop-shadow truncate max-w-[90%]">{{ b.label | translate }}</span>
                @if (form.controls.image.value === b.src) {
                  <span class="absolute right-1 top-1 w-5 h-5 rounded-full bg-primary-500 text-white flex items-center justify-center">
                    <span class="material-icons text-[14px]">check</span>
                  </span>
                }
              </button>
            }
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.NAME' | translate }}</span>
          <input class="input-field" formControlName="name" placeholder="Summer Cup 2026" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.DESCRIPTION' | translate }}</span>
          <textarea class="input-field" rows="3" formControlName="description" [placeholder]="'TOURNAMENT_FORM.DESCRIPTION_PLACEHOLDER' | translate"></textarea>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.LOCATION' | translate }}</span>
          <input class="input-field" formControlName="location" [placeholder]="'TOURNAMENT_FORM.LOCATION_PLACEHOLDER' | translate" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.START_DATE' | translate }}</span>
            <div class="relative">
              <input
                class="input-field !pr-10 cursor-pointer"
                [matDatepicker]="startPicker"
                formControlName="startDate"
                [placeholder]="'TOURNAMENT_FORM.SELECT_DATE' | translate"
                readonly
                (click)="startPicker.open()"
              />
              <mat-datepicker-toggle
                [for]="startPicker"
                class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400"
              ></mat-datepicker-toggle>
              <mat-datepicker #startPicker />
            </div>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.END_DATE' | translate }}</span>
            <div class="relative">
              <input
                class="input-field !pr-10 cursor-pointer"
                [matDatepicker]="endPicker"
                [min]="form.controls.startDate.value"
                formControlName="endDate"
                [placeholder]="'TOURNAMENT_FORM.SELECT_DATE' | translate"
                readonly
                (click)="endPicker.open()"
              />
              <mat-datepicker-toggle
                [for]="endPicker"
                class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400"
              ></mat-datepicker-toggle>
              <mat-datepicker #endPicker />
            </div>
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.NUMBER_OF_TEAMS' | translate }}</span>
          <input class="input-field" type="number" min="2" formControlName="numberOfTeams" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.TYPE' | translate }}</span>
          <mat-select class="input-field !flex items-center" formControlName="type">
            <mat-option value="round_robin">{{ 'TOURNAMENT_TYPE.ROUND_ROBIN' | translate }}</mat-option>
            <mat-option value="knockout">{{ 'TOURNAMENT_TYPE.KNOCKOUT' | translate }}</mat-option>
            <mat-option value="group_knockout">{{ 'TOURNAMENT_TYPE.GROUP_KNOCKOUT' | translate }}</mat-option>
            <mat-option value="team_match">{{ 'TOURNAMENT_TYPE.TEAM_MATCH' | translate }}</mat-option>
          </mat-select>
        </label>

        @if (form.controls.type.value === 'team_match') {
          <fieldset class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
            <legend class="px-1 text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.TEAM_MATCH_RULES' | translate }}</legend>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-1" formControlName="ruleRequireClub" />
              <span>{{ 'TOURNAMENT_FORM.RULE_REQUIRE_CLUB' | translate }}<br /><span class="text-xs text-gray-400">{{ 'TOURNAMENT_FORM.RULE_REQUIRE_CLUB_HINT' | translate }}</span></span>
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-1" formControlName="ruleUniquePerPlayer" />
              <span>{{ 'TOURNAMENT_FORM.RULE_UNIQUE_PER_PLAYER' | translate }}<br /><span class="text-xs text-gray-400">{{ 'TOURNAMENT_FORM.RULE_UNIQUE_PER_PLAYER_HINT' | translate }}</span></span>
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-1" formControlName="ruleNoMirror" />
              <span>{{ 'TOURNAMENT_FORM.RULE_NO_MIRROR' | translate }}<br /><span class="text-xs text-gray-400">{{ 'TOURNAMENT_FORM.RULE_NO_MIRROR_HINT' | translate }}</span></span>
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-1" formControlName="ruleUniquePerGroup" />
              <span>{{ 'TOURNAMENT_FORM.RULE_UNIQUE_PER_GROUP' | translate }}<br /><span class="text-xs text-gray-400">{{ 'TOURNAMENT_FORM.RULE_UNIQUE_PER_GROUP_HINT' | translate }}</span></span>
            </label>
            @if (ruleViolationCount() > 0) {
              <div class="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs px-3 py-2 flex items-start gap-2">
                <span class="material-icons text-[16px] mt-px">warning</span>
                <span>{{ 'TOURNAMENT_FORM.RULE_VIOLATIONS_WARNING' | translate: { count: ruleViolationCount() } }}</span>
              </div>
            }
          </fieldset>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_FORM.FACEBOOK_GROUP' | translate }} <span class="text-gray-400">({{ 'TEAM_FORM.OPTIONAL' | translate }})</span></span>
            <input class="input-field" formControlName="facebookGroupUrl" placeholder="https://www.facebook.com/groups/..." />
            <span class="text-xs text-gray-400">{{ 'TOURNAMENT_FORM.FACEBOOK_GROUP_HINT' | translate }}</span>
            @if (form.controls.facebookGroupUrl.invalid && form.controls.facebookGroupUrl.value) {
              <span class="text-xs text-red-500">{{ 'TOURNAMENT_FORM.FACEBOOK_GROUP_INVALID' | translate }}</span>
            }
          </label>
        }
      </form>

      <div class="sticky bottom-0 p-4 border-t border-gray-100 bg-white/95 backdrop-blur">
        <button class="btn-primary w-full max-w-xl mx-auto block" [disabled]="form.invalid || isSaving()" (click)="submit()">
          {{ (isSaving() ? 'COMMON.SAVING' : isEdit() ? 'TOURNAMENT_FORM.SAVE_CHANGES' : 'TOURNAMENT_FORM.CREATE') | translate }}
        </button>
      </div>
    </div>
  `,
})
export class TournamentFormComponent {
  private fb = inject(FormBuilder);
  private tournamentService = inject(TournamentService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isSaving = signal(false);
  imgError = signal(false);
  private editingId = this.route.snapshot.paramMap.get('id');
  isEdit = signal(!!this.editingId);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    image: ['', Validators.pattern(IMAGE_SRC_PATTERN)],
    location: ['', Validators.required],
    startDate: new FormControl<Date | null>(null, Validators.required),
    endDate: new FormControl<Date | null>(null, Validators.required),
    numberOfTeams: [8, [Validators.required, Validators.min(2)]],
    type: ['round_robin' as TournamentType, Validators.required],
    facebookGroupUrl: ['', Validators.pattern(/^https?:\/\/.+/i)],
    ruleRequireClub: [DEFAULT_TEAM_MATCH_RULES.requireClub],
    ruleUniquePerPlayer: [DEFAULT_TEAM_MATCH_RULES.uniquePerPlayer],
    ruleNoMirror: [DEFAULT_TEAM_MATCH_RULES.noMirror],
    ruleUniquePerGroup: [DEFAULT_TEAM_MATCH_RULES.uniquePerGroup],
  });

  private matchService = inject(MatchService);
  private teamService = inject(TeamService);
  private savedMatches = signal<Match[]>([]);
  private savedTeams = signal<Team[]>([]);
  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Matches already saved that would break the rules as currently ticked (editing only). */
  ruleViolationCount = computed(() => {
    const v = this.formValue();
    const rules = {
      requireClub: !!v.ruleRequireClub,
      uniquePerPlayer: !!v.ruleUniquePerPlayer,
      noMirror: !!v.ruleNoMirror,
      uniquePerGroup: !!v.ruleUniquePerGroup,
    };
    return violatingMatchCount(findRuleViolations(this.savedMatches(), this.savedTeams(), rules));
  });

  readonly bannerTemplates = BANNER_TEMPLATES;

  /** Tick a ready-made banner; tick it again to clear. */
  pickBanner(src: string): void {
    const ctrl = this.form.controls.image;
    ctrl.setValue(ctrl.value === src ? '' : src);
    ctrl.markAsDirty();
    this.imgError.set(false);
  }

  /** Live preview: only show a valid-looking image src that hasn't failed to load. */
  imagePreview = signal<string | null>(null);

  constructor() {
    this.form.controls.image.valueChanges.pipe(takeUntilDestroyed()).subscribe((url) => {
      this.imagePreview.set(isImageSrc(url) ? url : null);
    });

    if (this.editingId) {
      this.tournamentService.getOnce(this.editingId).then((t) => {
        if (!t) return;
        this.form.patchValue({
          name: t.name,
          description: t.description,
          image: t.image ?? '',
          location: t.location,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          numberOfTeams: t.numberOfTeams,
          type: t.type,
          facebookGroupUrl: t.facebookGroupUrl ?? '',
          ruleRequireClub: resolveTeamMatchRules(t).requireClub,
          ruleUniquePerPlayer: resolveTeamMatchRules(t).uniquePerPlayer,
          ruleNoMirror: resolveTeamMatchRules(t).noMirror,
          ruleUniquePerGroup: resolveTeamMatchRules(t).uniquePerGroup,
        });
        if (t.type === 'team_match') {
          Promise.all([
            this.matchService.getByTournamentOnce(t.id),
            this.teamService.getByTournamentOnce(t.id),
          ]).then(([matches, teams]) => {
            this.savedMatches.set(matches);
            this.savedTeams.set(teams);
          });
        }
      });
    }
  }

  cancel(): void {
    this.router.navigateByUrl(this.editingId ? `/tournaments/${this.editingId}` : '/tournaments');
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const raw = this.form.getRawValue();
      const draft = {
        name: raw.name,
        description: raw.description,
        location: raw.location,
        startDate: raw.startDate!.getTime(),
        endDate: raw.endDate!.getTime(),
        numberOfTeams: Number(raw.numberOfTeams),
        type: raw.type,
        image: raw.image.trim() || null,
        facebookGroupUrl: raw.type === 'team_match' ? raw.facebookGroupUrl.trim() || null : null,
        teamMatchRules:
          raw.type === 'team_match'
            ? {
                requireClub: raw.ruleRequireClub,
                uniquePerPlayer: raw.ruleUniquePerPlayer,
                noMirror: raw.ruleNoMirror,
                uniquePerGroup: raw.ruleUniquePerGroup,
              }
            : null,
      };

      const id = this.editingId ?? (await this.tournamentService.create(draft));
      if (this.editingId) {
        await this.tournamentService.update(id, draft);
      }
      this.router.navigateByUrl(`/tournaments/${id}`);
    } finally {
      this.isSaving.set(false);
    }
  }
}
