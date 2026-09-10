import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ChampionService } from './champion.service';
import { TournamentService } from '../tournament/tournament.service';
import { ImageUrlFieldComponent } from '../../shared/components/image-url-field/image-url-field.component';
import { IMAGE_SRC_PATTERN, isImageSrc } from '../../shared/utils/image-url.util';
import { Champion } from '../../models/champion.model';

export interface ChampionFormDialogData {
  champion?: Champion;
  nextSeason?: number;
}

/** Add / edit a Hall of Fame champion. Poster is an external image URL (Spark plan — no upload). */
@Component({
  selector: 'app-champion-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, ImageUrlFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-dvh w-full flex flex-col bg-white">
      <div class="flex items-center justify-between h-14 px-4 border-b border-gray-100">
        <button class="w-9 h-9 flex items-center justify-center" (click)="dialogRef.close()">
          <span class="material-icons">close</span>
        </button>
        <h1 class="font-bold">{{ data.champion ? 'Edit Champion' : 'Add Champion' }}</h1>
        <button class="text-primary-600 font-semibold disabled:text-gray-300" [disabled]="form.invalid || isSaving()" (click)="save()">
          {{ isSaving() ? 'Saving…' : 'Save' }}
        </button>
      </div>

      <form [formGroup]="form" class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="flex flex-col items-center gap-2">
          <div class="w-40 h-40 rounded-2xl bg-surface-muted flex items-center justify-center overflow-hidden">
            @if (preview()) {
              <img [src]="preview()" alt="Champion poster" class="w-full h-full object-cover" (error)="imgError.set(true)" />
            } @else {
              <span class="material-icons text-5xl text-gray-300">emoji_events</span>
            }
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Poster image</span>
          <app-image-url-field [control]="form.controls.imageUrl" (changed)="imgError.set(false)" />
          @if (form.controls.imageUrl.invalid && form.controls.imageUrl.value) {
            <span class="text-xs text-red-500">Paste an image link (http/https) or a copied image.</span>
          } @else if (imgError() && form.controls.imageUrl.value) {
            <span class="text-xs text-red-500">That image couldn't be loaded — check the link.</span>
          }
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">Season</span>
            <input class="input-field" type="number" min="1" formControlName="season" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">Club</span>
            <input class="input-field" formControlName="club" placeholder="Netherland" />
          </label>
        </div>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Player name</span>
          <input class="input-field" formControlName="playerName" placeholder="LÊ TÙNG DƯƠNG" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">Tournament <span class="text-gray-400">(optional)</span></span>
          <select class="input-field" formControlName="tournamentId">
            <option value="">— None —</option>
            @for (t of tournaments(); track t.id) {
              <option [value]="t.id">{{ t.name }}</option>
            }
          </select>
        </label>
      </form>
    </div>
  `,
})
export class ChampionFormComponent {
  private fb = inject(FormBuilder);
  private championService = inject(ChampionService);
  private tournamentService = inject(TournamentService);

  isSaving = signal(false);
  imgError = signal(false);

  tournaments = this.tournamentService.all;

  form = this.fb.nonNullable.group({
    season: [this.data.champion?.season ?? this.data.nextSeason ?? 1, [Validators.required, Validators.min(1)]],
    playerName: [this.data.champion?.playerName ?? '', Validators.required],
    club: [this.data.champion?.club ?? '', Validators.required],
    imageUrl: [this.data.champion?.imageUrl ?? '', [Validators.required, Validators.pattern(IMAGE_SRC_PATTERN)]],
    tournamentId: [this.data.champion?.tournamentId ?? ''],
  });

  private value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  preview = computed(() => {
    const url = (this.value()?.imageUrl ?? '').trim();
    return isImageSrc(url) && !this.imgError() ? url : null;
  });

  constructor(
    public dialogRef: MatDialogRef<ChampionFormComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: ChampionFormDialogData
  ) {}

  async save(): Promise<void> {
    if (this.form.invalid) return;
    this.isSaving.set(true);
    try {
      const raw = this.form.getRawValue();
      const draft = {
        season: Number(raw.season),
        playerName: raw.playerName.trim(),
        club: raw.club.trim(),
        imageUrl: raw.imageUrl.trim(),
        tournamentId: raw.tournamentId || null,
      };
      if (this.data.champion) {
        await this.championService.update(this.data.champion.id, draft);
      } else {
        await this.championService.create(draft);
      }
      this.dialogRef.close(true);
    } finally {
      this.isSaving.set(false);
    }
  }
}
