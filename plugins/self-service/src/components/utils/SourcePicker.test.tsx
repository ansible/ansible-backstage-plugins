import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { SourcePicker, TEMPLATE_SOURCE_ANNOTATION } from './SourcePicker';

const facetKey = `metadata.annotations.${TEMPLATE_SOURCE_ANNOTATION}`;

const mockCatalogApi = {
  getEntityFacets: jest.fn(),
};

const setupTwoStageMock = (sourceValues: { value: string }[]) => {
  mockCatalogApi.getEntityFacets
    .mockResolvedValueOnce({
      facets: {
        'spec.type': [
          { value: 'job-template' },
          { value: 'workflow-job-template' },
        ],
      },
    })
    .mockResolvedValueOnce({
      facets: { [facetKey]: sourceValues },
    });
};

const renderSourcePicker = async (
  selectedSources: string[] = [],
  onSourceChange = jest.fn(),
  syncKey = 0,
) => {
  await renderInTestApp(
    <TestApiProvider apis={[[catalogApiRef, mockCatalogApi as any]]}>
      <SourcePicker
        syncKey={syncKey}
        selectedSources={selectedSources}
        onSourceChange={onSourceChange}
      />
    </TestApiProvider>,
  );
};

describe('SourcePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with label', async () => {
    setupTwoStageMock([]);

    await renderSourcePicker();

    expect(screen.getByText('Source Type')).toBeInTheDocument();
  });

  it('fetches source facets excluding execution environment types', async () => {
    mockCatalogApi.getEntityFacets
      .mockResolvedValueOnce({
        facets: {
          'spec.type': [
            { value: 'job-template' },
            { value: 'ansible-execution-environment' },
          ],
        },
      })
      .mockResolvedValueOnce({
        facets: {
          [facetKey]: [{ value: 'aap-template' }],
        },
      });

    await renderSourcePicker();

    await waitFor(() => {
      expect(mockCatalogApi.getEntityFacets).toHaveBeenCalledTimes(2);
    });

    expect(mockCatalogApi.getEntityFacets).toHaveBeenNthCalledWith(1, {
      filter: { kind: 'Template' },
      facets: ['spec.type'],
    });

    expect(mockCatalogApi.getEntityFacets).toHaveBeenNthCalledWith(2, {
      filter: {
        kind: 'Template',
        'spec.type': ['job-template'],
      },
      facets: [facetKey],
    });
  });

  it('displays raw annotation values as options', async () => {
    setupTwoStageMock([{ value: 'aap-template' }, { value: 'scm' }]);

    await renderSourcePicker();

    const input = screen.getByRole('textbox');
    await userEvent.click(input);

    await waitFor(() => {
      const listbox = screen.getByRole('listbox');
      expect(within(listbox).getByText('aap-template')).toBeInTheDocument();
      expect(within(listbox).getByText('scm')).toBeInTheDocument();
    });
  });

  it('calls onSourceChange when a source is selected', async () => {
    const onSourceChange = jest.fn();
    setupTwoStageMock([{ value: 'aap-template' }]);

    await renderSourcePicker([], onSourceChange);

    const input = screen.getByRole('textbox');
    await userEvent.click(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    const option = screen.getByText('aap-template');
    await userEvent.click(option);

    expect(onSourceChange).toHaveBeenCalledWith(['aap-template']);
  });

  it('allows selecting multiple sources', async () => {
    const onSourceChange = jest.fn();
    setupTwoStageMock([
      { value: 'aap-template' },
      { value: 'scm' },
      { value: 'orchestrator' },
    ]);

    await renderSourcePicker([], onSourceChange);

    const input = screen.getByRole('textbox');
    await userEvent.click(input);

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('aap-template'));
    expect(onSourceChange).toHaveBeenCalledWith(['aap-template']);

    await userEvent.click(screen.getByText('orchestrator'));
    expect(onSourceChange).toHaveBeenLastCalledWith(['orchestrator']);
  });

  it('handles API errors gracefully', async () => {
    mockCatalogApi.getEntityFacets.mockRejectedValue(new Error('API error'));

    await renderSourcePicker();

    expect(screen.getByText('Source Type')).toBeInTheDocument();
  });

  it('refetches facets when syncKey changes', async () => {
    setupTwoStageMock([]);

    const { rerender } = await renderInTestApp(
      <TestApiProvider apis={[[catalogApiRef, mockCatalogApi as any]]}>
        <SourcePicker
          syncKey={0}
          selectedSources={[]}
          onSourceChange={jest.fn()}
        />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(mockCatalogApi.getEntityFacets).toHaveBeenCalledTimes(2);
    });

    setupTwoStageMock([]);

    rerender(
      <TestApiProvider apis={[[catalogApiRef, mockCatalogApi as any]]}>
        <SourcePicker
          syncKey={1}
          selectedSources={[]}
          onSourceChange={jest.fn()}
        />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(mockCatalogApi.getEntityFacets).toHaveBeenCalledTimes(4);
    });
  });
});
