function formatMinutes(diffInSeconds: number): string {
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes === 1) return 'a minute ago';
  if (minutes < 5) return 'few minutes ago';
  return `${minutes} minutes ago`;
}

function formatHours(diffInSeconds: number): string {
  const hours = Math.floor(diffInSeconds / 3600);
  return `${hours} hours ago`;
}

function formatDays(diffInSeconds: number): string {
  const days = Math.floor(diffInSeconds / 86400);
  if (days < 5) return 'few days ago';
  return `${days} days ago`;
}

function formatWeeks(diffInSeconds: number): string {
  const weeks = Math.floor(diffInSeconds / 604800);
  return `${weeks} weeks ago`;
}

function formatMonths(diffInSeconds: number): string {
  const months = Math.floor(diffInSeconds / 2419200);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

function formatYears(diffInSeconds: number): string {
  const years = Math.floor(diffInSeconds / 31536000);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

function formatPastDuration(diffInSeconds: number): string {
  if (diffInSeconds < 86400) return formatHours(diffInSeconds);
  if (diffInSeconds < 604800) return formatDays(diffInSeconds);
  if (diffInSeconds < 1209600) return 'a week ago';
  if (diffInSeconds < 1814400) return 'last week';
  if (diffInSeconds < 2419200) return formatWeeks(diffInSeconds);
  if (diffInSeconds < 31536000) return formatMonths(diffInSeconds);
  return formatYears(diffInSeconds);
}

function isToday(date: Date, now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timestampDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return today.getTime() === timestampDate.getTime();
}

function isYesterday(date: Date, now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const timestampDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return timestampDate.getTime() === yesterday.getTime();
}

/**
 * Format a timestamp without domain-specific wording.
 * Missing values return "Never", invalid values return "Invalid timestamp", and
 * future timestamps are treated as "Just now" to tolerate clock skew.
 * Day labels use the local calendar; longer intervals use approximate durations.
 */
export function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp || timestamp.trim() === '') {
    return 'Never';
  }

  try {
    const date = new Date(timestamp);
    const now = new Date();

    if (Number.isNaN(date.getTime())) {
      return 'Invalid timestamp';
    }

    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    }

    if (diffInSeconds < 3600) {
      return formatMinutes(diffInSeconds);
    }

    if (isToday(date, now)) {
      return 'today';
    }

    if (isYesterday(date, now)) {
      return 'yesterday';
    }

    return formatPastDuration(diffInSeconds);
  } catch {
    return 'Invalid timestamp';
  }
}

/** @deprecated Use formatTimeAgo and add domain-specific wording in your plugin. */
export function formatRelativeTime(timestamp: string | null): string {
  const relativeTime = formatTimeAgo(timestamp);
  if (relativeTime === 'Never') return 'Never synced';
  if (relativeTime === 'Invalid timestamp') return relativeTime;
  return `Synced ${relativeTime === 'Just now' ? 'Just Now' : relativeTime}`;
}
