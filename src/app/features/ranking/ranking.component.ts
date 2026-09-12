import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { ManagerRank, RankingService } from "./ranking.service";

import { AuthService } from "../../core/services/auth.service";
import { BreakpointObserver } from "@angular/cdk/layout";
import { EmptyStateComponent } from "../../shared/components/empty-state/empty-state.component";
import { ManagerImageFormComponent } from "./manager-image-form.component";
import { ManagerImageService } from "./manager-image.service";
import { MatDialog } from "@angular/material/dialog";
import { initialsAvatar } from "../../shared/utils/avatar.util";
import { TranslatePipe } from "@ngx-translate/core";

interface PodiumSlot {
  place: 1 | 2 | 3;
  p: ManagerRank;
}

/** All-time manager ranking: a gold/silver/bronze podium, then a list for the rest. */
@Component({
  selector: "app-ranking",
  standalone: true,
  imports: [EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-6 max-w-4xl mx-auto">
      <header class="mb-8">
        <div class="flex items-center gap-2.5">
          <span
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center shadow-[0_6px_16px_-6px_rgba(15,168,99,0.7)]"
          >
            <span class="material-icons text-[22px]">leaderboard</span>
          </span>
          <h1 class="text-3xl font-black tracking-tight">{{ 'NAV.RANKING' | translate }}</h1>
        </div>
      </header>

      @if (ranking().length === 0) {
        <app-empty-state
          icon="leaderboard"
          [title]="'RANKING.EMPTY_TITLE' | translate"
          [subtitle]="'RANKING.EMPTY_SUBTITLE' | translate"
        />
      } @else {
        <!-- Podium -->
        <div
          class="flex flex-wrap justify-center items-end gap-4 sm:gap-6 mb-10"
        >
          @for (s of podiumSlots(); track s.place) {
            <div
              class="w-[44%] sm:w-56 rounded-2xl overflow-hidden bg-surface-muted border relative"
              [class]="
                s.place === 1
                  ? 'sm:w-64 sm:-translate-y-4 border-amber-400/50 ring-2 ring-amber-400/60 shadow-[0_0_44px_-10px_rgba(245,166,35,0.55)]'
                  : 'border-gray-100'
              "
            >
              <div
                class="relative"
                [class]="s.place === 1 ? 'aspect-[4/5]' : 'aspect-square'"
              >
                @if (image(s.p); as url) {
                  <img
                    [src]="url"
                    [alt]="s.p.manager"
                    class="w-full h-full object-cover"
                    referrerpolicy="no-referrer"
                  />
                } @else {
                  <div class="w-full h-full flex items-center justify-center">
                    <span
                      class="rounded-full flex items-center justify-center font-bold"
                      [class]="
                        s.place === 1
                          ? 'w-24 h-24 text-2xl'
                          : 'w-16 h-16 text-base'
                      "
                      [style.background-color]="avatar(s.p).bg"
                      [style.color]="avatar(s.p).fg"
                      >{{ avatar(s.p).initials }}</span
                    >
                  </div>
                }

                <span
                  class="absolute top-2 left-2 flex items-center justify-center rounded-full font-black text-white bg-gradient-to-br ring-2 ring-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
                  [class]="medalClass(s.place)"
                  >{{ s.place }}</span
                >

                <span
                  class="absolute bottom-2 right-2 bg-black/55 text-white text-[11px] font-bold rounded-full px-2 py-0.5"
                >
                  {{ s.p.points }} {{ 'STANDINGS.PTS_ABBR' | translate }}
                </span>

                @if (auth.isAdmin()) {
                  <button
                    class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 text-white flex items-center justify-center"
                    (click)="editImage(s.p)"
                    [attr.aria-label]="'RANKING.SET_PORTRAIT' | translate"
                  >
                    <span class="material-icons text-[14px]">edit</span>
                  </button>
                }
              </div>

              <div
                class="px-3 py-2.5 text-center text-white"
                [class]="
                  s.place === 1
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                    : 'bg-primary-600'
                "
              >
                <div class="font-extrabold uppercase text-sm truncate">
                  {{ s.p.manager }}
                </div>
                @if (auth.isAdmin() && s.p.email) {
                  <div class="text-[10px] text-white/70 truncate">{{ s.p.email }}</div>
                }
                <div class="text-[11px] text-white/85">
                  {{ s.p.wins }}-{{ s.p.draws }}-{{ s.p.losses
                  }}{{ s.place === 1 ? " · " + ('RANKING.TEAM_COUNT' | translate: { count: s.p.teamCount }) : "" }}
                </div>
              </div>
            </div>
          }
        </div>

        <!-- The rest -->
        @if (rest().length) {
          <div class="card !p-0 overflow-hidden">
            @for (p of rest(); track p.manager; let i = $index) {
              <div
                class="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
              >
                <span
                  class="w-7 text-center text-sm font-extrabold text-gray-300 shrink-0"
                  >{{ i + 4 }}</span
                >
                <span
                  class="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold"
                  [style.background-color]="avatar(p).bg"
                  [style.color]="avatar(p).fg"
                >
                  @if (image(p); as url) {
                    <img
                      [src]="url"
                      alt=""
                      class="w-full h-full object-cover"
                      referrerpolicy="no-referrer"
                    />
                  } @else {
                    {{ avatar(p).initials }}
                  }
                </span>
                <div class="flex-1 min-w-0">
                  <div class="font-semibold text-sm truncate">
                    {{ p.manager }}
                  </div>
                  @if (auth.isAdmin() && p.email) {
                    <div class="text-xs text-gray-400 truncate">{{ p.email }}</div>
                  }
                  <div class="text-xs text-gray-400">
                    {{ p.wins }}-{{ p.draws }}-{{ p.losses }} ·
                    {{ 'RANKING.PLAYED_COUNT' | translate: { count: p.played } }}
                  </div>
                </div>
                @if (auth.isAdmin()) {
                  <button
                    class="w-8 h-8 flex items-center justify-center text-gray-400 shrink-0"
                    (click)="editImage(p)"
                    [attr.aria-label]="'RANKING.SET_PORTRAIT' | translate"
                  >
                    <span class="material-icons text-[18px]">image</span>
                  </button>
                }
                <span class="text-right shrink-0 leading-none">
                  <span class="font-black text-base">{{ p.points }}</span>
                  <span
                    class="block text-[10px] text-gray-400 uppercase tracking-wide"
                    >{{ 'STANDINGS.PTS_ABBR' | translate }}</span
                  >
                </span>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class RankingComponent {
  private rankingService = inject(RankingService);
  private images = inject(ManagerImageService);
  private dialog = inject(MatDialog);
  private breakpoints = inject(BreakpointObserver);
  auth = inject(AuthService);

  ranking = this.rankingService.ranking;

  /** Top 3 in visual podium order: silver (left), gold (centre), bronze (right). */
  podiumSlots = computed<PodiumSlot[]>(() => {
    const r = this.ranking();
    return ([2, 1, 3] as const)
      .map((place) => ({ place, p: r[place - 1] }))
      .filter((s): s is PodiumSlot => !!s.p);
  });

  rest = computed(() => this.ranking().slice(3));

  medalClass(place: 1 | 2 | 3): string {
    if (place === 1) return "w-8 h-8 text-sm from-amber-300 to-amber-500";
    if (place === 2) return "w-7 h-7 text-xs from-slate-200 to-slate-400";
    return "w-7 h-7 text-xs from-orange-300 to-orange-500";
  }

  avatar(r: ManagerRank) {
    return initialsAvatar(r.manager);
  }

  image(r: ManagerRank): string | undefined {
    return this.images.byManager().get(r.manager);
  }

  editImage(r: ManagerRank): void {
    const isMobile = this.breakpoints.isMatched("(max-width: 767px)");
    this.dialog.open(ManagerImageFormComponent, {
      data: { manager: r.manager, current: this.image(r) },
      width: isMobile ? "100vw" : "440px",
      height: isMobile ? "100dvh" : "auto",
      maxWidth: "100vw",
    });
  }
}
