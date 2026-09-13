/** One of up to 4 formation/lineup screenshots a manager has uploaded via the external capture
 *  tool for a tournament — `id` is the fixed slot key ('1'..'4'), never a Firestore auto-id. */
export interface LineupImage {
  id: string;
  image: string; // data:image/...;base64,...
}

/** Admin-only "reviewed this screenshot" flag for one lineup slot — lives in its own sibling
 *  `approvals/{slot}` subcollection rather than on the `images/{slot}` doc itself, so it never
 *  interferes with the external capture tool's public write contract there (see
 *  LINEUP_TOOL_INTEGRATION.md). `LineupService.upload`/`remove` clear the matching approval
 *  whenever this app's own UI replaces or deletes an image, but the external tool writes straight
 *  to `images/{slot}` without going through this app, so a re-upload via the tool can leave a
 *  stale `approved: true` behind — worth a manual re-check if that path is used often. */
export interface LineupApproval {
  id: string;
  approved: boolean;
}
