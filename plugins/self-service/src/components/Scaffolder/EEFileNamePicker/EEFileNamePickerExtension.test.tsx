import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { EEFileNamePickerExtension } from './EEFileNamePickerExtension';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { TestApiProvider } from '@backstage/test-utils';
import { Entity } from '@backstage/catalog-model';

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

const createMockEntity = (
  name: string,
  title?: string,
  specName?: string,
): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: name.toLowerCase(),
    title: title || name,
  },
  spec: {
    type: 'execution-environment',
    name: specName || name,
  },
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

  describe('Initial Rendering', () => {
    it('renders the text field with default title', () => {
      const props = createMockProps();
      renderWithProviders(props);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getAllByText('EE File Name').length).toBeGreaterThan(0);
    });

    it('renders custom title from schema', () => {
      const props = createMockProps({
        schema: { title: 'Custom EE Name' },
      });
      renderWithProviders(props);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getAllByText('Custom EE Name').length).toBeGreaterThan(0);
    });

    it('renders with initial formData value', () => {
      const props = createMockProps({ formData: 'my-ee' });
      renderWithProviders(props);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('my-ee');
    });

    it('renders empty input when formData is empty', () => {
      const props = createMockProps({ formData: '' });
      renderWithProviders(props);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('shows required indicator when required is true', () => {
      const props = createMockProps({ required: true });
      renderWithProviders(props);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('required');
    });

    it('disables input when disabled is true', () => {
      const props = createMockProps({ disabled: true });
      renderWithProviders(props);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('shows error state when rawErrors is present', () => {
      const props = createMockProps({ rawErrors: ['This field is required'] });
      renderWithProviders(props);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Input Handling', () => {
    it('calls onChange when input value changes', () => {
      const props = createMockProps();
      renderWithProviders(props);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'test-ee' } });

      expect(props.onChange).toHaveBeenCalledWith('test-ee');
    });

    it('updates input value on change', () => {
      const props = createMockProps();
      const { rerender } = renderWithProviders(props);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'new-ee' } });

      expect(props.onChange).toHaveBeenCalledWith('new-ee');

      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="new-ee" />
        </TestApiProvider>,
      );

      const updatedInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(updatedInput.value).toBe('new-ee');
    });
  });

  describe('Catalog Entity Checking', () => {
    it('does not check catalog when input is empty', async () => {
      const props = createMockProps({ formData: '' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
      });
    });

    it('does not check catalog when input is only whitespace', async () => {
      const props = createMockProps({ formData: '   ' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      act(() => {
        jest.advanceTimersByTime(600);
      });

      await waitFor(() => {
        expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();
      });
    });

    it('checks catalog after debounce delay', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      expect(mockCatalogApi.getEntityByRef).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
      });
    });

    it('queries catalog with correct entity reference', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledWith(
          'Component:default/test-ee',
        );
      });
    });

    it('debounces multiple rapid input changes', async () => {
      const props = createMockProps();
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      const { rerender } = renderWithProviders(props);

      const input = screen.getByRole('textbox');

      fireEvent.change(input, { target: { value: 't' } });
      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="t" />
        </TestApiProvider>,
      );

      fireEvent.change(input, { target: { value: 'te' } });
      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="te" />
        </TestApiProvider>,
      );

      fireEvent.change(input, { target: { value: 'tes' } });
      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="tes" />
        </TestApiProvider>,
      );

      fireEvent.change(input, { target: { value: 'test' } });
      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="test" />
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
        expect(mockCatalogApi.getEntityByRef).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator while checking catalog', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });
      mockCatalogApi.getEntityByRef.mockReturnValue(promise);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Checking catalog...')).toBeInTheDocument();
      });

      await act(async () => {
        resolvePromise!(null);
        await Promise.resolve();
        await Promise.resolve();
      });
    });

    it('hides loading indicator after check completes', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.queryByText('Checking catalog...'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Existing Entity Warning', () => {
    it('shows warning when entity with matching name exists', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const existingEntity = createMockEntity('test-ee');
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /An execution environment definition with the name "test-ee" already exists/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it('shows warning when entity with matching title exists', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const existingEntity = createMockEntity('different-name', 'test-ee');
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /An execution environment definition with the name "different-name" already exists/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it('shows warning when entity with matching spec.name exists', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const existingEntity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'different-name',
        },
        spec: {
          type: 'execution-environment',
          name: 'test-ee',
        },
      };
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /An execution environment definition with the name "different-name" already exists/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it('displays correct warning message with entity name', async () => {
      const props = createMockProps({ formData: 'my-ee' });
      const existingEntity = createMockEntity('my-ee');
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            /An execution environment definition with the name "my-ee" already exists/i,
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            /If you proceed, your existing definition will be updated/i,
          ),
        ).toBeInTheDocument();
      });
    });

    it('does not show warning when no matching entity exists', async () => {
      const props = createMockProps({ formData: 'unique-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/already exists in the catalog/i),
        ).not.toBeInTheDocument();
      });
    });

    it('hides warning when input is cleared', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const existingEntity = createMockEntity('test-ee');
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      const { rerender } = renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/already exists in the catalog/i),
        ).toBeInTheDocument();
      });

      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="" />
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
          screen.queryByText(/already exists in the catalog/i),
        ).not.toBeInTheDocument();
      });
    });

    it('matches entity names case-insensitively', async () => {
      const props = createMockProps({ formData: 'TEST-EE' });
      const existingEntity = createMockEntity('test-ee');
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/already exists in the catalog/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message when catalog API fails', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(
        new Error('Catalog API unavailable'),
      );

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Catalog API unavailable')).toBeInTheDocument();
      });
    });

    it('displays generic error message for non-Error exceptions', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue('String error');

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText('Failed to check if entity exists in catalog'),
        ).toBeInTheDocument();
      });
    });

    it('clears error when input is cleared', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(
        new Error('Catalog API unavailable'),
      );

      const { rerender } = renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getByText('Catalog API unavailable')).toBeInTheDocument();
      });

      rerender(
        <TestApiProvider apis={[[catalogApiRef, mockCatalogApi]]}>
          <EEFileNamePickerExtension {...props} formData="" />
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
          screen.queryByText('Catalog API unavailable'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Multiple Entities', () => {
    it('finds entity when entity exists', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const existingEntity = createMockEntity('test-ee');
      mockCatalogApi.getEntityByRef.mockResolvedValue(existingEntity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/already exists in the catalog/i),
        ).toBeInTheDocument();
      });
    });

    it('does not show warning when entity name does not match any', async () => {
      const props = createMockProps({ formData: 'unique-ee' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/already exists in the catalog/i),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles entity with missing metadata.name', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: '',
        },
        spec: {
          type: 'execution-environment',
          name: 'test-ee',
        },
      };
      mockCatalogApi.getEntityByRef.mockResolvedValue(entity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/already exists in the catalog/i),
        ).toBeInTheDocument();
      });
    });

    it('handles entity with non-string spec.name', async () => {
      const props = createMockProps({ formData: 'test-ee' });
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-ee',
        },
        spec: {
          type: 'execution-environment',
          name: 123 as any,
        },
      };
      mockCatalogApi.getEntityByRef.mockResolvedValue(entity);

      renderWithProviders(props);

      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          screen.getByText(/already exists in the catalog/i),
        ).toBeInTheDocument();
      });
    });

    it('handles very long entity names', async () => {
      const longName = 'a'.repeat(100);
      const props = createMockProps({ formData: longName });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe(longName);
    });

    it('handles special characters in entity name', async () => {
      const props = createMockProps({ formData: 'test-ee_v2.0' });
      mockCatalogApi.getEntityByRef.mockRejectedValue(new Error('Not found'));

      renderWithProviders(props);

      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('test-ee_v2.0');
    });
  });

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
            /Name should not end with \.yaml or \.yml\. A \.yaml extension will automatically be added to the generated EE definition file name\./i,
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
            /Name should not end with \.yaml or \.yml\. A \.yaml extension will automatically be added to the generated EE definition file name\./i,
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
            /Name should not end with \.yaml or \.yml\. A \.yaml extension will automatically be added to the generated EE definition file name\./i,
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
            /Name should not end with \.yaml or \.yml\. A \.yaml extension will automatically be added to the generated EE definition file name\./i,
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
          screen.getByText(/should not end with \.yaml or \.yml/i),
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
          screen.queryByText(/should not end with \.yaml or \.yml/i),
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
