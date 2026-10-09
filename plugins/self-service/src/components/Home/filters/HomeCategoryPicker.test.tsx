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

  const renderPicker = (filters: Record<string, unknown> = {}) =>
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntityFacets: mockGetEntityFacets } as any],
        ]}
      >
        <MockEntityListContextProvider
          value={{ filters, updateFilters: mockUpdateFilters }}
        >
          <HomeCategoryPicker syncKey={0} />
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

  it('does not overwrite an existing type filter', async () => {
    renderPicker({
      type: new EntityTypeFilter(['service']),
    });

    await waitFor(() => {
      expect(mockGetEntityFacets).toHaveBeenCalled();
    });
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
