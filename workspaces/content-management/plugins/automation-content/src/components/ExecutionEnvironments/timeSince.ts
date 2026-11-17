const relativeTime = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'always',
});

export function timeSince(
  timestamp: string,
  now: number,
  justNow: string,
): string {
  const minutes = Math.max(
    0,
    Math.floor((now - Date.parse(timestamp)) / 60_000),
  );
  if (minutes === 0) return justNow;
  if (minutes < 60) return relativeTime.format(-minutes, 'minute');
  if (minutes < 24 * 60)
    return relativeTime.format(-Math.floor(minutes / 60), 'hour');
  const days = Math.floor(minutes / (24 * 60));
  if (days < 7) return relativeTime.format(-days, 'day');
  return relativeTime.format(-Math.floor(days / 7), 'week');
}
