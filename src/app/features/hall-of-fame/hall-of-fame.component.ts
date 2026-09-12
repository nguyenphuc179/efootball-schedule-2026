import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";

import { AuthService } from "../../core/services/auth.service";
import { BreakpointObserver } from "@angular/cdk/layout";
import { Champion } from "../../models/champion.model";
import { ChampionFormComponent } from "./champion-form.component";
import { ChampionService } from "./champion.service";
import { CommonModule } from "@angular/common";
import { ConfirmDialogComponent } from "../../shared/components/confirm-dialog/confirm-dialog.component";
import { EmptyStateComponent } from "../../shared/components/empty-state/empty-state.component";
import { MatDialog } from "@angular/material/dialog";
import { TranslatePipe, TranslateService } from "@ngx-translate/core";

/** Public "Hall of Fame": every season's champion, latest featured on top. Admins manage entries inline. */
@Component({
  selector: "app-hall-of-fame",
  standalone: true,
  imports: [CommonModule, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-6 max-w-5xl mx-auto">
      <header class="flex flex-wrap items-start justify-between gap-3 mb-8">
        <div>
          <div class="flex items-center gap-2.5">
            <span
              class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-white flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(245,166,35,0.7)]"
            >
              <span class="material-icons text-[22px]">emoji_events</span>
            </span>
            <h1 class="text-3xl font-black tracking-tight">{{ 'NAV.FAME_FULL' | translate }}</h1>
          </div>
        </div>
        @if (auth.isAdmin()) {
          <button
            class="btn-primary !py-2.5 !px-5 text-sm flex items-center gap-1.5 shrink-0"
            (click)="openForm()"
          >
            <span class="material-icons text-[18px]">add</span> {{ 'HALL_OF_FAME.ADD_CHAMPION' | translate }}
          </button>
        }
      </header>

      @if (champions().length === 0) {
        <app-empty-state
          icon="emoji_events"
          [title]="'HALL_OF_FAME.EMPTY_TITLE' | translate"
          [subtitle]="'HALL_OF_FAME.EMPTY_SUBTITLE' | translate"
        />
      } @else {
        @if (featured(); as f) {
          <div
            class="relative -mx-4 px-4 mb-12 py-8 flex flex-col items-center text-center overflow-hidden"
          >
            <!-- radial glow behind the featured champion -->
            <div
              class="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(245,166,35,0.22),transparent_60%)]"
            ></div>

            <span
              class="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-500 mb-4"
            >
              <span class="material-icons text-[16px]">emoji_events</span>
              {{ 'HALL_OF_FAME.REIGNING_CHAMPION' | translate }}
            </span>

            <div
              class="relative rounded-[1.75rem] p-[3px] bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-[0_0_50px_-10px_rgba(245,166,35,0.55)]"
            >
              <div
                class="relative w-72 sm:w-80 max-w-full aspect-square rounded-[1.6rem] overflow-hidden bg-surface-muted"
              >
                <img
                  [src]="f.imageUrl"
                  [alt]="f.playerName"
                  class="w-full h-full object-cover"
                  referrerpolicy="no-referrer"
                />
                <span
                  class="absolute top-3 left-3 text-3xl font-black text-white/90 drop-shadow"
                  >#1</span
                >
                @if (auth.isAdmin()) {
                  <div class="absolute top-2 right-2 flex gap-1">
                    <button
                      class="w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center"
                      (click)="openForm(f)"
                    >
                      <span class="material-icons text-[16px]">edit</span>
                    </button>
                    <button
                      class="w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center"
                      (click)="remove(f)"
                    >
                      <span class="material-icons text-[16px]"
                        >delete_outline</span
                      >
                    </button>
                  </div>
                }
              </div>
            </div>

            <div
              class="mt-5 text-2xl sm:text-3xl font-black uppercase tracking-tight"
            >
              {{ f.playerName }}
            </div>
            <div
              class="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm"
            >
              <span
                class="inline-flex items-center rounded-full bg-amber-50 text-amber-700 font-bold px-2.5 py-0.5"
                >{{ 'HALL_OF_FAME.SEASON' | translate: { season: f.season } }}</span
              >
              <span
                class="inline-flex items-center rounded-full bg-primary-50 text-primary-700 font-bold px-2.5 py-0.5"
                >{{ 'HALL_OF_FAME.CLUB' | translate: { club: f.club } }}</span
              >
            </div>
          </div>
        }

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
          @for (c of rest(); track c.id) {
            <div class="flex flex-col text-center">
              <div
                class="relative aspect-square rounded-xl overflow-hidden bg-surface-muted"
              >
                <img
                  [src]="c.imageUrl"
                  [alt]="c.playerName"
                  class="w-full h-full object-cover"
                  referrerpolicy="no-referrer"
                />
                @if (auth.isAdmin()) {
                  <div class="absolute top-1.5 right-1.5 flex gap-1">
                    <button
                      class="w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center"
                      (click)="openForm(c)"
                    >
                      <span class="material-icons text-[14px]">edit</span>
                    </button>
                    <button
                      class="w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center"
                      (click)="remove(c)"
                    >
                      <span class="material-icons text-[14px]"
                        >delete_outline</span
                      >
                    </button>
                  </div>
                }
              </div>
              <div
                class="mt-2.5 font-extrabold text-sm uppercase leading-tight"
              >
                {{ c.playerName }}
              </div>
              <div class="mt-1.5 flex flex-col items-center gap-1">
                <span
                  class="inline-flex items-center rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] px-2 py-0.5"
                >
                  {{ 'HALL_OF_FAME.SEASON' | translate: { season: c.season } }}
                </span>
                <span
                  class="inline-flex items-center rounded-full bg-primary-50 text-primary-700 font-bold text-[11px] px-2 py-0.5"
                >
                  {{ 'HALL_OF_FAME.CLUB' | translate: { club: c.club } }}
                </span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class HallOfFameComponent {
  private championService = inject(ChampionService);
  private dialog = inject(MatDialog);
  private breakpoints = inject(BreakpointObserver);
  private translate = inject(TranslateService);
  auth = inject(AuthService);

  champions = this.championService.all;
  featured = computed(() => this.champions()[0] ?? null);
  rest = computed(() => this.champions().slice(1));

  private nextSeason(): number {
    const seasons = this.champions()
      .map((c) => c.season)
      .filter((n) => Number.isFinite(n));
    return (seasons.length ? Math.max(...seasons) : 0) + 1;
  }

  openForm(champion?: Champion): void {
    const isMobile = this.breakpoints.isMatched("(max-width: 767px)");
    this.dialog.open(ChampionFormComponent, {
      data: { champion, nextSeason: this.nextSeason() },
      width: isMobile ? "100vw" : "480px",
      height: isMobile ? "100dvh" : "auto",
      maxWidth: "100vw",
    });
  }

  async remove(champion: Champion): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant("HALL_OF_FAME.REMOVE_CONFIRM_TITLE"),
        message: this.translate.instant("HALL_OF_FAME.REMOVE_CONFIRM_MESSAGE", {
          season: champion.season,
          name: champion.playerName,
        }),
        destructive: true,
        confirmLabel: this.translate.instant("COMMON.REMOVE"),
      },
      width: "90vw",
      maxWidth: "400px",
    });
    if (await ref.afterClosed().toPromise()) {
      await this.championService.remove(champion.id);
    }
  }
}
