import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { scaffolderApiRef } from '@backstage/plugin-scaffolder-react';
import { SCMResourcePicker } from './SCMResourcePicker';

// Mock the Material-UI styles
jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
  makeStyles: () => () => ({
    formControl: {},
    noLabel: {},
    menuItemContent: {},
    typeLabel: {},
  }),
}));

describe('SCMResourcePicker', () => {
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
    name: 'test-scm-picker',
    rawErrors: [],
    errors: <></>,
    help: 'Select an SCM host',
    required: false,
    disabled: false,
    readonly: false,
    onBlur: jest.fn(),
    onFocus: jest.fn(),
    schema: {
      title: 'Source Control Host',
      description: 'Select a source control host',
      type: 'object' as const,
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

  const mockSCMIntegrations = [
    { id: 'github-0', host: 'github.com', type: 'github', name: 'github.com' },
    {
      id: 'github-1',
      host: 'ghe.example.net',
      type: 'github',
      name: 'ghe.example.net',
    },
    { id: 'gitlab-0', host: 'gitlab.com', type: 'gitlab', name: 'gitlab.com' },
  ];

  const renderComponent = (props = {}) => {
    const combinedProps = { ...defaultProps, ...props } as any;
    return render(
      <TestApiProvider apis={[[scaffolderApiRef, mockScaffolderApi]]}>
        <SCMResourcePicker {...combinedProps} />
      </TestApiProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockScaffolderApi.autocomplete.mockResolvedValue({
      results: mockSCMIntegrations,
    });
  });

  describe('Basic Rendering', () => {
    it('should render with default props', async () => {
      renderComponent();

      expect(screen.getByLabelText(/Source Control Host/i)).toBeInTheDocument();
      expect(
        screen.getByText('Select a source control host'),
      ).toBeInTheDocument();
    });

    it('should render with custom title', async () => {
      renderComponent({
        schema: {
          ...defaultProps.schema,
          title: 'Custom SCM Title',
        },
      });

      expect(screen.getByLabelText(/Custom SCM Title/i)).toBeInTheDocument();
    });

    it('should render with fallback title when not provided', async () => {
      renderComponent({
        schema: {
          ...defaultProps.schema,
          title: undefined,
        },
      });

      expect(screen.getByLabelText(/Source Control Host/i)).toBeInTheDocument();
    });

    it('should display help text', () => {
      renderComponent();
      expect(screen.getByText('Select an SCM host')).toBeInTheDocument();
    });
  });

  describe('API Integration', () => {
    it('should fetch SCM integrations on mount without requiring token', async () => {
      renderComponent();

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalledWith({
          token: '',
          resource: 'scm_integrations',
          provider: 'aap-api-cloud',
          context: {},
        });
      });
    });

    it('should handle API errors gracefully', async () => {
      mockScaffolderApi.autocomplete.mockRejectedValue(new Error('API Error'));

      renderComponent();

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
          apis={[[scaffolderApiRef, mockScaffolderApiWithoutAutocomplete]]}
        >
          <SCMResourcePicker {...defaultProps} />
        </TestApiProvider>,
      );

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Selection', () => {
    it('should call onChange when selecting an SCM host', async () => {
      const onChangeSpy = jest.fn();
      renderComponent({ onChange: onChangeSpy });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const select = screen.getByRole('button');
      fireEvent.mouseDown(select);

      await waitFor(() => {
        expect(screen.getByText('github.com')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('github.com'));

      expect(onChangeSpy).toHaveBeenCalledWith(mockSCMIntegrations[0]);
    });

    it('should auto-select when only one integration is available', async () => {
      const singleIntegration = [mockSCMIntegrations[0]];
      mockScaffolderApi.autocomplete.mockResolvedValue({
        results: singleIntegration,
      });

      const onChangeSpy = jest.fn();
      renderComponent({ onChange: onChangeSpy });

      await waitFor(() => {
        expect(onChangeSpy).toHaveBeenCalledWith(singleIntegration[0]);
      });
    });

    it('should display selected host from formData', async () => {
      const formData = { host: 'github.com', type: 'github' };
      renderComponent({ formData });

      await waitFor(() => {
        expect(mockScaffolderApi.autocomplete).toHaveBeenCalled();
      });
    });
  });

  describe('Form State', () => {
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
    it('should handle empty integrations array', async () => {
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

      await waitFor(() => {
        expect(
          screen.getByText('No SCM integrations found'),
        ).toBeInTheDocument();
      });
    });

    it('should handle undefined formData', async () => {
      await act(async () => {
        renderComponent({ formData: undefined });
      });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle null formData', async () => {
      await act(async () => {
        renderComponent({ formData: null });
      });

      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('SCM Type Display', () => {
    it('should display both GitHub and GitLab hosts with type indicators', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });

      const select = screen.getByRole('button');
      fireEvent.mouseDown(select);

      await waitFor(() => {
        expect(screen.getByText('github.com')).toBeInTheDocument();
        expect(screen.getByText('ghe.example.net')).toBeInTheDocument();
        expect(screen.getByText('gitlab.com')).toBeInTheDocument();
      });
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
