import { useCaseNameFilter } from './useCaseFilters';

describe('ansible-aap:useCaseFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const testData = [{ name: 'useCase1' }, { name: 'useCase2' }];

  it('should return use case id', () => {
    const result = useCaseNameFilter(...[testData]);
    expect(result).toEqual(['useCase1', 'useCase2']);
  });

  it('should return empty array', () => {
    const result = useCaseNameFilter();
    expect(result).toEqual([]);
  });

  it('should return an empty array when the input is not an array', () => {
    expect(useCaseNameFilter({ name: 'not-an-array' } as any)).toEqual([]);
  });
});
