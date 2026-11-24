import { compareVersions } from './versions';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
  });

  it('returns 1 when first is greater', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  it('returns -1 when first is smaller', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });

  it('ranks a prerelease before the matching release', () => {
    expect(compareVersions('1.2.3-rc.1', '1.2.3')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3-rc.1')).toBeGreaterThan(0);
  });

  it('compares prerelease identifiers', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBeLessThan(0);
  });

  it('ignores SemVer build metadata when comparing', () => {
    expect(compareVersions('1.0.0+build.1', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-rc.1+build.1', '1.0.0-rc.1')).toBe(0);
    expect(compareVersions('1.0.0-rc.1+build.1', '1.0.0-rc.2')).toBeLessThan(0);
  });
});
