/**
 * EntityListProvider only re-queries when offset/limit/filters change.
 * Soft refresh briefly moves offset into a high sentinel band; createHomeCatalogApi
 * rewrites that back to the real page offset on the wire.
 */
export const OFFSET_REFRESH_SENTINEL = 1_000_000_000;

export function isRefreshOffset(offset: number | undefined): boolean {
  return typeof offset === 'number' && offset >= OFFSET_REFRESH_SENTINEL;
}

/** UI / provider offset → real catalog page offset. */
export function resolveCatalogOffset(offset: number | undefined): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset <= 0) {
    return 0;
  }
  return isRefreshOffset(offset) ? offset - OFFSET_REFRESH_SENTINEL : offset;
}

/** Distinct offset that triggers a same-page catalog refetch. */
export function toRefreshOffset(offset: number | undefined): number {
  return resolveCatalogOffset(offset) + OFFSET_REFRESH_SENTINEL;
}

/** Normalize request offsets before calling the catalog backend. */
export function normalizeQueryOffset(
  offset: number | undefined,
): number | undefined {
  if (typeof offset !== 'number') {
    return offset;
  }
  return resolveCatalogOffset(offset);
}

type HistoryReplaceState = Pick<History, 'replaceState'>;

/**
 * Keep the address bar on the real page offset while SoftRefresh uses a
 * sentinel in EntityListProvider state (provider syncs offset → URL).
 *
 * `historyApi` is injectable for tests (jsdom's History.replaceState is not
 * configurable enough to stub reliably).
 */
export function writeCatalogOffsetToUrl(
  offset: number,
  historyApi: HistoryReplaceState | undefined = typeof window !== 'undefined'
    ? window.history
    : undefined,
): void {
  if (!historyApi?.replaceState) {
    return;
  }
  const url = new URL(window.location.href);
  if (offset <= 0) {
    url.searchParams.delete('offset');
  } else {
    url.searchParams.set('offset', String(offset));
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) {
    return;
  }
  historyApi.replaceState(null, document.title, next);
}
