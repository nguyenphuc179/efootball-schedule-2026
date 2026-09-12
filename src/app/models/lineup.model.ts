/** One of up to 4 formation/lineup screenshots a manager has uploaded via the external capture
 *  tool for a tournament — `id` is the fixed slot key ('1'..'4'), never a Firestore auto-id. */
export interface LineupImage {
  id: string;
  image: string; // data:image/...;base64,...
}
