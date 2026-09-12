import { Injectable, computed, inject } from '@angular/core';
import { orderBy } from '@angular/fire/firestore';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FirestoreBaseService } from '../../core/services/firestore-base.service';
import { Poll, PollDraft, PollVote } from '../../models/poll.model';
import { AppUser, userDisplayName } from '../../models/user.model';
import { liveUserProfiles, uidsKey } from '../../shared/utils/live-user-profiles.util';

const PATH = 'polls';
const VOTES_SUBPATH = (pollId: string) => `${PATH}/${pollId}/votes`;

/** A Poll with its creator's display name resolved live from the linked account, if any. */
export type PollResolved = Poll & { createdByName: string };

@Injectable({ providedIn: 'root' })
export class PollService {
  private fs = inject(FirestoreBaseService);

  /** Every poll, newest first. */
  readonly all = toSignal(
    this.fs.streamCollection<Poll>(PATH, orderBy('createdDate', 'desc')),
    { initialValue: [] as Poll[] }
  );

  /** Stable, order-independent key so the profile stream below only re-subscribes when the
   *  actual SET of creator uids changes. */
  private creatorUidsKey = computed(() => uidsKey(this.all().map((p) => p.createdBy)));

  /** Live current name for every poll creator, keyed by uid — falls back to the poll's stored
   *  `createdByName` snapshot for a guest viewer (see `liveUserProfiles`), though this whole
   *  section is auth-gated anyway, so that fallback is mostly theoretical. */
  private creatorProfiles = toSignal(liveUserProfiles(this.fs, toObservable(this.creatorUidsKey)), {
    initialValue: new Map<string, AppUser>(),
  });

  /** `all()` with each entry's creator name resolved live — a rename shows up immediately
   *  instead of leaving a stale "by <old name>" on every poll they've created. */
  readonly allResolved = computed<PollResolved[]>(() => {
    const profiles = this.creatorProfiles();
    return this.all().map((p) => {
      const profile = profiles.get(p.createdBy);
      return { ...p, createdByName: (profile && userDisplayName(profile, '')) || p.createdByName };
    });
  });

  streamOne(id: string) {
    return this.fs.streamDoc<Poll>(`${PATH}/${id}`);
  }

  create(draft: PollDraft): Promise<string> {
    return this.fs.add<PollDraft>(PATH, draft);
  }

  remove(id: string): Promise<void> {
    return this.fs.remove(PATH, id);
  }

  /** Realtime vote tally for a poll — results update live as votes come in. */
  streamVotes(pollId: string) {
    return this.fs.streamCollection<PollVote>(VOTES_SUBPATH(pollId));
  }

  /** The current user's own vote on this poll, if any (drives "already voted" -> results view). */
  myVote(pollId: string, uid: string) {
    return this.fs.streamDoc<PollVote>(`${VOTES_SUBPATH(pollId)}/${uid}`);
  }

  /** Casts a vote. Firestore rules make the vote doc immutable once created, so a repeat call
   *  (e.g. a stale UI) fails rather than silently changing an earlier vote. */
  async vote(pollId: string, uid: string, optionIndexes: number[]): Promise<void> {
    await this.fs.set<Omit<PollVote, 'id'>>(VOTES_SUBPATH(pollId), uid, {
      optionIndexes,
      votedDate: Date.now(),
    });
  }
}
