import {
  OFFSET_REFRESH_SENTINEL,
  isRefreshOffset,
  normalizeQueryOffset,
  resolveCatalogOffset,
  toRefreshOffset,
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
});
