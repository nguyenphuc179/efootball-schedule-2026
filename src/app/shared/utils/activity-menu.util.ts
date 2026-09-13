/**
 * Classifies an app route (Angular `Router.url`) into a stable "menu" bucket — used both when
 * `ActivityLogService.log()` writes an entry (stores `menuKey`, a plain equality-filterable field)
 * and when the "/history" page renders/filter-by-menu (looks up `labelKey` — an i18n key, translated
 * at the call site — for display). Order matters: longest/most specific prefix should come first
 * when one path could match more than one entry (none currently overlap, but keep it that way when
 * adding routes).
 */
export interface ActivityMenu {
  key: string;
  labelKey: string;
  prefix: string;
}

export const ACTIVITY_MENUS: ActivityMenu[] = [
  { key: 'matches', labelKey: 'ACTIVITY_MENU.MATCHES', prefix: '/matches' },
  { key: 'tournaments', labelKey: 'ACTIVITY_MENU.TOURNAMENTS', prefix: '/tournaments' },
  { key: 'ranking', labelKey: 'ACTIVITY_MENU.RANKING', prefix: '/ranking' },
  { key: 'hall_of_fame', labelKey: 'ACTIVITY_MENU.HALL_OF_FAME', prefix: '/hall-of-fame' },
  { key: 'polls', labelKey: 'ACTIVITY_MENU.POLLS', prefix: '/polls' },
  { key: 'profile', labelKey: 'ACTIVITY_MENU.PROFILE', prefix: '/profile' },
  { key: 'history', labelKey: 'ACTIVITY_MENU.HISTORY', prefix: '/history' },
];

const HOME: ActivityMenu = { key: 'home', labelKey: 'ACTIVITY_MENU.HOME', prefix: '/' };
const OTHER_KEY = 'other';

/** `labelKey` is `null` only for the "other" fallback (a `sourcePath` that matches no known menu,
 *  e.g. a route added after this list) — callers show `path` itself in that case since there's no
 *  sensible label to translate. */
export function menuInfoForPath(path: string): { key: string; labelKey: string | null } {
  if (path === '/') return HOME;
  const found = ACTIVITY_MENUS.find((m) => path === m.prefix || path.startsWith(`${m.prefix}/`));
  return found ?? { key: OTHER_KEY, labelKey: null };
}
