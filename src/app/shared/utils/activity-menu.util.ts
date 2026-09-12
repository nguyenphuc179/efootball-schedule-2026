/**
 * Classifies an app route (Angular `Router.url`) into a stable "menu" bucket — used both when
 * `ActivityLogService.log()` writes an entry (stores `menuKey`, a plain equality-filterable field)
 * and when the "/history" page renders/filter-by-menu (looks up the Vietnamese `label` for display).
 * Order matters: longest/most specific prefix should come first when one path could match more
 * than one entry (none currently overlap, but keep it that way when adding routes).
 */
export interface ActivityMenu {
  key: string;
  label: string;
  prefix: string;
}

export const ACTIVITY_MENUS: ActivityMenu[] = [
  { key: 'matches', label: 'Nhập kết quả trận đấu', prefix: '/matches' },
  { key: 'tournaments', label: 'Giải đấu', prefix: '/tournaments' },
  { key: 'ranking', label: 'Xếp hạng', prefix: '/ranking' },
  { key: 'hall_of_fame', label: 'Đại sảnh Vinh danh', prefix: '/hall-of-fame' },
  { key: 'polls', label: 'Bình chọn', prefix: '/polls' },
  { key: 'profile', label: 'Hồ sơ', prefix: '/profile' },
  { key: 'history', label: 'Nhật ký hoạt động', prefix: '/history' },
];

const HOME: ActivityMenu = { key: 'home', label: 'Trang chủ', prefix: '/' };
const OTHER_KEY = 'other';

export function menuInfoForPath(path: string): { key: string; label: string } {
  if (path === '/') return HOME;
  const found = ACTIVITY_MENUS.find((m) => path === m.prefix || path.startsWith(`${m.prefix}/`));
  return found ?? { key: OTHER_KEY, label: path };
}
