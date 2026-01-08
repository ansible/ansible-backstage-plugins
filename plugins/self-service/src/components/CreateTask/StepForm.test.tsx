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

    it('displays object without name as JSON', async () => {
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
          createScaffolderFormMock({ item: { id: 1, value: 'test' } }),
        );

      render(<StepForm steps={steps} submitFunction={submitFunction} />);

      fireEvent.click(screen.getByText('Submit'));

      await waitFor(() => {
        expect(screen.getByText(/"id":1/)).toBeInTheDocument();
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
});
