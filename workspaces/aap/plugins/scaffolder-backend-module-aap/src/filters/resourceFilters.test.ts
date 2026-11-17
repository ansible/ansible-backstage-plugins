import { multiResourceFilter, resourceFilter } from './resourceFilters';

describe('ansible-aap:resourceFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const testData = { id: 1, name: 'testName' };
  const multiTestData = [
    { id: 1, name: 'testName one' },
    { id: 2, name: 'testName two' },
    { id: 3, name: 'testName three' },
  ];
  it('should return resource id', () => {
    const result = resourceFilter(...[testData]);
    expect(result).toEqual(1);
  });

  it('should return resource name', () => {
    const result = resourceFilter(...[testData, 'name']);
    expect(result).toEqual('testName');
  });

  it('should preserve zero-valued resource fields', () => {
    expect(resourceFilter(...[{ count: 0 }, 'count'])).toBe(0);
  });

  it('should return none for missing or null resource fields', () => {
    expect(resourceFilter(...[{ name: 'testName' }, 'count'])).toBeNull();
    expect(resourceFilter(...[{ count: null }, 'count'])).toBeNull();
  });

  it('should return none', () => {
    const result = resourceFilter(...[]);
    expect(result).toEqual(null);
  });

  it('should return multiple resource id', () => {
    const result = multiResourceFilter(...[multiTestData]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should return multiple resource name', () => {
    const result = multiResourceFilter(...[multiTestData, 'name']);
    expect(result).toEqual(['testName one', 'testName two', 'testName three']);
  });
});
