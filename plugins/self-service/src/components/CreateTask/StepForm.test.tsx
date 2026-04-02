import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ✅ 1. Mock dependencies BEFORE importing StepForm
const mockGetAccessToken = jest.fn().mockResolvedValue('mock-token');

jest.mock('@backstage/core-plugin-api', () => ({
  useApi: jest.fn(() => ({
    getAccessToken: mockGetAccessToken,
  })),
  createApiRef: jest.fn(),
  createRouteRef: jest.fn(),
  attachComponentData: jest.fn(),
}));

jest.mock('@backstage/plugin-scaffolder', () => ({
  EntityPickerFieldExtension: () => <div>EntityPicker</div>,
}));

// Mock plugin-scaffolder-react
jest.mock('@backstage/plugin-scaffolder-react', () => ({
  SecretsContextProvider: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ScaffolderFieldExtensions: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useTemplateSecrets: () => ({
    secrets: { USER_OAUTH_TOKEN: 'mock-oauth-token' },
    setSecrets: jest.fn(),
  }),
}));

jest.mock('../../apis', () => ({
  rhAapAuthApiRef: {},
}));

jest.mock('./formExtraFields', () => ({
  formExtraFields: [
    { name: 'MockField', component: () => <div>MockField</div> },
  ],
}));

jest.mock('./ScaffolderFormWrapper', () => ({
  ScaffolderForm: (({ onSubmit, children }: any) => (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit({ formData: { testField: 'test-value' } });
      }}
    >
      <div>MockForm</div>
      {children}
      <button type="submit">Submit</button>
    </form>
  )) as React.FC,
}));

// ✅ 2. Import StepForm AFTER mocks
import { StepForm } from './StepForm';

const createScaffolderFormMock = (formData: any) => {
  return ({ onSubmit }: any) => (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit({ formData });
      }}
    >
      <div>MockForm</div>
      <button type="submit">Submit</button>
    </form>
  );
};

// 3. Test
describe('StepForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('mock-token');
  });

  const submitFunction = jest.fn().mockResolvedValue(undefined);

  describe('Basic functionality', () => {
    const steps = [
      {
        title: 'Step 1',
        schema: { properties: { name: { type: 'string', title: 'Name' } } },
      },
      {
        title: 'Step 2',
        schema: { properties: { age: { type: 'number', title: 'Age' } } },
      },
    ];

    it('renders steps and handles final submission', async () => {
      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => screen.getByText('MockForm'));
      fireEvent.click(screen.getByText('Submit'));

      const createButton = await screen.findByText('Create');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(submitFunction).toHaveBeenCalledWith(
          expect.objectContaining({
            testField: 'test-value',
            token: 'mock-token',
          }),
          { USER_OAUTH_TOKEN: 'mock-oauth-token' },
        );
      });
    });

    it('renders Back button on second step', async () => {
      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });
    });

    it('handles Back button click', async () => {
      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => screen.getByText('Back'));

      fireEvent.click(screen.getByText('Back'));

      await waitFor(() => {
        expect(screen.queryByText('Back')).not.toBeInTheDocument();
      });
    });
  });

  describe('Step filtering', () => {
    it('filters out steps with no properties', () => {
      const steps = [
        {
          title: 'Valid Step',
          schema: { properties: { name: { type: 'string' } } },
        },
        {
          title: 'Empty Step',
          schema: { properties: {} },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('Valid Step')).toBeInTheDocument();
      expect(screen.queryByText('Empty Step')).not.toBeInTheDocument();
    });

    it('filters out steps with only token field', () => {
      const steps = [
        {
          title: 'Valid Step',
          schema: {
            properties: { name: { type: 'string' }, token: { type: 'string' } },
          },
        },
        {
          title: 'Token Only Step',
          schema: { properties: { token: { type: 'string' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('Valid Step')).toBeInTheDocument();
      expect(screen.queryByText('Token Only Step')).not.toBeInTheDocument();
    });

    it('handles steps with missing schema', () => {
      const steps = [
        {
          title: 'Valid Step',
          schema: { properties: { name: { type: 'string' } } },
        },
        {
          title: 'No Schema Step',
          schema: {} as any,
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('Valid Step')).toBeInTheDocument();
      expect(screen.queryByText('No Schema Step')).not.toBeInTheDocument();
    });
  });

  describe('Auto-execution', () => {
    it('auto-executes when no filtered steps and no displayable fields', async () => {
      const steps = [
        {
          title: 'Token Only',
          schema: { properties: { token: { type: 'string' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      await waitFor(() => {
        expect(submitFunction).toHaveBeenCalledWith(
          expect.objectContaining({
            token: 'mock-token',
          }),
          undefined, // Auto-execute doesn't have access to secrets context
        );
      });
    });

    it('does not auto-execute when there are displayable fields with defaults', async () => {
      const steps = [
        {
          title: 'Step with Default',
          schema: {
            properties: {
              name: { type: 'string', default: 'Default Name' },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();

      expect(submitFunction).not.toHaveBeenCalled();
    });

    it('does not auto-execute when there are displayable fields with user values', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      const { rerender } = render(
        <StepForm steps={steps} submitFunction={submitFunction} />,
      );

      fireEvent.click(screen.getByText('Submit'));

      rerender(<StepForm steps={steps} submitFunction={submitFunction} />);

      await waitFor(() => {
        expect(screen.getByText('Review')).toBeInTheDocument();
      });
    });
  });

  describe('hasDisplayableFields logic', () => {
    it('detects fields with default values', () => {
      const steps = [
        {
          title: 'Step',
          schema: {
            properties: {
              name: { type: 'string', default: 'Default Value' },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });

    it('ignores token field in hasDisplayableFields check', () => {
      const steps = [
        {
          title: 'Step',
          schema: {
            properties: {
              token: { type: 'string', default: 'token-value' },
              name: { type: 'string' },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });
  });

  describe('getAllProperties with dependencies', () => {
    it('includes properties from dependencies oneOf', async () => {
      const steps = [
        {
          title: 'Step with Dependencies',
          schema: {
            properties: {
              type: { type: 'string', enum: ['A', 'B'] },
            },
            dependencies: {
              type: {
                oneOf: [
                  {
                    properties: {
                      type: { enum: ['A'] },
                      fieldA: { type: 'string', title: 'Field A' },
                    },
                  },
                  {
                    properties: {
                      type: { enum: ['B'] },
                      fieldB: { type: 'string', title: 'Field B' },
                    },
                  },
                ],
              },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        // Text appears in both stepper label and review table
        expect(
          screen.getAllByText('Step with Dependencies').length,
        ).toBeGreaterThan(0);
      });
    });
  });

  describe('extractUiSchema', () => {
    it('extracts ui: properties from schema', () => {
      const steps = [
        {
          title: 'Step',
          schema: {
            properties: {
              name: {
                type: 'string',
                'ui:widget': 'textarea',
                'ui:placeholder': 'Enter name',
              },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });

    it('extracts ui object from properties', () => {
      const steps = [
        {
          title: 'Step',
          schema: {
            properties: {
              name: {
                type: 'string',
                ui: {
                  widget: 'textarea',
                  placeholder: 'Enter name',
                },
              },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });

    it('handles properties without ui schema', () => {
      const steps = [
        {
          title: 'Step',
          schema: {
            properties: {
              name: { type: 'string' },
            },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });

    it('handles missing properties', () => {
      const steps = [
        {
          title: 'Step',
          schema: {
            properties: { name: { type: 'string' } },
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });
  });

  describe('getReviewValue', () => {
    it('displays array of strings as comma-separated', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { tags: { type: 'array', items: { type: 'string' } } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({ tags: ['tag1', 'tag2', 'tag3'] }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('tag1, tag2, tag3')).toBeInTheDocument();
      });
    });

    it('displays array of objects with name property', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              items: {
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            items: [{ name: 'Item 1' }, { name: 'Item 2' }, { name: 'Item 3' }],
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Item 1, Item 2, Item 3')).toBeInTheDocument();
      });
    });

    it('displays boolean true values as "Yes"', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              isActive: { type: 'boolean', title: 'Is Active' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ isActive: true }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Yes')).toBeInTheDocument();
      });
    });

    it('displays boolean false values as "No"', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              isActive: { type: 'boolean', title: 'Is Active' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ isActive: false }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('No')).toBeInTheDocument();
      });
    });

    it('displays object with name property', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { item: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({ item: { name: 'Test Item' } }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Test Item')).toBeInTheDocument();
      });
    });

    it('displays nested configuration object with formatted properties', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { advancedConfig: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            advancedConfig: {
              enableFeature: true,
              packages: ['package1', 'package2'],
              description: 'Test description',
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Enable Feature:/)).toBeInTheDocument();
        expect(screen.getByText(/Yes/)).toBeInTheDocument();
        expect(screen.getByText(/Packages:/)).toBeInTheDocument();
        expect(screen.getByText(/package1, package2/)).toBeInTheDocument();
        expect(screen.getByText(/Description:/)).toBeInTheDocument();
        expect(screen.getByText(/Test description/)).toBeInTheDocument();
      });
    });

    it('displays empty nested object as "None configured"', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { advancedConfig: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            advancedConfig: {
              enableFeature: false,
              packages: [],
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('None configured')).toBeInTheDocument();
      });
    });

    it('displays nested object with base64 file content decoded', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { config: { type: 'object' } },
          },
        },
      ];

      const fileContent = 'file content here';
      const base64Content = btoa(fileContent);

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            config: {
              uploadedFile: `data:text/plain;base64,${base64Content}`,
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Uploaded File:/)).toBeInTheDocument();
        expect(screen.getByText('file content here')).toBeInTheDocument();
      });
    });

    it('filters out false boolean values in nested objects', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { settings: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            settings: {
              enableA: true,
              enableB: false,
              description: 'test value',
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Enable A:/)).toBeInTheDocument();
        expect(screen.queryByText(/Enable B:/)).not.toBeInTheDocument();
        expect(screen.getByText(/Description:/)).toBeInTheDocument();
      });
    });

    it('filters out undefined and null values in nested objects', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { config: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            config: {
              validField: 'has value',
              undefinedField: undefined,
              nullField: null,
              emptyField: '',
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Valid Field:/)).toBeInTheDocument();
        expect(screen.getByText('has value')).toBeInTheDocument();
        expect(screen.queryByText(/Undefined Field:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Null Field:/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Empty Field:/)).not.toBeInTheDocument();
      });
    });

    it('displays nested object with array of objects without name property', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { buildSteps: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            buildSteps: {
              steps: [
                { stepType: 'prepend_base', commands: ['RUN apt-get update'] },
                { stepType: 'append_final', commands: ['RUN cleanup'] },
              ],
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Steps:/)).toBeInTheDocument();
        expect(screen.getByText(/stepType.*prepend_base/)).toBeInTheDocument();
      });
    });

    it('displays nested object with mixed array elements', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { mixedConfig: { type: 'object' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({
            mixedConfig: {
              items: [42, 'string value', { id: 1 }],
            },
          }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/Items:/)).toBeInTheDocument();
        expect(screen.getByText(/42, string value/)).toBeInTheDocument();
      });
    });

    it('handles empty/null values in review', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              name: { type: 'string' },
              empty: { type: 'string' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({ name: 'Test', empty: '' }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Test')).toBeInTheDocument();
        expect(screen.queryByText('empty')).not.toBeInTheDocument();
      });
    });

    it('handles empty arrays in review', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              tags: { type: 'array' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ tags: [] }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.queryByText('tags')).not.toBeInTheDocument();
      });
    });

    it('decodes and displays base64-encoded file content', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              fileContent: { type: 'string', title: 'Uploaded File' },
            },
          },
        },
      ];

      const fileContent = 'Hello, World!';
      const base64Content = btoa(fileContent);
      const dataUrl = `data:text/plain;base64,${base64Content}`;

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ fileContent: dataUrl }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Hello, World!')).toBeInTheDocument();
        expect(
          screen.queryByText(/data:text\/plain;base64/),
        ).not.toBeInTheDocument();
      });
    });

    it('displays regular string values normally (not base64)', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              description: { type: 'string', title: 'Description' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({ description: 'A regular description' }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('A regular description')).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('handles submit function error', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const errorSubmitFunction = jest
        .fn()
        .mockRejectedValue(new Error('Submit failed'));

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={errorSubmitFunction} />);

      fireEvent.click(screen.getByText('Submit'));
      const createButton = await screen.findByText('Create');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(errorSubmitFunction).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });

    it('handles auto-execution error', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const errorSubmitFunction = jest
        .fn()
        .mockRejectedValue(new Error('Auto-execute failed'));

      const steps = [
        {
          title: 'Token Only',
          schema: { properties: { token: { type: 'string' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={errorSubmitFunction} />);

      await waitFor(() => {
        expect(errorSubmitFunction).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Review step', () => {
    it('shows step titles in review', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string', title: 'Name' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        const reviewStepTitle = screen
          .getAllByText('Step 1')
          .find(el => el.tagName === 'STRONG');
        expect(reviewStepTitle).toBeInTheDocument();
      });
    });

    it('uses property title as label when available', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              name: { type: 'string', title: 'Full Name' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ name: 'John Doe' }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Full Name')).toBeInTheDocument();
      });
    });

    it('uses property key as label when title not available', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              name: { type: 'string' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ name: 'John Doe' }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('name')).toBeInTheDocument();
      });
    });

    it('shows None when a step is skipped without any values', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              name: { type: 'string', title: 'Name' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({}));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('None')).toBeInTheDocument();
      });
    });
  });

  describe('allOf and nested object support', () => {
    it('extracts uiSchema from allOf and nested objects, and includes allOf properties in review', async () => {
      let capturedUiSchema: any;
      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(({ uiSchema, onSubmit, children }: any) => {
          capturedUiSchema = uiSchema;
          return (
            <form
              onSubmit={e => {
                e.preventDefault();
                onSubmit({
                  formData: { name: 'test', conditionalField: 'value' },
                });
              }}
            >
              <div>MockForm</div>
              {children}
              <button type="submit">Submit</button>
            </form>
          );
        });

      const fieldOrder = ['name', 'config', 'conditionalField', '*'];
      const steps = [
        {
          title: 'Step',
          schema: {
            'ui:order': fieldOrder,
            properties: {
              name: { type: 'string', title: 'Original' },
              emptyObj: { type: 'object' },
              config: {
                type: 'object',
                'ui:title': 'Config',
                properties: {
                  flag: { type: 'boolean', 'ui:help': 'Toggle' },
                },
                dependencies: {
                  flag: {
                    oneOf: [
                      {
                        properties: {
                          flag: { const: true },
                          depField: {
                            type: 'string',
                            'ui:field': 'DepPicker',
                          },
                        },
                      },
                    ],
                  },
                },
                allOf: [
                  {
                    then: {
                      properties: {
                        nestedAllOf: {
                          type: 'string',
                          'ui:field': 'AllOfPicker',
                        },
                      },
                    },
                  },
                ],
              },
            },
            allOf: [
              {
                then: {
                  properties: {
                    conditionalField: {
                      type: 'string',
                      title: 'Conditional',
                      'ui:field': 'PackagesPicker',
                    },
                    name: { type: 'string', title: 'Overridden' },
                  },
                },
              },
              { if: { properties: { name: { const: 'x' } } } },
              { then: {} },
            ],
          },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(capturedUiSchema['ui:order']).toEqual(fieldOrder);
      expect(capturedUiSchema.emptyObj).toBeUndefined();
      expect(capturedUiSchema.conditionalField).toEqual({
        'ui:field': 'PackagesPicker',
      });
      expect(capturedUiSchema.config).toEqual({
        'ui:title': 'Config',
        flag: { 'ui:help': 'Toggle' },
        depField: { 'ui:field': 'DepPicker' },
        nestedAllOf: { 'ui:field': 'AllOfPicker' },
      });

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Conditional')).toBeInTheDocument();
        expect(screen.getByText('Original')).toBeInTheDocument();
        expect(screen.queryByText('Overridden')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge cases', () => {
    it('handles no steps', () => {
      render(<StepForm steps={[]} submitFunction={submitFunction} />);

      expect(screen.getByText('Review')).toBeInTheDocument();
    });

    it('shows all steps completed message when activeStep exceeds steps', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));
      await waitFor(() => screen.getByText('Create'));
      fireEvent.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(submitFunction).toHaveBeenCalled();
      });
    });
  });

  describe('SessionStorage persistence', () => {
    const storageKey = 'test-namespace/test-template';
    // Match the actual storage key format used in the component
    const formDataKey = `scaffolder-form-data-${storageKey}`;
    const activeStepKey = `scaffolder-active-step-${storageKey}`;
    const oauthPendingKey = 'scaffolder-oauth-pending';

    beforeEach(() => {
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it('restores form data from sessionStorage when OAuth is pending', () => {
      const savedFormData = { name: 'Restored Name', age: 30 };
      sessionStorage.setItem(oauthPendingKey, 'true');
      sessionStorage.setItem(formDataKey, JSON.stringify(savedFormData));
      sessionStorage.setItem(activeStepKey, '1');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string', title: 'Name' } } },
        },
        {
          title: 'Step 2',
          schema: { properties: { age: { type: 'number', title: 'Age' } } },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Should have cleared the OAuth pending flag
      expect(sessionStorage.getItem(oauthPendingKey)).toBeNull();

      // Should be on step 2 (restored active step) - Back button is visible
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('persists form data to sessionStorage when storageKey is provided', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Submit the form to update formData
      fireEvent.click(screen.getByText('Submit'));

      // Verify setItem was called for formData
      expect(setItemSpy).toHaveBeenCalledWith(formDataKey, expect.any(String));

      setItemSpy.mockRestore();
    });

    it('does not persist schema-marked secret fields to sessionStorage', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              repo: { type: 'string' },
              apiKey: { type: 'string', 'ui:field': 'Secret' },
            },
          },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
          initialFormData={{ repo: 'my-repo', apiKey: 'top-secret' }}
        />,
      );

      await waitFor(() => {
        const raw = sessionStorage.getItem(formDataKey);
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw!);
        expect(parsed.repo).toBe('my-repo');
        expect(parsed.apiKey).toBeUndefined();
      });
    });

    it('persists active step to sessionStorage when storageKey is provided', () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
        {
          title: 'Step 2',
          schema: { properties: { age: { type: 'number' } } },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Submit the form to go to next step
      fireEvent.click(screen.getByText('Submit'));

      // Verify setItem was called for active step
      expect(setItemSpy).toHaveBeenCalledWith(activeStepKey, '1');

      setItemSpy.mockRestore();
    });

    it('clears sessionStorage on unmount when OAuth is not pending', () => {
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      const { unmount } = render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Unmount the component
      unmount();

      // Storage should be cleared
      expect(removeItemSpy).toHaveBeenCalledWith(formDataKey);
      expect(removeItemSpy).toHaveBeenCalledWith(activeStepKey);

      removeItemSpy.mockRestore();
    });

    it('does not clear sessionStorage on unmount when OAuth is pending', () => {
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      const { unmount } = render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Set OAuth pending AFTER the component has mounted
      // This simulates ScmAuthPicker setting the flag before triggering OAuth
      sessionStorage.setItem(oauthPendingKey, 'true');

      // Clear the spy to ignore any previous calls
      removeItemSpy.mockClear();

      // Unmount the component
      unmount();

      // removeItem should NOT have been called for form/step keys
      expect(removeItemSpy).not.toHaveBeenCalledWith(formDataKey);
      expect(removeItemSpy).not.toHaveBeenCalledWith(activeStepKey);

      removeItemSpy.mockRestore();
    });

    it('clears persisted form data after successful submission', async () => {
      const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Submit the form
      fireEvent.click(screen.getByText('Submit'));

      // Wait for review step
      const createButton = await screen.findByText('Create');

      // Final submit
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(submitFunction).toHaveBeenCalled();
      });

      // Storage should be cleared after successful submission
      expect(removeItemSpy).toHaveBeenCalledWith(formDataKey);
      expect(removeItemSpy).toHaveBeenCalledWith(activeStepKey);

      removeItemSpy.mockRestore();
    });

    it('restores active step 0 when stored step is invalid', () => {
      sessionStorage.setItem(oauthPendingKey, 'true');
      sessionStorage.setItem(activeStepKey, 'invalid-step');

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      // Should be on step 1 (default)
      expect(screen.queryByText('Back')).not.toBeInTheDocument();
    });

    it('handles sessionStorage errors gracefully', () => {
      const getItemSpy = jest
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('Storage error');
        });

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      // Should not throw
      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          storageKey={storageKey}
        />,
      );

      expect(screen.getByText('MockForm')).toBeInTheDocument();

      getItemSpy.mockRestore();
    });
  });

  describe('Form change handling', () => {
    it('updates form data on form change via onChange', async () => {
      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(({ onChange, onSubmit, children }: any) => {
          return (
            <form
              onSubmit={e => {
                e.preventDefault();
                onSubmit({ formData: { testField: 'test-value' } });
              }}
            >
              <div>MockForm</div>
              {children}
              <button type="submit">Submit</button>
              <button
                type="button"
                onClick={() => onChange?.({ formData: { name: 'changed' } })}
              >
                Change
              </button>
            </form>
          );
        });

      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string' } } },
        },
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      // Simulate onChange being called
      fireEvent.click(screen.getByText('Change'));

      // The form data should be updated (verified through submission)
      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Review')).toBeInTheDocument();
      });
    });
  });

  describe('Initial form data', () => {
    it('applies initial form data when provided', () => {
      const steps = [
        {
          title: 'Step 1',
          schema: { properties: { name: { type: 'string', title: 'Name' } } },
        },
      ];

      render(
        <StepForm
          steps={steps}
          submitFunction={submitFunction}
          initialFormData={{ name: 'Initial Name' }}
        />,
      );

      expect(screen.getByText('MockForm')).toBeInTheDocument();
    });
  });

  describe('extractProperties edge cases', () => {
    it('handles step with no schema', () => {
      const steps = [
        {
          title: 'Valid Step',
          schema: { properties: { name: { type: 'string' } } },
        },
        {
          title: 'No Schema',
        } as any,
      ];

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      expect(screen.getByText('Valid Step')).toBeInTheDocument();
    });
  });

  describe('formatValueForDisplay edge cases', () => {
    it('handles null values in review display', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { nullField: { type: 'string', title: 'Null Field' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ nullField: null }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        // Null values should not be displayed
        expect(screen.queryByText('Null Field')).not.toBeInTheDocument();
      });
    });

    it('handles undefined values in review display', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: {
              undefinedField: { type: 'string', title: 'Undefined Field' },
            },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({ undefinedField: undefined }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        // Undefined values should not be displayed
        expect(screen.queryByText('Undefined Field')).not.toBeInTheDocument();
      });
    });

    it('handles object without name property in review display', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { item: { type: 'object', title: 'Item' } },
          },
        },
      ];

      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(createScaffolderFormMock({ item: { id: 123 } }));

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('Item')).toBeInTheDocument();
      });
    });

    it('handles decodeBase64FileContent returning null for invalid base64', async () => {
      const steps = [
        {
          title: 'Step 1',
          schema: {
            properties: { file: { type: 'string', title: 'File' } },
          },
        },
      ];

      // Not a base64 data URL
      jest
        .spyOn(require('./ScaffolderFormWrapper'), 'ScaffolderForm')
        .mockImplementation(
          createScaffolderFormMock({ file: 'just-a-regular-string' }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText('just-a-regular-string')).toBeInTheDocument();
      });
    });
  });
});
