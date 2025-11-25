import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ✅ 1. Mock dependencies BEFORE importing StepForm
jest.mock('@backstage/core-plugin-api', () => ({
  useApi: jest.fn(() => ({
    getAccessToken: jest.fn().mockResolvedValue('mock-token'),
  })),
  createApiRef: jest.fn(),
  createRouteRef: jest.fn(),
  attachComponentData: jest.fn(),
}));

jest.mock('@backstage/plugin-scaffolder', () => ({
  EntityPickerFieldExtension: () => <div>EntityPicker</div>,
  // Other fields if needed
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

// 3. Test
describe('StepForm', () => {
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

  const submitFunction = jest.fn().mockResolvedValue(undefined);

  it('renders steps and handles final submission', async () => {
    render(<StepForm steps={steps} submitFunction={submitFunction} />);

    // Step 1
    expect(screen.getByText('MockForm')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Submit'));

    // Step 2
    await waitFor(() => screen.getByText('MockForm'));
    fireEvent.click(screen.getByText('Submit'));

    // Review step
    const createButton = await screen.findByText('Create');
    fireEvent.click(createButton);

    // Check final submit call
    await waitFor(() => {
      expect(submitFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          testField: 'test-value',
          token: 'mock-token',
        }),
      );
    });
  });
});
