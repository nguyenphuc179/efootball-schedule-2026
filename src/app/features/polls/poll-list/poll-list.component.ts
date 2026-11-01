import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PollService } from '../poll.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { timeAgoKey } from '../../../shared/utils/time-ago.util';

/** Every poll, newest first — the entry point is a link (Home card / desktop sidenav), not the
 *  fixed 5-icon mobile bottom nav. Anyone signed in can view and vote; only an admin can create
 *  or delete a poll (enforced server-side by firestore.rules, not just hidden here). */
@Component({
  selector: 'app-poll-list',
  standalone: true,
  imports: [CommonModule, RouterLink, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-extrabold">{{ 'POLLS.TITLE' | translate }}</h1>
        @if (auth.isAdmin()) {
          <a routerLink="/polls/create" class="btn-primary !py-2 !px-3 text-sm flex items-center gap-1">
            <span class="material-icons text-[18px]">add</span> {{ 'TOURNAMENT_LIST.NEW' | translate }}
          </a>
        }
      </div>

      @if (polls().length === 0) {
        <app-empty-state icon="how_to_vote" [title]="'POLLS.EMPTY_TITLE' | translate" [subtitle]="'POLLS.EMPTY_SUBTITLE' | translate" />
      } @else {
        <div class="flex flex-col gap-2">
          @for (p of polls(); track p.id) {
            <a [routerLink]="['/polls', p.id]" class="card flex items-center gap-3 no-underline text-inherit">
              <span class="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                <span class="material-icons text-[20px]">how_to_vote</span>
              </span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm line-clamp-2">{{ p.title }}</div>
                <div class="text-xs text-gray-400 truncate mt-0.5">
                  {{ 'POLLS.CREATED_BY' | translate: { name: p.createdByName } }} · {{ timeAgo(p.createdDate) }}
                </div>
                @if (voteInfo().get(p.id); as v) {
                  <div class="flex items-center gap-2 mt-1.5">
                    <span
                      class="badge inline-flex items-center gap-1 !text-[11px]"
                      [class]="v.mine ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'"
                    >
                      <span class="material-icons text-[13px]">{{ v.mine ? 'check_circle' : 'radio_button_unchecked' }}</span>
                      {{ (v.mine ? 'POLLS.VOTED' : 'POLLS.NOT_VOTED') | translate }}
                    </span>
                    <span class="text-[11px] text-gray-400">{{ 'POLLS.VOTE_COUNT' | translate: { count: v.count } }}</span>
                  </div>
                }
              </div>
              <span class="material-icons text-gray-300 shrink-0">chevron_right</span>
            </a>
          }
        </div>
      }
    </div>
  `,
})
export class PollListComponent {
  private pollService = inject(PollService);
  private translate = inject(TranslateService);
  auth = inject(AuthService);

  polls = this.pollService.allResolved;

  private pollIdsKey = computed(() => this.polls().map((p) => p.id).join('|'));

  /** pollId -> { total votes, whether the viewer has voted } — live, so a fresh vote shows up
   *  in the list without a reload. A vote doc's id is always the voter's uid. */
  voteInfo = toSignal(
    toObservable(this.pollIdsKey).pipe(
      distinctUntilChanged(),
      switchMap((key) => {
        const ids = key ? key.split('|') : [];
        if (!ids.length) return of(new Map<string, { count: number; mine: boolean }>());
        return combineLatest(ids.map((id) => this.pollService.streamVotes(id))).pipe(
          map((all) => {
            const uid = this.auth.firebaseUser()?.uid;
            return new Map(ids.map((id, i) => [id, { count: all[i].length, mine: !!uid && all[i].some((v) => v.id === uid) }]));
          })
        );
      })
    ),
    { initialValue: new Map<string, { count: number; mine: boolean }>() }
  );

  timeAgo(ms: number): string {
    this.translate.currentLang();
    const { key, params } = timeAgoKey(ms);
    return this.translate.instant(key, params);
  }
}
