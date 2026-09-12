/** A simple poll: title + text options, voted on by signed-in members (one vote per account). */
export interface Poll {
  id: string;
  title: string;
  /** Stable order — the array index is the option's identity for the life of the poll. */
  options: string[];
  allowMultiple: boolean;
  createdBy: string; // uid
  /** Denormalized fallback only — PollService resolves the creator's live name when possible. */
  createdByName: string;
  createdDate: number;
}

export type PollDraft = Omit<Poll, 'id' | 'createdDate'>;

/** One member's vote — doc id is always the voter's own uid, enforcing one vote per account. */
export interface PollVote {
  id: string;
  optionIndexes: number[]; // one entry unless the poll allows multiple selections
  votedDate: number;
}
