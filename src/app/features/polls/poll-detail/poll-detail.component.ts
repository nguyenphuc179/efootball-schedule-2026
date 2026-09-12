import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PollService } from '../poll.service';
import { AuthService } from '../../../core/services/auth.service';
import { FirestoreBaseService } from '../../../core/services/firestore-base.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PollVote } from '../../../models/poll.model';
import { AppUser, userDisplayName } from '../../../models/user.model';
import { timeAgoKey } from '../../../shared/utils/time-ago.util';
import { liveUserProfiles, uidsKey } from '../../../shared/utils/live-user-profiles.util';

const CHART_COLORS = ['#0fa863', '#3b82f6', '#f5a623', '#e5484d', '#8b5cf6', '#14b8a6', '#f472b6', '#64748b'];

/** Vote / results for one poll — a single vote per account, enforced by firestore.rules
 *  (the vote doc's id is the voter's own uid and can never be updated once created). */
@Component({
  selector: 'app-poll-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingSpinnerComponent, BaseChartDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      @if (!poll()) {
        <app-loading-spinner [label]="'POLLS.LOADING' | translate" />
      } @else {
        <a routerLink="/polls" class="text-sm text-gray-400 flex items-center gap-1 mb-3 no-underline">
          <span class="material-icons text-[16px]">arrow_back</span> {{ 'POLLS.BACK_TO_LIST' | translate }}
        </a>

        <div class="card">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h1 class="text-lg font-extrabold">{{ poll()!.title }}</h1>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ 'POLLS.CREATED_BY' | translate: { name: poll()!.createdByName } }} · {{ timeAgo(poll()!.createdDate) }}
              </p>
            </div>
            @if (canDelete()) {
              <button
                class="w-8 h-8 flex items-center justify-center text-gray-400 shrink-0"
                (click)="remove()"
                [attr.aria-label]="'COMMON.DELETE' | translate"
              >
                <span class="material-icons text-[18px]">delete_outline</span>
              </button>
            }
          </div>

          @if (!showResults()) {
            <div class="flex flex-col gap-2 mt-4">
              @for (opt of poll()!.options; track $index; let i = $index) {
                <label
                  class="flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer"
                  [class]="selected().has(i) ? 'border-primary-500 bg-primary-50' : 'border-gray-200'"
                >
                  <input
                    [type]="poll()!.allowMultiple ? 'checkbox' : 'radio'"
                    name="pollOption"
                    class="w-4 h-4 accent-primary-600 shrink-0"
                    [checked]="selected().has(i)"
                    (change)="toggleOption(i)"
                  />
                  <span class="text-sm flex-1">{{ opt }}</span>
                </label>
              }
            </div>

            @if (errorMsg()) {
              <p class="text-xs text-accent-red mt-2">{{ errorMsg() }}</p>
            }

            <div class="flex items-center gap-2 mt-4">
              <button
                class="btn-primary flex-1 flex items-center justify-center gap-1"
                [disabled]="!selected().size || isVoting()"
                (click)="submitVote()"
              >
                {{ (isVoting() ? 'COMMON.SAVING' : 'POLLS.VOTE') | translate }}
                <span class="material-icons text-[18px]">arrow_forward</span>
              </button>
              <button class="btn-secondary !py-2 !px-3 text-sm flex items-center gap-1 shrink-0" (click)="showResultsPreview.set(true)">
                <span class="material-icons text-[18px]">bar_chart</span>
                {{ 'POLLS.SHOW_RESULTS' | translate }}
              </button>
            </div>
          } @else {
            <div class="flex flex-col gap-3 mt-4">
              @for (r of results(); track $index) {
                <div>
                  <div class="flex items-start justify-between text-sm mb-1 gap-2">
                    <span class="font-medium">{{ r.label }}</span>
                    <span class="text-gray-400 shrink-0 whitespace-nowrap">{{ r.pct }}% ({{ r.count }})</span>
                  </div>
                  <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div class="h-full bg-primary-500" [style.width.%]="r.pct"></div>
                  </div>
                  @if (r.voters.length) {
                    <p class="text-[11px] text-gray-400 mt-1">{{ r.voters.join(', ') }}</p>
                  }
                </div>
              }
            </div>

            <p class="text-xs text-gray-400 mt-3">{{ 'POLLS.TOTAL_VOTES' | translate: { count: totalVoters() } }}</p>

            @if (totalVoters() > 0) {
              <div class="h-52 mt-4">
                <canvas baseChart [data]="doughnutData()" type="doughnut" [options]="doughnutOptions"></canvas>
              </div>
            }

            @if (!hasVoted()) {
              <button
                class="btn-secondary w-full mt-4 flex items-center justify-center gap-1"
                (click)="showResultsPreview.set(false)"
              >
                <span class="material-icons text-[18px]">arrow_back</span> {{ 'POLLS.BACK_TO_POLL' | translate }}
              </button>
            }
          }
        </div>

        <button class="btn-secondary w-full mt-3 flex items-center justify-center gap-2" (click)="share()">
          <span class="material-icons text-[18px]">{{ shareCopied() ? 'check' : 'share' }}</span>
          {{ (shareCopied() ? 'COMMON.LINK_COPIED' : 'COMMON.SHARE') | translate }}
        </button>

        @if (shareLinkVisible(); as link) {
          <div class="mt-2 flex items-center gap-2">
            <input
              #shareLinkInput
              readonly
              class="input-field flex-1 text-xs"
              [value]="link"
              (click)="shareLinkInput.select()"
            />
            <button
              type="button"
              class="w-9 h-9 flex items-center justify-center text-gray-400 shrink-0"
              (click)="shareLinkVisible.set(null)"
              [attr.aria-label]="'COMMON.CLOSE' | translate"
            >
              <span class="material-icons text-[18px]">close</span>
            </button>
          </div>
          <p class="text-[11px] text-gray-400 mt-1">{{ 'COMMON.SHARE_MANUAL_HINT' | translate }}</p>
        }
      }
    </div>
  `,
})
export class PollDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pollService = inject(PollService);
  private fs = inject(FirestoreBaseService);
  private dialog = inject(MatDialog);
  private translate = inject(TranslateService);
  auth = inject(AuthService);

  private id = this.route.snapshot.paramMap.get('id')!;
  poll = toSignal(this.pollService.streamOne(this.id));
  votes = toSignal(this.pollService.streamVotes(this.id), { initialValue: [] as PollVote[] });

  /** Live current name for every voter, keyed by uid — resolves to "who voted for what" in the
   *  results view (a vote doc only stores the voter's uid). */
  private voterUidsKey = computed(() => uidsKey(this.votes().map((v) => v.id)));
  private voterProfiles = toSignal(liveUserProfiles(this.fs, toObservable(this.voterUidsKey)), {
    initialValue: new Map<string, AppUser>(),
  });

  private uid = computed(() => this.auth.firebaseUser()?.uid ?? '');
  myVote = toSignal(
    toObservable(this.uid).pipe(
      switchMap((uid) => (uid ? this.pollService.myVote(this.id, uid) : of(undefined)))
    ),
    { initialValue: undefined as PollVote | undefined }
  );

  selected = signal<Set<number>>(new Set());
  /** Peeking at results before voting, via the "Show results" button. */
  showResultsPreview = signal(false);
  isVoting = signal(false);
  errorMsg = signal('');
  shareCopied = signal(false);
  /** Set when neither the Clipboard nor Web Share API worked — shows the link as plain text
   *  so it can be copied manually (both APIs require a secure context, which plain-http LAN
   *  testing on a phone doesn't have). */
  shareLinkVisible = signal<string | null>(null);

  hasVoted = computed(() => !!this.myVote());
  showResults = computed(() => this.hasVoted() || this.showResultsPreview());

  totalVoters = computed(() => this.votes().length);

  results = computed(() => {
    const poll = this.poll();
    if (!poll) return [];
    const profiles = this.voterProfiles();
    const counts = poll.options.map(() => 0);
    const voters: string[][] = poll.options.map(() => []);
    for (const v of this.votes()) {
      const profile = profiles.get(v.id);
      const name = profile ? userDisplayName(profile, v.id) : v.id;
      for (const idx of v.optionIndexes) {
        if (counts[idx] != null) {
          counts[idx]++;
          voters[idx].push(name);
        }
      }
    }
    const total = this.totalVoters();
    return poll.options.map((label, i) => ({
      label,
      count: counts[i],
      pct: total ? Math.round((counts[i] / total) * 100) : 0,
      voters: voters[i],
    }));
  });

  canDelete = computed(() => !!this.poll() && this.auth.isAdmin());

  toggleOption(i: number): void {
    const poll = this.poll();
    if (!poll) return;
    this.selected.update((set) => {
      const next = new Set(set);
      if (poll.allowMultiple) {
        if (next.has(i)) next.delete(i);
        else next.add(i);
      } else {
        next.clear();
        next.add(i);
      }
      return next;
    });
  }

  async submitVote(): Promise<void> {
    const uid = this.uid();
    if (!uid || !this.selected().size) return;
    this.isVoting.set(true);
    this.errorMsg.set('');
    try {
      await this.pollService.vote(this.id, uid, [...this.selected()].sort((a, b) => a - b));
    } catch {
      this.errorMsg.set(this.translate.instant('POLLS.VOTE_FAILED'));
    } finally {
      this.isVoting.set(false);
    }
  }

  /** Copies the link first (with a visible "Copied!" confirmation) — the reliable path a user
   *  actually wants when sending a poll to others. Falls back to the native share sheet, and if
   *  NEITHER browser API is usable (both `navigator.clipboard` and `navigator.share` require a
   *  secure context — plain http on a phone testing against the dev server over the LAN has
   *  neither), reveals the link as plain selectable text so it can still be copied by hand. */
  async share(): Promise<void> {
    const poll = this.poll();
    if (!poll) return;
    const url = `${location.origin}/polls/${this.id}`;

    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
      return;
    } catch {
      /* clipboard unavailable/blocked — try the next option */
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: poll.title, url });
        return;
      } catch {
        /* user cancelled, or share unsupported here too — fall through */
      }
    }

    this.shareLinkVisible.set(url);
  }

  async remove(): Promise<void> {
    const poll = this.poll();
    if (!poll) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant('POLLS.DELETE_CONFIRM_TITLE'),
        message: this.translate.instant('POLLS.DELETE_CONFIRM_MESSAGE', { title: poll.title }),
        destructive: true,
        confirmLabel: this.translate.instant('COMMON.DELETE'),
      },
      width: '90vw',
      maxWidth: '400px',
    });
    if (await ref.afterClosed().toPromise()) {
      await this.pollService.remove(this.id);
      this.router.navigateByUrl('/polls');
    }
  }

  timeAgo(ms: number): string {
    this.translate.currentLang();
    const { key, params } = timeAgoKey(ms);
    return this.translate.instant(key, params);
  }

  doughnutOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
  };

  doughnutData(): ChartConfiguration<'doughnut'>['data'] {
    const r = this.results();
    return {
      labels: r.map((x) => x.label),
      datasets: [
        {
          data: r.map((x) => x.count),
          backgroundColor: r.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
          borderWidth: 0,
        },
      ],
    };
  }
}
