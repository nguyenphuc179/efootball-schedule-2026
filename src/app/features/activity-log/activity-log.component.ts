import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';
import { ActivityLogService, SeenState } from '../../core/services/activity-log.service';
import { AuthService } from '../../core/services/auth.service';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { TeamService } from '../teams/team.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ACTIVITY_MENUS, menuInfoForPath } from '../../shared/utils/activity-menu.util';
import { liveUserProfiles, uidsKey } from '../../shared/utils/live-user-profiles.util';
import { AppUser, userDisplayName } from '../../models/user.model';
import { ActivityAction, ActivityLog } from '../../models/activity-log.model';
import { timeAgoKey } from '../../shared/utils/time-ago.util';

const PAGE_SIZE = 100;

interface ManagerOption {
  uid: string;
  name: string;
  email: string | null;
}

const ICONS: Record<ActivityAction, string> = {
  tournament_create: 'emoji_events',
  tournament_update: 'emoji_events',
  tournament_end: 'flag',
  tournament_reopen: 'replay',
  tournament_delete: 'delete',
  team_create: 'groups',
  team_update: 'groups',
  team_delete: 'group_off',
  player_add: 'person_add',
  player_remove: 'person_remove',
  result_update: 'sports_soccer',
  match_delete: 'event_busy',
  fixtures_generate: 'calendar_month',
  poll_create: 'how_to_vote',
  poll_delete: 'delete',
  poll_vote: 'check_circle',
  user_role_change: 'admin_panel_settings',
  user_disabled_change: 'block',
  user_name_override: 'badge',
  lineup_upload: 'photo_camera',
  lineup_remove: 'hide_image',
  champion_create: 'military_tech',
  champion_update: 'military_tech',
  champion_delete: 'delete',
  manager_image_set: 'image',
  manager_image_remove: 'image_not_supported',
  activity_log_purge: 'delete_sweep',
};

/**
 * "/history" — for an admin, the full audit trail (who did what, when, from which screen), with
 * screen + manager filters and bulk delete. For anyone else, the same page/route instead shows
 * "Thông báo của tôi" — just the entries where they're the actor or the `subjectUid` (see
 * `ActivityLogService.streamMine()`), no manager filter (there's only one manager to filter to:
 * them) and no delete (that stays admin-only, per firestore.rules). Read access itself is enforced
 * by firestore.rules (`activityLogs`: admin reads everything, anyone else only their own
 * actor/subject entries) — this component's `auth.isAdmin()` checks only decide which UI/query path
 * to use, not security.
 *
 * Live Firestore listeners, not one-shot fetches — the listing used to only refresh on navigating
 * away and back (unlike the bell badge, which was always live), which read as broken once the bell
 * and the list could visibly disagree. `visibleLimit` grows on "Load more" instead of a Firestore
 * cursor, so `logs$` below just re-subscribes with a bigger `limit(...)` each time — simpler than
 * stitching cursor-paged snapshots together, and it keeps every page live.
 */
@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-content-area px-4 pt-4 max-w-2xl mx-auto">
      <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h1 class="text-xl font-extrabold">{{ (auth.isAdmin() ? 'ACTIVITY_LOG.TITLE' : 'ACTIVITY_LOG.MY_TITLE') | translate }}</h1>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-xs font-semibold text-primary-600 disabled:opacity-50 shrink-0"
            [disabled]="marking()"
            (click)="markAllSeen()"
          >
            {{ 'ACTIVITY_LOG.MARK_ALL_SEEN' | translate }}
          </button>
          @if (auth.isAdmin()) {
            <button
              type="button"
              class="text-xs font-semibold text-accent-red disabled:opacity-50 shrink-0"
              [disabled]="deleting() || logs().length === 0"
              (click)="deleteAll()"
            >
              {{ (hasActiveFilter() ? 'ACTIVITY_LOG.DELETE_FILTERED' : 'ACTIVITY_LOG.DELETE_ALL') | translate }}
            </button>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-gray-600">{{ 'ACTIVITY_LOG.FILTER_LABEL' | translate }}</span>
          <select class="input-field" [value]="selectedMenuKey() ?? ''" (change)="selectedMenuKey.set($any($event.target).value || null)">
            <option value="">{{ 'ACTIVITY_LOG.FILTER_ALL' | translate }}</option>
            @for (m of menus; track m.key) {
              <option [value]="m.key">{{ m.label }}</option>
            }
          </select>
        </label>

        @if (auth.isAdmin()) {
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-gray-600">{{ 'ACTIVITY_LOG.FILTER_MANAGER_LABEL' | translate }}</span>
            <select class="input-field" [value]="selectedManagerUid() ?? ''" (change)="selectedManagerUid.set($any($event.target).value || null)">
              <option value="">{{ 'ACTIVITY_LOG.FILTER_MANAGER_ALL' | translate }}</option>
              @for (m of activeManagersWithActivity(); track m.uid) {
                <option [value]="m.uid">{{ m.name }}</option>
              }
            </select>
          </label>
        }
      </div>

      @if (loadError()) {
        <p class="text-sm text-red-500 mb-3">{{ loadError() }}</p>
      }

      @if (logs().length === 0 && !loading()) {
        <app-empty-state
          icon="history"
          [title]="(auth.isAdmin() ? 'ACTIVITY_LOG.EMPTY_TITLE' : 'ACTIVITY_LOG.MY_EMPTY_TITLE') | translate"
          [subtitle]="(auth.isAdmin() ? 'ACTIVITY_LOG.EMPTY_SUBTITLE' : 'ACTIVITY_LOG.MY_EMPTY_SUBTITLE') | translate"
        />
      } @else {
        <div class="flex flex-col gap-2">
          @for (l of logs(); track l.id) {
            <div class="card flex gap-3 !py-3" [class.bg-primary-50]="isUnseen(l)">
              <span class="material-icons text-primary-500 mt-0.5">{{ icons[l.action] }}</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm">{{ l.description }}</div>
                <div class="text-xs text-gray-500 truncate">
                  {{ l.actorName }}{{ l.actorEmail ? ' · ' + l.actorEmail : '' }}
                </div>
                <div class="text-[11px] text-gray-400 mt-1">{{ timeAgo(l.createdDate) }}</div>
                @if (l.sourcePath) {
                  <button
                    type="button"
                    class="text-[11px] text-primary-600 hover:underline flex items-center gap-1 mt-1 max-w-full"
                    (click)="go(l.sourcePath)"
                  >
                    <span class="material-icons text-[12px] shrink-0">open_in_new</span>
                    <span class="truncate">{{ menuLabel(l.sourcePath) }} · {{ fullUrl(l.sourcePath) }}</span>
                  </button>
                }
              </div>
              @if (isUnseen(l)) {
                <button
                  type="button"
                  class="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-primary-600 active:bg-primary-100 disabled:opacity-50"
                  [disabled]="markingIds().has(l.id)"
                  (click)="markSeen(l)"
                  [attr.aria-label]="'ACTIVITY_LOG.MARK_SEEN' | translate"
                  [title]="'ACTIVITY_LOG.MARK_SEEN' | translate"
                >
                  <span class="material-icons text-[18px]">{{ markingIds().has(l.id) ? 'hourglass_top' : 'check_circle_outline' }}</span>
                </button>
              }
            </div>
          }
        </div>

        @if (hasMore()) {
          <button
            type="button"
            class="btn-secondary w-full mt-3 disabled:opacity-50"
            [disabled]="loading()"
            (click)="loadMore()"
          >
            {{ (loading() ? 'COMMON.LOADING' : 'ACTIVITY_LOG.LOAD_MORE') | translate }}
          </button>
        }
      }
    </div>
  `,
})
export class ActivityLogComponent {
  private activityLogService = inject(ActivityLogService);
  private teamService = inject(TeamService);
  private fs = inject(FirestoreBaseService);
  private translate = inject(TranslateService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);
  icons = ICONS;
  menus = ACTIVITY_MENUS;
  menuLabel = (path: string) => menuInfoForPath(path).label;

  selectedMenuKey = signal<string | null>(null);
  selectedManagerUid = signal<string | null>(null);
  loading = signal(true);
  loadError = signal('');
  marking = signal(false);
  markingIds = signal<Set<string>>(new Set());
  deleting = signal(false);

  hasActiveFilter = computed(() => !!this.selectedMenuKey() || !!this.selectedManagerUid());

  seenState = toSignal(this.activityLogService.streamSeenState(), {
    initialValue: { lastSeenAt: 0, seenIds: new Set<string>() } as SeenState,
  });

  /** Every active (non-disabled) team manager app-wide, live-joined with their account profile —
   *  the raw candidate list before the "has this person actually done anything?" check below. */
  private managerUidsKey = computed(() => uidsKey(this.teamService.all().map((t) => t.managerUid)));
  private managerProfiles = toSignal(liveUserProfiles(this.fs, toObservable(this.managerUidsKey)), {
    initialValue: new Map<string, AppUser>(),
  });
  private activeManagerCandidates = computed<ManagerOption[]>(() => {
    const profiles = this.managerProfiles();
    const seen = new Set<string>();
    const list: ManagerOption[] = [];
    for (const team of this.teamService.all()) {
      const uid = team.managerUid;
      if (!uid || seen.has(uid)) continue;
      const profile = profiles.get(uid);
      if (!profile || profile.disabled) continue; // no linked account resolved yet, or locked out
      seen.add(uid);
      list.push({ uid, name: userDisplayName(profile, team.manager || team.teamName), email: profile.email ?? null });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  });

  /** `activeManagerCandidates`, narrowed to only those who've actually logged at least one action
   *  — a one-shot check per candidate (small, fixed-size list), re-run whenever the candidate set
   *  changes. Not meant to be instant-realtime; a filter dropdown doesn't need that. Admin-only:
   *  the manager filter itself is hidden for anyone else, and `hasActed(otherUid)` would fail under
   *  firestore.rules for a non-admin anyway (they can only read their own actor/subject entries). */
  activeManagersWithActivity = signal<ManagerOption[]>([]);
  private refreshManagersWithActivity = effect(() => {
    const candidates = this.activeManagerCandidates();
    if (!this.auth.isAdmin()) return;
    (async () => {
      try {
        const flags = await Promise.all(candidates.map((m) => this.activityLogService.hasActed(m.uid)));
        this.activeManagersWithActivity.set(candidates.filter((_, i) => flags[i]));
      } catch (err) {
        console.error('[ActivityLog] failed to resolve managers with activity', err);
      }
    })();
  });

  /** Grows on "Load more" instead of a Firestore cursor — `rawLogs$` below just re-subscribes with
   *  a bigger `limit(...)`, which is what keeps every already-revealed row live too. */
  private visibleLimit = signal(PAGE_SIZE);

  /** Resets to the first page whenever a filter (or the admin/non-admin path itself) changes —
   *  matches the old cursor-reset behavior; doesn't itself read `visibleLimit`, so no feedback loop
   *  with `rawLogs$` below. */
  private resetLimitOnFilterChange = effect(() => {
    this.selectedMenuKey();
    this.selectedManagerUid();
    this.auth.isAdmin();
    this.visibleLimit.set(PAGE_SIZE);
  });

  /** The live source list, capped at `visibleLimit() + 1` — the extra one is a peek used only to
   *  compute `hasMore` below, never rendered. An admin's query maps straight to Firestore
   *  constraints; anyone else gets their merged personal feed (`streamMine`), filtered by menu
   *  client-side since that merge can't be expressed as a single Firestore query (see
   *  `ActivityLogService.streamMine`). Errors are caught per-cycle (inside the `switchMap`, not
   *  around it) so one failed subscription doesn't permanently kill the outer live stream. */
  private rawLogs$: Observable<ActivityLog[]> = combineLatest([
    toObservable(this.selectedMenuKey),
    toObservable(this.selectedManagerUid),
    toObservable(this.visibleLimit),
    toObservable(this.auth.isAdmin),
    toObservable(computed(() => this.auth.firebaseUser()?.uid ?? null)),
  ]).pipe(
    tap(() => this.loading.set(true)),
    switchMap(([menuKey, managerUid, visibleLimit, isAdmin, uid]) => {
      const windowSize = visibleLimit + 1;
      const source$: Observable<ActivityLog[]> = isAdmin
        ? this.activityLogService.streamFiltered(menuKey, managerUid, windowSize)
        : uid
          ? this.activityLogService
              .streamMine(uid, windowSize)
              .pipe(map((list) => (menuKey ? list.filter((l) => l.menuKey === menuKey) : list)))
          : of<ActivityLog[]>([]);
      return source$.pipe(
        tap(() => {
          this.loading.set(false);
          this.loadError.set('');
        }),
        catchError((err) => {
          console.error('[ActivityLog] stream failed', err);
          this.loading.set(false);
          this.loadError.set(err instanceof Error ? err.message : String(err));
          return of<ActivityLog[]>([]);
        })
      );
    })
  );

  private rawLogs = toSignal(this.rawLogs$, { initialValue: [] as ActivityLog[] });

  logs = computed(() => this.rawLogs().slice(0, this.visibleLimit()));
  hasMore = computed(() => this.rawLogs().length > this.visibleLimit());

  isUnseen(log: ActivityLog): boolean {
    const state = this.seenState();
    return log.createdDate > state.lastSeenAt && !state.seenIds.has(log.id);
  }

  loadMore(): void {
    if (!this.hasMore()) return;
    this.visibleLimit.update((n) => n + PAGE_SIZE);
  }

  async markSeen(log: ActivityLog): Promise<void> {
    if (this.markingIds().has(log.id)) return;
    this.markingIds.update((set) => new Set(set).add(log.id));
    try {
      await this.activityLogService.markSeen(log.id);
    } finally {
      this.markingIds.update((set) => {
        const next = new Set(set);
        next.delete(log.id);
        return next;
      });
    }
  }

  async markAllSeen(): Promise<void> {
    this.marking.set(true);
    try {
      await this.activityLogService.markAllSeen();
    } finally {
      this.marking.set(false);
    }
  }

  async deleteAll(): Promise<void> {
    const menuKey = this.selectedMenuKey();
    const managerUid = this.selectedManagerUid();
    const manager = managerUid ? this.activeManagersWithActivity().find((m) => m.uid === managerUid) : null;
    const menu = menuKey ? this.menus.find((m) => m.key === menuKey) : null;
    const scopeLabel = [manager?.name, menu?.label].filter(Boolean).join(' · ');

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translate.instant(this.hasActiveFilter() ? 'ACTIVITY_LOG.DELETE_FILTERED' : 'ACTIVITY_LOG.DELETE_ALL'),
        message: scopeLabel
          ? this.translate.instant('ACTIVITY_LOG.DELETE_FILTERED_CONFIRM_MESSAGE', { scope: scopeLabel })
          : this.translate.instant('ACTIVITY_LOG.DELETE_ALL_CONFIRM_MESSAGE'),
        destructive: true,
        confirmLabel: this.translate.instant('COMMON.DELETE'),
      },
      width: '90vw',
      maxWidth: '400px',
    });

    const confirmed = await ref.afterClosed().toPromise();
    if (!confirmed) return;

    this.deleting.set(true);
    try {
      await this.activityLogService.deleteAll(menuKey, managerUid);
      // No manual reload needed — `rawLogs$` is a live listener, so the deleted rows disappear on
      // their own once Firestore confirms the batch.
    } catch (err) {
      console.error('[ActivityLog] deleteAll failed', err);
      this.loadError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.deleting.set(false);
    }
  }

  timeAgo(ms: number): string {
    this.translate.currentLang();
    const { key, params } = timeAgoKey(ms);
    return this.translate.instant(key, params);
  }

  fullUrl(path: string): string {
    return `${location.origin}${path}`;
  }

  go(path: string): void {
    this.router.navigateByUrl(path);
  }
}
