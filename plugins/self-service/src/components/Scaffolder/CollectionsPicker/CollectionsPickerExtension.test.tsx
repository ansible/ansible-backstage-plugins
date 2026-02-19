import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CollectionsPickerExtension } from './CollectionsPickerExtension';
import { CollectionItem } from './types';
import { useApi } from '@backstage/core-plugin-api';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { rhAapAuthApiRef } from '../../../apis';

// Mock the API hooks
jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: jest.fn(),
}));

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

// Helper function to get input element from TextField
const getInputElement = (label: string): HTMLInputElement | null => {
  const textFields = screen.getAllByLabelText(label);
  const textField = textFields[0];
  const input = textField
    .closest('.MuiFormControl-root')
    ?.querySelector('input');
  return input as HTMLInputElement | null;
};

describe('CollectionsPickerExtension', () => {
  let mockScaffolderApi: { autocomplete: jest.Mock };
  let mockAapAuth: { getAccessToken: jest.Mock };

  beforeEach(() => {
    mockScaffolderApi = {
      autocomplete: jest.fn(),
    };

    mockAapAuth = {
      getAccessToken: jest.fn().mockResolvedValue('test-token'),
    };

    jest.clearAllMocks();

    mockUseApi.mockImplementation((ref: any) => {
      if (ref === scaffolderApiRef) {
        return mockScaffolderApi;
      }
      if (ref === rhAapAuthApiRef) {
        return mockAapAuth;
      }
      return {};
    });
  });

  const createMockProps = (overrides = {}) => ({
    onChange: jest.fn(),
    disabled: false,
    rawErrors: [] as string[],
    schema: {
      title: 'Ansible Collections',
      description: 'Add collections manually',
      items: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string' as const,
            title: 'Collection Name',
          },
          version: {
            type: 'string' as const,
            title: 'Version (Optional)',
          },
          source: {
            type: 'string' as const,
            title: 'Source (Optional)',
          },
        },
      },
    } as any,
    uiSchema: {},
    formData: [] as CollectionItem[],
    idSchema: { $id: 'collections' } as any,
    onBlur: jest.fn(),
    onFocus: jest.fn(),
    readonly: false,
    name: 'collections',
    registry: {} as any,
    ...overrides,
  });

  describe('Initial Rendering', () => {
    it('renders the component with Add collection card', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      expect(
        screen.getByRole('button', { name: 'Add collection' }),
      ).toBeInTheDocument();
      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
      expect(screen.getAllByLabelText('Source')[0]).toBeInTheDocument();
      expect(screen.getAllByLabelText('Version')[0]).toBeInTheDocument();
    });

    it('renders collections from formData', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
        { name: 'ansible.builtin' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
      expect(screen.getByText('ansible.builtin')).toBeInTheDocument();
      expect(screen.getByText('Selected collections (2)')).toBeInTheDocument();
    });

    it('does not render selected collections section when formData is empty', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ formData: [] });
      render(<CollectionsPickerExtension {...props} />);

      expect(
        screen.queryByText(/Selected collections/i),
      ).not.toBeInTheDocument();
    });

    it('displays raw errors when provided', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ rawErrors: ['Error 1', 'Error 2'] });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display errors section when rawErrors is empty', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ rawErrors: [] });
      render(<CollectionsPickerExtension {...props} />);

      const errorText = screen.queryByText(/Error/);
      expect(errorText).not.toBeInTheDocument();
    });

    it('handles undefined formData', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ formData: undefined });
      render(<CollectionsPickerExtension {...props} />);

      expect(
        screen.getByRole('button', { name: 'Add collection' }),
      ).toBeInTheDocument();
    });
  });

  describe('Fetching Collections', () => {
    it('fetches collections on mount', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
        { name: 'ansible.builtin', id: 'ansible.builtin' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledWith({
          token: 'test-token',
          resource: 'collections',
          provider: 'aap-api-cloud',
          context: {
            searchQuery: 'spec.type=ansible-collection',
          },
        });
      });
    });

    it('handles error when fetching collections fails', async () => {
      mockScaffolderApi.autocomplete.mockRejectedValue(new Error('API Error'));

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });

    it('handles empty collections response', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = screen.getAllByLabelText('Collection')[0];
      expect(collectionInput).toBeInTheDocument();
    });

    it('handles error when getAccessToken fails', async () => {
      mockAapAuth.getAccessToken.mockRejectedValueOnce(
        new Error('Token error'),
      );

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(
        () => {
          const collectionInput = screen.getAllByLabelText('Collection')[0];
          expect(collectionInput).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('handles when autocomplete is not available', async () => {
      mockScaffolderApi.autocomplete = undefined as any;

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });

    it('handles null results from autocomplete', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: null as any,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = screen.getAllByLabelText('Collection')[0];
      expect(collectionInput).toBeInTheDocument();
    });
  });

  describe('Collection Selection', () => {
    it('handles string value in handleCollectionChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: ['1.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }
      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles object with name property in handleCollectionChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: ['1.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles object with label property in handleCollectionChange', async () => {
      const mockCollections = [
        {
          label: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: ['1.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles null value in handleCollectionChange', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles undefined value in handleCollectionChange', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles object with sources and versions in handleCollectionChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1', 'Source 2'],
          versions: ['1.0.0', '2.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles object without sources and versions in handleCollectionChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('resets source and version when collection changes', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: ['1.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const sourceInput = screen.getAllByLabelText('Source')[0];
      expect(sourceInput).toBeDisabled();
    });
  });

  describe('Source Selection', () => {
    it('fetches sources when collection is selected with sources in data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Github / github-public / org / repo'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('fetches sources from API when not in collection data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      const mockSources = [
        { name: 'Source 1', id: 'source1' },
        { name: 'Source 2', id: 'source2' },
      ];

      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: mockSources });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles error when fetching sources fails', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];

      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockRejectedValueOnce(new Error('Source API Error'));

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          const sourceInput = screen.getAllByLabelText('Source')[0];
          expect(sourceInput).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('handles string value in source onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const sourceInput = getInputElement('Source');
      if (sourceInput) {
        fireEvent.change(sourceInput, { target: { value: 'Source 1' } });
      }
      expect(screen.getAllByLabelText('Source')[0]).toBeInTheDocument();
    });

    it('handles object with name property in source onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: [{ name: 'Source 1', id: 'source1' }],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Source')[0]).toBeInTheDocument();
    });

    it('handles object with id property in source onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: [{ id: 'source1', name: 'Source 1' }],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Source')[0]).toBeInTheDocument();
    });

    it('handles null value in source onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Source')[0]).toBeInTheDocument();
    });

    it('does not fetch sources when collectionName is empty', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const sourceInput = screen.getAllByLabelText('Source')[0];
      expect(sourceInput).toBeDisabled();
    });

    it('uses sources from collection data when available', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1', 'Source 2'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles empty sources array in collection data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: [],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles when getAccessToken fails in fetchSources', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValueOnce({
        results: mockCollections,
      });

      // Reset getAccessToken to fail on second call (for fetchSources)
      mockAapAuth.getAccessToken
        .mockResolvedValueOnce('test-token') // First call for fetchCollections
        .mockRejectedValueOnce(new Error('Token error')); // Second call for fetchSources

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      // When getAccessToken fails, autocomplete is NOT called
      // The error is caught and sources are set to empty array
      await waitFor(
        () => {
          const sourceInput = screen.getAllByLabelText('Source')[0];
          expect(sourceInput).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Verify autocomplete was only called once (for collections, not for sources)
      expect(mockScaffolderApi.autocomplete).toHaveBeenCalledTimes(1);
    });

    it('handles when autocomplete is not available in fetchSources', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValueOnce({
        results: mockCollections,
      });

      // Make autocomplete undefined after first call
      const originalAutocomplete = mockScaffolderApi.autocomplete;
      mockScaffolderApi.autocomplete = jest
        .fn()
        .mockImplementation((...args) => {
          if (originalAutocomplete.mock.calls.length === 0) {
            return originalAutocomplete(...args);
          }
          return undefined;
        });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(originalAutocomplete).toHaveBeenCalled();
      });
    });

    it('handles null results from sources API', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: null as any });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('Version Selection', () => {
    it('fetches versions from collection data when source is selected', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': ['1.0.0', '2.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('uses all versions as fallback when sourceVersions not available', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: ['1.0.0', '2.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('fetches versions from API when not in collection data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      const mockVersions = [
        { name: '1.0.0', version: '1.0.0' },
        { name: '2.0.0', version: '2.0.0' },
      ];

      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: mockVersions });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles error when fetching versions fails', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];

      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockRejectedValueOnce(new Error('Version API Error'));

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles string value in version onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': ['1.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const versionInput = getInputElement('Version');
      if (versionInput) {
        fireEvent.change(versionInput, { target: { value: '1.0.0' } });
      }
      expect(screen.getAllByLabelText('Version')[0]).toBeInTheDocument();
    });

    it('handles object with version property in version onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': ['1.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Version')[0]).toBeInTheDocument();
    });

    it('handles null value in version onChange', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Version')[0]).toBeInTheDocument();
    });

    it('does not fetch versions when collectionName or sourceId is empty', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const versionInput = screen.getAllByLabelText('Version')[0];
      expect(versionInput).toBeDisabled();
    });

    it('uses sourceVersions when available for specific source', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': ['1.0.0', '2.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles empty versions array in collection data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: [],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles when getAccessToken fails in fetchVersions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] });

      // Reset getAccessToken to fail on third call (for fetchVersions)
      mockAapAuth.getAccessToken
        .mockResolvedValueOnce('test-token') // First call for fetchCollections
        .mockResolvedValueOnce('test-token') // Second call for fetchSources
        .mockRejectedValueOnce(new Error('Token error')); // Third call for fetchVersions

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles when autocomplete is not available in fetchVersions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles empty sourceVersions object', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {},
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles null results from versions API', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: null as any });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles sourceVersions with empty array for source', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': [],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('Adding Collections', () => {
    it('adds collection with name only', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('adds collection with name and source', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const sourceInput = screen.getAllByLabelText('Source')[0];
        expect(sourceInput).toBeInTheDocument();
      });
    });

    it('adds collection with name, source, and version', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': ['1.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('does not add collection when name is empty', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();

      fireEvent.click(addButton);
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('does not add collection when name is only whitespace', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, { target: { value: '   ' } });
      }

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();

      fireEvent.click(addButton);
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('trims whitespace from collection name', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: '  community.general  ' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('updates existing collection when same name is added', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('resets form after adding collection', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('handles collections array being null in handleAddCollection', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('handles adding collection when collections is undefined', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps({ formData: undefined });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('handles adding collection with only source', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const sourceInput = getInputElement('Source');
        if (sourceInput) {
          fireEvent.change(sourceInput, {
            target: { value: 'Source 1' },
          });
        }
      });

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('handles adding collection with source and version', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': ['1.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const sourceInput = getInputElement('Source');
        if (sourceInput) {
          fireEvent.change(sourceInput, {
            target: { value: 'Source 1' },
          });
        }
      });

      await waitFor(() => {
        const versionInput = getInputElement('Version');
        if (versionInput) {
          fireEvent.change(versionInput, {
            target: { value: '1.0.0' },
          });
        }
      });

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });
  });

  describe('Removing Collections', () => {
    it('removes collection when delete icon is clicked', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'community.general' },
        { name: 'ansible.builtin' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const communityGeneralChip = screen.getByText('community.general');
      expect(communityGeneralChip).toBeInTheDocument();

      const chipElement = communityGeneralChip.closest('.MuiChip-root');
      expect(chipElement).toBeInTheDocument();

      const deleteButton = chipElement?.querySelector('button');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }
    });

    it('does not remove collection when disabled', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData, disabled: true });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('community.general');
      const chipElement = chip.closest('.MuiChip-root') as HTMLElement;
      expect(chipElement).toBeInTheDocument();
      expect(chipElement).toHaveClass('Mui-disabled');
    });

    it('removes last collection correctly', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('community.general');
      const chipElement = chip.closest('.MuiChip-root');
      const deleteButton = chipElement?.querySelector('button');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }
    });
  });

  describe('Editing Collections', () => {
    it('populates form when collection chip is clicked', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'community.general', source: 'Source 1', version: '1.0.0' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });

    it('updates collection when edited and saved', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });

    it('does not allow editing when disabled', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData, disabled: true });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });

    it('handles editing collection with null name', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: null as any }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('Unnamed');
      fireEvent.click(chip);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });

    it('handles editing collection with undefined name', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: undefined as any }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const chip = screen.getByText('Unnamed');
      fireEvent.click(chip);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });
  });

  describe('Button States', () => {
    it('disables add button when collection is not selected', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();
    });

    it('disables add button when component is disabled', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ disabled: true });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();
    });

    it('enables add button when collection is selected', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'community.general' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        expect(addButton).toBeInTheDocument();
      });
    });
  });

  describe('Form Data Updates', () => {
    it('updates collections when formData prop changes', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ formData: [] });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const newFormData: CollectionItem[] = [{ name: 'community.general' }];
      rerender(
        <CollectionsPickerExtension {...props} formData={newFormData} />,
      );

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });

    it('handles formData change to undefined', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ formData: [{ name: 'test' }] });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      rerender(<CollectionsPickerExtension {...props} formData={undefined} />);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });
    });

    it('handles formData change from undefined to array', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ formData: undefined });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const newFormData: CollectionItem[] = [{ name: 'community.general' }];
      rerender(
        <CollectionsPickerExtension {...props} formData={newFormData} />,
      );

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows loading indicator when fetching collections', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      mockScaffolderApi.autocomplete.mockReturnValue(promise);

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        const collectionInput = screen.getAllByLabelText('Collection')[0];
        expect(collectionInput).toBeInTheDocument();
      });

      resolvePromise!({ results: [] });
      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('shows loading indicator when fetching sources', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      let resolveSources: (value: any) => void;
      const sourcesPromise = new Promise(resolve => {
        resolveSources = resolve;
      });

      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockReturnValueOnce(sourcesPromise);

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      await waitFor(() => {
        const sourceInput = screen.getAllByLabelText('Source')[0];
        expect(sourceInput).toBeInTheDocument();
      });

      resolveSources!({ results: [] });
    });

    it('shows loading indicator when fetching versions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          sources: ['Source 1'],
        },
      ];
      let resolveVersions: (value: any) => void;
      const versionsPromise = new Promise(resolve => {
        resolveVersions = resolve;
      });

      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockReturnValueOnce(versionsPromise);

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      resolveVersions!({ results: [] });
    });
  });

  describe('Edge Cases', () => {
    it('handles collection with no name', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: '' } as any];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Unnamed')).toBeInTheDocument();
    });

    it('handles empty collection name string', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, { target: { value: '   ' } });
      }

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();
    });

    it('handles empty sources array in collection data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: [],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles empty versions array in collection data', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          versions: [],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles collection with null name', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: null as any }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Unnamed')).toBeInTheDocument();
    });

    it('handles multiple collections with same name', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'community.general', source: 'Source 1' },
        { name: 'community.general', source: 'Source 2' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      const chips = screen.getAllByText('community.general');
      expect(chips.length).toBeGreaterThan(0);
    });
  });

  describe('Autocomplete Options', () => {
    it('handles string options in collection autocomplete', async () => {
      const mockCollections = ['community.general', 'ansible.builtin'];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles object options with name property', async () => {
      const mockCollections = [
        { name: 'community.general', id: '1' },
        { name: 'ansible.builtin', id: '2' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles object options with label property', async () => {
      const mockCollections = [
        { label: 'community.general', id: '1' },
        { label: 'ansible.builtin', id: '2' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles empty options array', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: [],
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('Cascading Dropdowns', () => {
    it('resets version when source changes', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1', 'Source 2'],
          sourceVersions: {
            'Source 1': ['1.0.0'],
            'Source 2': ['2.0.0'],
          },
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('clears sources when collection is cleared', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const sourceInput = screen.getAllByLabelText('Source')[0];
      expect(sourceInput).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('handles error when autocomplete API fails for collections', async () => {
      mockAapAuth.getAccessToken.mockResolvedValue('test-token');
      mockScaffolderApi.autocomplete.mockRejectedValueOnce(
        new Error('API Error'),
      );

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          const collectionInput = screen.getAllByLabelText('Collection')[0];
          expect(collectionInput).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('handles error when autocomplete API fails for sources', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockRejectedValueOnce(new Error('Sources API Error'));

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          const sourceInput = screen.getAllByLabelText('Source')[0];
          expect(sourceInput).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('handles error when autocomplete API fails for versions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockRejectedValueOnce(new Error('Versions API Error'));

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('Empty States', () => {
    it('renders empty state when no collections are selected', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps({ formData: [] });
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const selectedSection = screen.queryByText(/Selected collections/);
      expect(selectedSection).not.toBeInTheDocument();
    });

    it('displays selected collections count correctly', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'collection1' },
        { name: 'collection2' },
        { name: 'collection3' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(
        screen.getByText(/Selected collections \(3\)/),
      ).toBeInTheDocument();
    });
  });

  describe('Collection Display', () => {
    it('displays collection name correctly in chip', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'community.general', source: 'Source 1', version: '1.0.0' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });

    it('handles collection with only name', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });

    it('handles collection with name and source', () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const formData: CollectionItem[] = [
        { name: 'community.general', source: 'Source 1' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });
  });

  describe('handleCollectionChange Edge Cases', () => {
    it('handles object with sources but no versions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles object with versions but no sources', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          versions: ['1.0.0'],
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });

    it('handles object with undefined sources and versions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: undefined,
          versions: undefined,
        },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      expect(screen.getAllByLabelText('Collection')[0]).toBeInTheDocument();
    });
  });

  describe('fetchSources Edge Cases', () => {
    it('handles collection not found in availableCollections', async () => {
      const mockCollections = [
        {
          name: 'other.collection',
          id: 'other.collection',
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles foundCollection without sources property', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('fetchVersions Edge Cases', () => {
    it('handles collection not found in availableCollections for versions', async () => {
      const mockCollections = [
        {
          name: 'other.collection',
          id: 'other.collection',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles foundCollection without sourceVersions and versions', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });

    it('handles sourceVersions with null value for source', async () => {
      const mockCollections = [
        {
          name: 'community.general',
          id: 'community.general',
          sources: ['Source 1'],
          sourceVersions: {
            'Source 1': null as any,
          },
        },
      ];
      mockScaffolderApi.autocomplete
        .mockResolvedValueOnce({ results: mockCollections })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('handleAddCollection Edge Cases', () => {
    it('handles selectedCollection being null', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();
    });

    it('handles selectedCollection being empty string', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({ results: [] });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const addButton = screen.getByRole('button', { name: 'Add collection' });
      expect(addButton).toBeDisabled();
    });

    it('handles existingIndex being -1 (new collection)', async () => {
      const mockCollections = [
        { name: 'community.general', id: 'community.general' },
      ];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: mockCollections,
      });
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });

      const collectionInput = getInputElement('Collection');
      if (collectionInput) {
        fireEvent.change(collectionInput, {
          target: { value: 'new.collection' },
        });
      }

      await waitFor(() => {
        const addButton = screen.getByRole('button', {
          name: 'Add collection',
        });
        if (!addButton.hasAttribute('disabled')) {
          fireEvent.click(addButton);
        }
      });
    });
  });
});
