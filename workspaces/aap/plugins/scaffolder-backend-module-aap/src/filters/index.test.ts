import * as filters from './index';
import * as useCaseFilters from './useCaseFilters';
import * as resourceFilters from './resourceFilters';

describe('filters barrel exports', () => {
  it('exports useCaseNameFilter from useCaseFilters', () => {
    expect(filters.useCaseNameFilter).toBe(useCaseFilters.useCaseNameFilter);
  });

  it('exports resourceFilter and multiResourceFilter from resourceFilters', () => {
    expect(filters.resourceFilter).toBe(resourceFilters.resourceFilter);
    expect(filters.multiResourceFilter).toBe(
      resourceFilters.multiResourceFilter,
    );
  });
});
