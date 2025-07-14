import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { AAPResourcePicker } from './AAPResourcePicker';
import { rhAapAuthApiRef } from '../../../apis';

// Mock the Material-UI styles
jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
  makeStyles: () => () => ({
    formControl: {},
    chips: {},
    chip: {},
    noLabel: {},
  }),
}));

describe('AAPResourcePicker', () => {
  const mockRhAapAuthApi = {
    getAccessToken: jest.fn(),
  };

  const mockScaffolderApi = {
    autocomplete: jest.fn(),
    getTemplateParameterSchema: jest.fn(),
    listTasks: jest.fn(),
    listActions: jest.fn(),
    streamLogs: jest.fn(),
    getTask: jest.fn(),
    getIntegrationsList: jest.fn(),
  };

  const defaultProps = {
    name: 'test-resource-picker',
    rawErrors: [],
    errors: <></>,
    help: 'Select a resource',
    required: false,
    disabled: false,
    readonly: false,
    onBlur: jest.fn(),
    onFocus: jest.fn(),
    schema: {
      title: 'Test Resource',
      description: 'Select a test resource',
      resource: 'inventories',
      type: 'object' as const,
      idKey: 'id',
      nameKey: 'name',
    } as any,
    formData: undefined,
    onChange: jest.fn(),
    uiSchema: {},
    idSchema: { $id: 'test' },
    formContext: {},
    registry: {
      fields: {},
      widgets: {},
      definitions: {},
      rootSchema: {},
      formContext: {},
      templates: {
        ArrayFieldTemplate: () => null,
        ArrayFieldDescriptionTemplate: () => null,
        ArrayFieldItemTemplate: () => null,
        ArrayFieldTitleTemplate: () => null,
        BaseInputTemplate: () => null,
        DescriptionFieldTemplate: () => null,
        ErrorListTemplate: () => null,
        FieldErrorTemplate: () => null,
        FieldHelpTemplate: () => null,
        FieldTemplate: () => null,
        ObjectFieldTemplate: () => null,
        TitleFieldTemplate: () => null,
        UnsupportedFieldTemplate: () => null,
        WrapIfAdditionalTemplate: () => null,
        ButtonTemplates: {
          AddButton: () => null,
          CopyButton: () => null,
          MoveDownButton: () => null,
          MoveUpButton: () => null,
          RemoveButton: () => null,
          SubmitButton: () => null,
        },
      },
      schemaUtils: {
        retrieveSchema: jest.fn(),
        getDefaultFormState: jest.fn(),
        getDisplayLabel: jest.fn(),
        isObject: jest.fn(),
        isSelect: jest.fn(),
        isMultiSelect: jest.fn(),
        toIdSchema: jest.fn(),
        toPathSchema: jest.fn(),
        getClosestMatchingOption: jest.fn(),
        getFirstMatchingOption: jest.fn(),
        getMatchingOption: jest.fn(),
        isValid: jest.fn(),
        toErrorList: jest.fn(),
        createErrorHandler: jest.fn(),
        unwrapErrorHandler: jest.fn(),
        sanitizeDataForNewSchema: jest.fn(),
        getSubmitButtonOptions: jest.fn(),
        getUiOptions: jest.fn(),
        isConstant: jest.fn(),
        toConstant: jest.fn(),
        isFixedItems: jest.fn(),
        allowAdditionalItems: jest.fn(),
        optionsList: jest.fn(),
        getWidget: jest.fn(),
        hasWidget: jest.fn(),
        computeDefaults: jest.fn(),
        mergeObjects: jest.fn(),
        getValidator: jest.fn(),
        doesSchemaUtilsDiffer: jest.fn(),
        isFilesArray: jest.fn(),
        mergeValidationData: jest.fn(),
      },
      translateString: jest.fn((str: string) => str),
    },
  };

  const mockResources = [
    { id: 1, name: 'Inventory 1', description: 'Test inventory 1' },
    { id: 2, name: 'Inventory 2', description: 'Test inventory 2' },
    { id: 3, name: 'Inventory 3', description: 'Test inventory 3' },
  ];

  const renderComponent = (props = {}) => {
    const combinedProps = { ...defaultProps, ...props } as any;
    return render(
      <TestApiProvider
        apis={[
          [rhAapAuthApiRef, mockRhAapAuthApi],
          [scaffolderApiRef, mockScaffolderApi],
        ]}
      >
        <AAPResourcePicker {...combinedProps} />
      </TestApiProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');
    mockScaffolderApi.autocomplete.mockResolvedValue({
      results: mockResources,
    });
  });

  describe('Basic Rendering', () => {
    it('should render with default props', async () => {
      renderComponent();

      expect(screen.getByLabelText(/Test Resource/i)).toBeInTheDocument();
      expect(screen.getByText('Select a test resource')).toBeInTheDocument();
    });

    it('should render with custom title', async () => {
      renderComponent({
        schema: {
          ...defaultProps.schema,
          title: 'Custom Title',
        },
      });

      expect(screen.getByLabelText(/Custom Title/i)).toBeInTheDocument();
    });

    it('should render with fallback title when not provided', async () => {
      renderComponent({
        schema: {
          ...defaultProps.schema,
          title: undefined,
        },
      });

      expect(screen.getByLabelText(/Inventory/i)).toBeInTheDocument();
    });

    it('should display help text', () => {
      renderComponent();
      expect(screen.getByText('Select a resource')).toBeInTheDocument();
    });
  });

  describe('API Integration', () => {
    it('should fetch resources on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(mockRhAapAuthApi.getAccessToken).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledWith({
          token: 'test-token',
          resource: 'inventories',
          provider: 'aap-api-cloud',
        });
      });
    });

    it('should handle API errors gracefully', async () => {
      mockScaffolderApi.autocomplete.mockRejectedValue(new Error('API Error'));

      renderComponent();

      await waitFor(() => {
        expect(mockRhAapAuthApi.getAccessToken).toHaveBeenCalled();
      });

      // Should not crash and should show empty state
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });

    it('should handle missing autocomplete API', async () => {
      const mockScaffolderApiWithoutAutocomplete = {
        ...mockScaffolderApi,
        autocomplete: undefined,
      };

      render(
        <TestApiProvider
          apis={[
            [rhAapAuthApiRef, mockRhAapAuthApi],
            [scaffolderApiRef, mockScaffolderApiWithoutAutocomplete],
          ]}
        >
          <AAPResourcePicker {...defaultProps} />
        </TestApiProvider>,
      );

      await waitFor(() => {
        expect(mockRhAapAuthApi.getAccessToken).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Single Selection Mode', () => {
    it('should display selected value in single mode', async () => {
      const formData = mockResources[0];
      renderComponent({ formData });

      await waitFor(() => {
        expect(screen.getByDisplayValue('1')).toBeInTheDocument();
      });
    });

    it('should call onChange when selecting a resource in single mode', async () => {
      const onChangeSpy = jest.fn();
      renderComponent({ onChange: onChangeSpy });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const select = screen.getByRole('button');
      fireEvent.mouseDown(select);

      await waitFor(() => {
        expect(screen.getByText('Inventory 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Inventory 1'));

      expect(onChangeSpy).toHaveBeenCalledWith(mockResources[0]);
    });
  });

  describe('Multiple Selection Mode', () => {
    const multipleProps = {
      ...defaultProps,
      schema: {
        ...defaultProps.schema,
        type: 'array',
      },
    };

    it('should call onChange when selecting resources in multiple mode', async () => {
      const onChangeSpy = jest.fn();
      renderComponent({ ...multipleProps, onChange: onChangeSpy });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const select = screen.getByRole('button');
      fireEvent.mouseDown(select);

      await waitFor(() => {
        expect(screen.getByText('Inventory 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Inventory 1'));

      expect(onChangeSpy).toHaveBeenCalledWith([mockResources[0]]);
    });
  });

  describe('Form State', () => {
    it('should handle string formData', async () => {
      await act(async () => {
        renderComponent({ formData: 'test-string' });
      });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle number formData', async () => {
      await act(async () => {
        renderComponent({ formData: 123 });
      });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should show error state', async () => {
      await act(async () => {
        renderComponent({
          rawErrors: ['This field is required'],
        });
      });

      const formLabel =
        screen.getByRole('button').parentElement?.previousSibling;
      expect(formLabel).toHaveClass('Mui-error');
    });

    it('should show required state', async () => {
      await act(async () => {
        renderComponent({ required: true });
      });

      const formLabel =
        screen.getByRole('button').parentElement?.previousSibling;
      expect(formLabel).toHaveClass('Mui-required');
    });

    it('should show disabled state', async () => {
      await act(async () => {
        renderComponent({ disabled: true });
      });

      const formLabel =
        screen.getByRole('button').parentElement?.previousSibling;
      expect(formLabel).toHaveClass('Mui-disabled');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty formData', async () => {
      await act(async () => {
        renderComponent({ formData: null });
      });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle undefined formData', async () => {
      await act(async () => {
        renderComponent({ formData: undefined });
      });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle empty resources array', async () => {
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: [],
      });

      await act(async () => {
        renderComponent();
      });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const select = screen.getByRole('button');
      fireEvent.mouseDown(select);

      // Should not show any options
      expect(screen.queryByText('Inventory 1')).not.toBeInTheDocument();
    });

    it('should handle resources without expected keys', async () => {
      const malformedResources = [{ wrongId: 1, wrongName: 'Wrong Resource' }];

      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: malformedResources,
      });

      await act(async () => {
        renderComponent();
      });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      // Should handle gracefully even with wrong keys
      const select = screen.getByRole('button');
      fireEvent.mouseDown(select);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      await act(async () => {
        renderComponent();
      });

      const select = screen.getByRole('button');
      expect(select).toHaveAttribute('aria-labelledby');
    });

    it('should have proper form control structure', async () => {
      await act(async () => {
        renderComponent();
      });

      const formControl = screen
        .getByRole('button')
        .closest('.MuiFormControl-root');
      expect(formControl).toBeInTheDocument();
    });
  });
});
