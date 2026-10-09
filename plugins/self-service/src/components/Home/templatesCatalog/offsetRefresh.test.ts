import {
  OFFSET_REFRESH_SENTINEL,
  isRefreshOffset,
  normalizeQueryOffset,
  resolveCatalogOffset,
  toRefreshOffset,
  writeCatalogOffsetToUrl,
} from './offsetRefresh';

describe('offsetRefresh', () => {
  it('maps refresh offsets back to the real page offset', () => {
    expect(resolveCatalogOffset(0)).toBe(0);
    expect(resolveCatalogOffset(20)).toBe(20);
    expect(resolveCatalogOffset(toRefreshOffset(20))).toBe(20);
    expect(normalizeQueryOffset(toRefreshOffset(40))).toBe(40);
  });

  it('detects sentinel offsets', () => {
    expect(isRefreshOffset(20)).toBe(false);
    expect(isRefreshOffset(undefined)).toBe(false);
    expect(isRefreshOffset(OFFSET_REFRESH_SENTINEL)).toBe(true);
    expect(isRefreshOffset(toRefreshOffset(40))).toBe(true);
  });

  it('treats non-finite and non-number offsets as page 0', () => {
    expect(resolveCatalogOffset(undefined)).toBe(0);
    expect(resolveCatalogOffset(Number.NaN)).toBe(0);
    expect(resolveCatalogOffset(-5)).toBe(0);
    expect(normalizeQueryOffset(undefined)).toBeUndefined();
  });

  it('writes the real page offset into the URL search params', () => {
    window.history.replaceState(
      null,
      '',
      '/self-service/catalog?offset=1000000020&limit=20',
    );

    writeCatalogOffsetToUrl(20);

    expect(window.location.pathname).toBe('/self-service/catalog');
    expect(window.location.search).toBe('?offset=20&limit=20');
  });

  it('removes offset from the URL when restoring page 0', () => {
    window.history.replaceState(
      null,
      '',
      '/self-service/catalog?offset=1000000000&limit=20',
    );

    writeCatalogOffsetToUrl(0);

    expect(window.location.search).toBe('?limit=20');
  });
});
