/** Maps a past timestamp to an i18n key (+ params) for a relative "N minutes/hours/days ago" label. */
export function timeAgoKey(ms: number): { key: string; params?: Record<string, number> } {
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return { key: 'TIME_AGO.JUST_NOW' };
  if (diffMin < 60) return { key: 'TIME_AGO.MINUTES_AGO', params: { n: diffMin } };
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return { key: 'TIME_AGO.HOURS_AGO', params: { n: diffH } };
  return { key: 'TIME_AGO.DAYS_AGO', params: { n: Math.round(diffH / 24) } };
}
