import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TeamService } from '../../teams/team.service';
import { TournamentService } from '../tournament.service';
import { AppSelectComponent, AppSelectOption } from '../../../shared/components/app-select/app-select.component';
import { Team } from '../../../models/team.model';

interface ManagerOption {
  uid: string;
  name: string;
}

/**
 * Admin-only "Phân quyền" tab. Lets an admin designate ONE of this tournament's team managers to
 * click every fixture/bracket "Generate" button themselves (Group Stage, round-robin Fixtures,
 * Final Stage bracket) — purely additive to the admin's own permission, so this exists only for
 * visible transparency around the draw (e.g. a neutral manager clicks it live while others watch),
 * not to lock admin out. See `Tournament.fixtureGeneratorUid` and `TournamentDetailComponent`'s
 * `canGenerateFixtures`, which every generate-button-bearing tab reads.
 */
@Component({
  selector: 'app-tournament-permissions',
  standalone: true,
  imports: [AppSelectComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 max-w-md">
      @if (managers().length === 0) {
        <p class="text-sm text-gray-400">{{ 'TOURNAMENT_PERMISSIONS.NO_MANAGERS' | translate }}</p>
      } @else {
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'TOURNAMENT_PERMISSIONS.SELECT_LABEL' | translate }}</span>
          <app-select
            [options]="selectOptions()"
            [value]="selectedUid() ?? ''"
            [disabled]="saving()"
            (valueChange)="save($event || null)"
          />
        </label>
        @if (selectedUid()) {
          <p class="text-xs text-gray-400">{{ 'TOURNAMENT_PERMISSIONS.ACTIVE_HINT' | translate: { name: selectedName() } }}</p>
        }
      }

      @if (errorMsg()) {
        <p class="text-xs text-accent-red">{{ errorMsg() }}</p>
      }
    </div>
  `,
})
export class TournamentPermissionsComponent {
  tournamentId = input.required<string>();

  private teamService = inject(TeamService);
  private tournamentService = inject(TournamentService);
  private translate = inject(TranslateService);

  private teams = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.teamService.streamByTournament(id))),
    { initialValue: [] as Team[] }
  );

  managers = computed<ManagerOption[]>(() => {
    const seen = new Set<string>();
    const list: ManagerOption[] = [];
    for (const t of this.teams()) {
      if (!t.managerUid || seen.has(t.managerUid)) continue;
      seen.add(t.managerUid);
      list.push({ uid: t.managerUid, name: t.manager?.trim() || t.teamName });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  });

  private tournament = toSignal(
    toObservable(this.tournamentId).pipe(switchMap((id) => this.tournamentService.streamOne(id)))
  );

  selectedUid = computed(() => this.tournament()?.fixtureGeneratorUid ?? null);
  selectedName = computed(() => this.managers().find((m) => m.uid === this.selectedUid())?.name ?? '');

  /** A plain method (not `computed`) so `translate.instant()` re-runs on every check and stays in
   *  the current language — this template also uses the `translate` pipe elsewhere, which marks
   *  this OnPush component dirty on a language switch. */
  selectOptions(): AppSelectOption[] {
    return [
      { value: '', label: this.translate.instant('TOURNAMENT_PERMISSIONS.NONE_OPTION') },
      ...this.managers().map((m) => ({ value: m.uid, label: m.name })),
    ];
  }

  saving = signal(false);
  errorMsg = signal('');

  async save(uid: string | null): Promise<void> {
    this.saving.set(true);
    this.errorMsg.set('');
    try {
      await this.tournamentService.update(this.tournamentId(), { fixtureGeneratorUid: uid });
    } catch (err) {
      console.error('[TournamentPermissions] update', err);
      this.errorMsg.set(this.translate.instant('TOURNAMENT_PERMISSIONS.SAVE_FAILED'));
    } finally {
      this.saving.set(false);
    }
  }
}
