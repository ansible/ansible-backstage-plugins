import {
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { EEFileNamePickerExtension } from './EEFileNamePickerExtension';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { TestApiProvider } from '@backstage/test-utils';

jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
  makeStyles: () => () => ({
    container: 'container',
    warningBox: 'warningBox',
    loadingBox: 'loadingBox',
  }),
}));

const createMockCatalogApi = (overrides = {}) => ({
  getEntities: jest.fn(),
  getEntityByRef: jest.fn(),
  getEntitiesByRefs: jest.fn(),
  queryEntities: jest.fn(),
  refreshEntity: jest.fn(),
  getEntityAncestors: jest.fn(),
  getEntityFacets: jest.fn(),
  validateEntity: jest.fn(),
  addLocation: jest.fn(),
  getLocationByRef: jest.fn(),
  getLocationById: jest.fn(),
  removeEntityByUid: jest.fn(),
  ...overrides,
});

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  required: false,
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'EE File Name',
    description: 'Name of the Execution Environment file.',
  } as any,
  uiSchema: {
    'ui:help': 'Specify the filename for the EE definition file.',
  } as any,
  formData: '',
  idSchema: { $id: 'eeFileName' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'eeFileName',
  registry: {} as any,
  ...overrides,
});

describe('EEFileNamePickerExtension', () => {
  let mockCatalogApi: ReturnType<typeof createMockCatalogApi>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockCatalogApi = createMockCatalogApi();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const renderWithProviders = (props: any) => {
    return render(
      <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
        <EEFileNamePickerExtension {...props} />
      </TestApiProvider>,
    );
  };

  // ... all other describe blocks remain the same until Format Validation ...

  describe('Format Validation', () => {
    it('shows error when name ends with .yaml', async () => {
      const props = createMockProps({ formData: 'test-ee.yaml' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name ends with .yml', async () => {
      const props = createMockProps({ formData: 'test-ee.yml' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name ends with .YAML (case insensitive)', async () => {
      const props = createMockProps({ formData: 'test-ee.YAML' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name ends with .YML (case insensitive)', async () => {
      const props = createMockProps({ formData: 'test-ee.YML' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name starts with a separator', async () => {
      const props = createMockProps({ formData: '-test-ee' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name cannot start with a hyphen, underscore, or dot/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name ends with a separator', async () => {
      const props = createMockProps({ formData: 'test-ee-' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name cannot end with a hyphen, underscore, or dot/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name has consecutive separators', async () => {
      const props = createMockProps({ formData: 'test--ee' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name cannot contain consecutive hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name is too long (over 63 characters)', async () => {
      const longName = 'a'.repeat(64);
      const props = createMockProps({ formData: longName });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Name must be at most 63 characters long/i),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('shows error when name contains invalid characters', async () => {
      const props = createMockProps({ formData: 'test@ee' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('does not check catalog when format validation fails', async () => {
      const props = createMockProps({ formData: 'test-ee.yaml' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });

    it('clears format error when valid name is entered', async () => {
      const props = createMockProps({ formData: 'test-ee.yaml' });
      const { rerender } = renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).toBeInTheDocument();
      });

      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="test-ee" />
        </TestApiProvider>,
      );

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.queryByText(
            /Name must consist of alphanumeric characters \[a-z0-9A-Z\] separated by hyphens, underscores, or dots/i,
          ),
        ).not.toBeInTheDocument();
      });
    });

    it('shows format error in error state on TextField', async () => {
      const props = createMockProps({ formData: 'test-ee.yaml' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not show loading indicator when format validation fails', async () => {
      const props = createMockProps({ formData: 'test-ee.yaml' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.queryByText('Checking catalog...'),
        ).not.toBeInTheDocument();
      });
    });

    it('does not show existing entity warning when format validation fails', async () => {
      const props = createMockProps({ formData: 'test-ee.yaml' });
      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/already exists in the catalog/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Cleanup', () => {
    it('cleans up timeout on unmount', () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      const { unmount } = renderWithProviders(props);

      unmount();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
    });
  });
});