import { formatTimeAgo } from '@ansible/portal-plugin-sdk';

/** Preserve the catalog's synchronization labels using the shared time formatter. */
export function formatRelativeTime(timestamp: string | null): string {
  const relativeTime = formatTimeAgo(timestamp);
  if (relativeTime === 'Never') return 'Never synced';
  if (relativeTime === 'Invalid timestamp') return relativeTime;
  return `Synced ${relativeTime === 'Just now' ? 'Just Now' : relativeTime}`;
}
