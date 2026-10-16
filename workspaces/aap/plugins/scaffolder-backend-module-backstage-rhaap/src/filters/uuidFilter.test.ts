import { uuidFilter } from './uuidFilter';

describe('uuidFilter', () => {
  it('should return a string', () => {
    const result = uuidFilter();
    expect(typeof result).toBe('string');
  });

  it('should return an 8-character hex string', () => {
    const result = uuidFilter();
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should generate unique values on each call', () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(uuidFilter());
    }
    expect(results.size).toBe(100);
  });
});
