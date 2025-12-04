function formatMinutes(diffInSeconds: number): string {
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes === 1) return 'Synced a minute ago';
  if (minutes < 5) return 'Synced few minutes ago';
  return `Synced ${minutes} minutes ago`;
}

function formatHours(diffInSeconds: number): string {
  const hours = Math.floor(diffInSeconds / 3600);
  return `Synced ${hours} hours ago`;
}

function formatDays(diffInSeconds: number): string {
  const days = Math.floor(diffInSeconds / 86400);
  if (days < 5) return 'Synced few days ago';
  return `Synced ${days} days ago`;
}

function formatWeeks(diffInSeconds: number): string {
  const weeks = Math.floor(diffInSeconds / 604800);
  return `Synced ${weeks} weeks ago`;
}

function formatMonths(diffInSeconds: number): string {
  const months = Math.floor(diffInSeconds / 2419200);
  if (months === 1) return 'Synced 1 month ago';
  return `Synced ${months} months ago`;
}

function formatYears(diffInSeconds: number): string {
  const years = Math.floor(diffInSeconds / 31536000);
  return years === 1 ? 'Synced 1 year ago' : `Synced ${years} years ago`;
}

function isToday(date: Date, now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const syncDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return today.getTime() === syncDate.getTime();
}

function isYesterday(date: Date, now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const syncDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return syncDate.getTime() === yesterday.getTime();
}

export function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp || timestamp.trim() === '') {
    return 'Never synced';
  }

  try {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
      return 'Invalid timestamp';
    }

    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 0 || diffInSeconds < 60) {
      return 'Synced Just Now';
    }

    if (diffInSeconds < 3600) {
      return formatMinutes(diffInSeconds);
    }

    if (isToday(date, now)) {
      return 'Synced today';
    }

    if (isYesterday(date, now)) {
      return 'Synced yesterday';
    }

    if (diffInSeconds < 86400) {
      return formatHours(diffInSeconds);
    }

    if (diffInSeconds < 604800) {
      return formatDays(diffInSeconds);
    }

    if (diffInSeconds < 1209600) {
      return 'Synced a week ago';
    }

    if (diffInSeconds < 1814400) {
      return 'Synced last week';
    }

    if (diffInSeconds < 2419200) {
      return formatWeeks(diffInSeconds);
    }

    if (diffInSeconds < 31536000) {
      return formatMonths(diffInSeconds);
    }

    return formatYears(diffInSeconds);
  } catch {
    return 'Invalid timestamp';
  }
}
