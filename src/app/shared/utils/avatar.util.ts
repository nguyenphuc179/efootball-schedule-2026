/**
 * Deterministic initials avatars.
 *
 * - `initialsAvatar()` returns a tint pair (soft background + matching text colour) for rendering
 *   a real DOM circle — used for people (user menu, members, profile).
 * - `initialsAvatarDataUri()` returns a solid-colour SVG data-URI — used as a default team logo
 *   where an <img> is expected (no network / Firebase Storage needed; renders offline).
 */

/** Up-to-two uppercase initials from a name ("Nguyen Phuc" -> "NP", "phuc" -> "PH"). */
export function initials(name: string | null | undefined): string {
  const label = (name ?? '').trim() || '?';
  const words = label.split(/\s+/);
  return (
    words.length > 1 ? words[0][0] + words[words.length - 1][0] : label.slice(0, 2)
  ).toUpperCase();
}

/** Stable non-negative hash so the same name always maps to the same colour. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const AVATAR_TINTS = [
  { bg: '#fde8ef', fg: '#be185d' }, // pink
  { bg: '#e7f0ff', fg: '#1d4ed8' }, // blue
  { bg: '#e6f6ec', fg: '#0a6d41' }, // green
  { bg: '#fff1e0', fg: '#c05621' }, // orange
  { bg: '#f1e9ff', fg: '#6d28d9' }, // purple
  { bg: '#e0f7f5', fg: '#0f766e' }, // teal
  { bg: '#fdeaea', fg: '#b91c1c' }, // red
  { bg: '#fef6e0', fg: '#a16207' }, // amber
];

export interface InitialsAvatar {
  initials: string;
  bg: string;
  fg: string;
}

export function initialsAvatar(name: string | null | undefined): InitialsAvatar {
  const label = (name ?? '').trim() || '?';
  const tint = AVATAR_TINTS[hashString(label) % AVATAR_TINTS.length];
  return { initials: initials(label), bg: tint.bg, fg: tint.fg };
}

const PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626',
  '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
];

export function initialsAvatarDataUri(name: string): string {
  const label = (name ?? '').trim() || '?';
  const bg = PALETTE[hashString(label) % PALETTE.length];

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" fill="${bg}"/>` +
    `<text x="48" y="48" dy=".35em" text-anchor="middle" fill="#ffffff" ` +
    `font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="38" font-weight="600">` +
    `${escapeXml(initials(label))}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!
  );
}
