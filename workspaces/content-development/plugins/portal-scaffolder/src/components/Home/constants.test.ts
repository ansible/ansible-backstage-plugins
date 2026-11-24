import { PAGE_SIZE, PAGE_SIZE_OPTIONS, resolvePageLimit } from './constants';

describe('resolvePageLimit', () => {
  it.each([
    ['undefined limit', undefined, PAGE_SIZE],
    ...PAGE_SIZE_OPTIONS.map(
      size => [`${size} page size`, size, size] as [string, number, number],
    ),
    ['unsupported legacy limit', 15, PAGE_SIZE],
  ])('returns expected limit for %s', (_description, limit, expected) => {
    expect(resolvePageLimit(limit)).toBe(expected);
  });
});
