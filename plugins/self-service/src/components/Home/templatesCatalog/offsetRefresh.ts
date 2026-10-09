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
