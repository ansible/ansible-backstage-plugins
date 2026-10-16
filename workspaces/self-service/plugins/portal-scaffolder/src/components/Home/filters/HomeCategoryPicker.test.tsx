import { render, waitFor, act } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  catalogApiRef,
  EntityTypeFilter,
} from '@backstage/plugin-catalog-react';
import { MockEntityListContextProvider } from '@backstage/plugin-catalog-react/testUtils';
import { HomeCategoryPicker } from './HomeCategoryPicker';

const mockGetEntityFacets = jest.fn();
const mockUpdateFilters = jest.fn();
let lastOnChange: ((value: string[]) => void) | undefined;

jest.mock('../../utils/TagFilterPicker', () => ({
  TagFilterPicker: (props: {
    options: string[];
    onChange: (value: string[]) => void;
    label: string;
  }) => {
    lastOnChange = props.onChange;
    return (
      <div data-testid="category-picker">
        {props.label}:{props.options.join(',')}
      </div>
    );
  },
}));

describe('HomeCategoryPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastOnChange = undefined;
    mockGetEntityFacets.mockResolvedValue({
      facets: {
        'spec.type': [
          { value: 'workflow', count: 1 },
          { value: 'execution-environment', count: 2 },
          { value: 'service', count: 3 },
        ],
      },
    });
  });

  const renderPicker = (filters: Record<string, unknown> = {}, syncKey = 0) =>
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntityFacets: mockGetEntityFacets } as any],
        ]}
      >
        <MockEntityListContextProvider
          value={{ filters, updateFilters: mockUpdateFilters }}
        >
          <HomeCategoryPicker syncKey={syncKey} />
        </MockEntityListContextProvider>
      </TestApiProvider>,
    );

  it('loads non-EE categories and seeds EntityTypeFilter when unset', async () => {
    renderPicker();

    await waitFor(() => {
      expect(mockUpdateFilters).toHaveBeenCalledWith({
        type: expect.any(EntityTypeFilter),
      });
    });
    const filter = mockUpdateFilters.mock.calls[0][0].type as EntityTypeFilter;
    expect(filter.getTypes()).toEqual(['service', 'workflow']);
  });

  it('re-seeds type filter from facets when user has not selected categories', async () => {
    renderPicker({
      type: new EntityTypeFilter(['service']),
    });

    await waitFor(() => {
      expect(mockUpdateFilters).toHaveBeenCalledWith({
        type: expect.any(EntityTypeFilter),
      });
    });
  });

  it('does not re-seed type filter after user selects categories', async () => {
    const { rerender } = renderPicker();
    await waitFor(() => expect(lastOnChange).toBeDefined());

    act(() => {
      lastOnChange?.(['service']);
    });
    mockUpdateFilters.mockClear();

    rerender(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntityFacets: mockGetEntityFacets } as any],
        ]}
      >
        <MockEntityListContextProvider
          value={{ filters: {}, updateFilters: mockUpdateFilters }}
        >
          <HomeCategoryPicker syncKey={1} />
        </MockEntityListContextProvider>
      </TestApiProvider>,
    );

    await waitFor(() => expect(mockGetEntityFacets).toHaveBeenCalledTimes(2));
    expect(mockUpdateFilters).not.toHaveBeenCalled();
  });

  it('does not reapply an unchanged category filter on facet refresh', async () => {
    // Regression test: the real EntityListProvider resets the page offset
    // to 0 on every updateFilters call, which would defeat the soft
    // refresh's page-preserving intent if we reapplied an identical filter
    // on every sync-triggered facet refresh.
    const { rerender } = renderPicker();

    await waitFor(() => {
      expect(mockUpdateFilters).toHaveBeenCalledWith({
        type: expect.any(EntityTypeFilter),
      });
    });
    expect(mockUpdateFilters).toHaveBeenCalledTimes(1);
    mockUpdateFilters.mockClear();

    rerender(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntityFacets: mockGetEntityFacets } as any],
        ]}
      >
        <MockEntityListContextProvider
          value={{ filters: {}, updateFilters: mockUpdateFilters }}
        >
          <HomeCategoryPicker syncKey={1} />
        </MockEntityListContextProvider>
      </TestApiProvider>,
    );

    await waitFor(() => expect(mockGetEntityFacets).toHaveBeenCalledTimes(2));
    expect(mockUpdateFilters).not.toHaveBeenCalled();
  });

  it('clears categories when facets fail', async () => {
    mockGetEntityFacets.mockRejectedValue(new Error('boom'));
    const { getByTestId } = renderPicker();

    await waitFor(() => {
      expect(getByTestId('category-picker')).toHaveTextContent('Categories:');
    });
  });

  it('filters to user selection and restores all categories when cleared', async () => {
    renderPicker();
    await waitFor(() => expect(lastOnChange).toBeDefined());

    act(() => {
      lastOnChange?.(['service']);
    });
    expect(mockUpdateFilters).toHaveBeenLastCalledWith({
      type: expect.any(EntityTypeFilter),
    });
    expect(
      (
        mockUpdateFilters.mock.calls.at(-1)?.[0].type as EntityTypeFilter
      ).getTypes(),
    ).toEqual(['service']);

    act(() => {
      lastOnChange?.([]);
    });
    expect(
      (
        mockUpdateFilters.mock.calls.at(-1)?.[0].type as EntityTypeFilter
      ).getTypes(),
    ).toEqual(['service', 'workflow']);
  });

  it('clears type filter when no categories exist and selection is empty', async () => {
    mockGetEntityFacets.mockResolvedValue({ facets: { 'spec.type': [] } });
    renderPicker();
    await waitFor(() => expect(lastOnChange).toBeDefined());

    act(() => {
      lastOnChange?.([]);
    });
    expect(mockUpdateFilters).toHaveBeenLastCalledWith({ type: undefined });
  });
});
