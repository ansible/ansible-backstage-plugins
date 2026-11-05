import { render, waitFor, act } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  catalogApiRef,
  EntityTagFilter,
} from '@backstage/plugin-catalog-react';
import { MockEntityListContextProvider } from '@backstage/plugin-catalog-react/testUtils';
import { HomeTagPicker } from './HomeTagPicker';

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
      <div data-testid="tag-picker">
        {props.label}:{props.options.join(',')}
      </div>
    );
  },
}));

describe('HomeTagPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastOnChange = undefined;
    mockGetEntityFacets
      .mockResolvedValueOnce({
        facets: {
          'spec.type': [
            { value: 'service', count: 1 },
            { value: 'execution-environment', count: 1 },
          ],
        },
      })
      .mockResolvedValueOnce({
        facets: {
          'metadata.tags': [
            { value: 'beta', count: 1 },
            { value: 'alpha', count: 2 },
          ],
        },
      });
  });

  const renderPicker = () =>
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, { getEntityFacets: mockGetEntityFacets } as any],
        ]}
      >
        <MockEntityListContextProvider
          value={{ filters: {}, updateFilters: mockUpdateFilters }}
        >
          <HomeTagPicker syncKey={0} />
        </MockEntityListContextProvider>
      </TestApiProvider>,
    );

  it('loads sorted tags for non-EE template types', async () => {
    const { getByTestId } = renderPicker();

    await waitFor(() => {
      expect(getByTestId('tag-picker')).toHaveTextContent('Tags:alpha,beta');
    });
    expect(mockGetEntityFacets).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        filter: {
          kind: 'Template',
          'spec.type': ['service'],
        },
      }),
    );
  });

  it('clears available tags when facets fail', async () => {
    mockGetEntityFacets.mockReset();
    mockGetEntityFacets.mockRejectedValue(new Error('boom'));
    const { getByTestId } = renderPicker();

    await waitFor(() => {
      expect(getByTestId('tag-picker')).toHaveTextContent('Tags:');
    });
  });

  it('sets and clears the tag filter on change', async () => {
    renderPicker();
    await waitFor(() => expect(lastOnChange).toBeDefined());

    act(() => {
      lastOnChange?.(['alpha']);
    });
    expect(mockUpdateFilters).toHaveBeenLastCalledWith({
      tags: expect.any(EntityTagFilter),
    });

    act(() => {
      lastOnChange?.([]);
    });
    expect(mockUpdateFilters).toHaveBeenLastCalledWith({ tags: undefined });
  });
});
