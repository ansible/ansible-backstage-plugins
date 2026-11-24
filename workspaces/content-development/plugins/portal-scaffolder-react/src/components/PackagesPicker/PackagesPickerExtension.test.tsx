import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PackagesPickerExtension } from './PackagesPickerExtension';

jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
  makeStyles: () => () => ({
    title: 'title',
    description: 'description',
    addButton: 'addButton',
    itemsList: 'itemsList',
    itemChip: 'itemChip',
    dialogContent: 'dialogContent',
    inputField: 'inputField',
  }),
}));

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'Python Packages',
    description: 'Add Python packages',
    items: {
      type: 'string' as const,
      title: 'Package',
      description:
        'Enter package details. Multiple packages can be separated by commas',
      'ui:placeholder': 'e.g., requests>=2.28.0, boto3',
    },
  } as any,
  uiSchema: {},
  formData: [] as string[],
  idSchema: { $id: 'packages' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'packages',
  registry: {} as any,
  ...overrides,
});

describe('PackagesPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders the title correctly', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Python Packages')).toBeInTheDocument();
    });

    it('renders custom title from uiSchema', () => {
      const props = createMockProps({
        uiSchema: { 'ui:options': { title: 'Custom Packages' } },
      });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Custom Packages')).toBeInTheDocument();
    });

    it('renders title from schema when uiSchema title is not provided', () => {
      const props = createMockProps({
        schema: { title: 'Schema Title', items: {} },
        uiSchema: {},
      });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Schema Title')).toBeInTheDocument();
    });

    it('renders default title when no title provided', () => {
      const props = createMockProps({
        schema: { items: {} },
        uiSchema: {},
      });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Items')).toBeInTheDocument();
    });

    it('renders the add button', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Add Packages Manually')).toBeInTheDocument();
    });

    it('does not render any packages when formData is empty', () => {
      const props = createMockProps({ formData: [] });
      render(<PackagesPickerExtension {...props} />);
      expect(
        screen.queryByRole('button', { name: /requests/i }),
      ).not.toBeInTheDocument();
    });

    it('renders packages from initial formData', () => {
      const formData = ['requests>=2.28.0', 'boto3'];
      const props = createMockProps({ formData });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();
      expect(screen.getByText('boto3')).toBeInTheDocument();
    });

    it('handles undefined formData', () => {
      const props = createMockProps({ formData: undefined });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Add Packages Manually')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /requests/i }),
      ).not.toBeInTheDocument();
    });

    it('renders description when provided', () => {
      const props = createMockProps({
        schema: {
          description: 'Add Python packages',
          items: {},
        },
      });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('Add Python packages')).toBeInTheDocument();
    });

    it('renders description from uiSchema when provided', () => {
      const props = createMockProps({
        uiSchema: {
          'ui:options': { description: 'UI Schema Description' },
        },
      });
      render(<PackagesPickerExtension {...props} />);
      expect(screen.getByText('UI Schema Description')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      const props = createMockProps({
        schema: { items: {} },
        uiSchema: {},
      });
      const { container } = render(<PackagesPickerExtension {...props} />);
      const descriptions = container.querySelectorAll('.description');
      expect(descriptions.length).toBe(0);
    });
  });

  describe('Dialog Management', () => {
    it('opens dialog when add button is clicked', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Package')).toBeInTheDocument();
    });

    it('closes dialog when Cancel button is clicked', async () => {
      const props = createMockProps();
      const { container } = render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Package')).toBeInTheDocument();

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        const dialog = container.querySelector('.MuiDialog-root');
        expect(dialog).not.toBeInTheDocument();
      });
    });

    it('closes dialog when close icon is clicked', async () => {
      const props = createMockProps();
      const { container } = render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Package')).toBeInTheDocument();

      const closeButton = screen.getByLabelText('close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        const dialog = container.querySelector('.MuiDialog-root');
        expect(dialog).not.toBeInTheDocument();
      });
    });

    it('resets input field when dialog is closed', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      fireEvent.click(addButton);
      const newInput = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      expect(newInput).toHaveValue('');
    });

    it('resets input field when close icon is clicked', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const closeButton = screen.getByLabelText('close');
      fireEvent.click(closeButton);

      fireEvent.click(addButton);
      const newInput = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      expect(newInput).toHaveValue('');
    });
  });

  describe('Adding Packages', () => {
    it('adds a single package when form is submitted', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).toHaveBeenCalledWith(['requests>=2.28.0']);
    });

    it('adds multiple packages separated by commas', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, {
        target: { value: 'requests>=2.28.0, boto3, numpy' },
      });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).toHaveBeenCalledWith([
        'requests>=2.28.0',
        'boto3',
        'numpy',
      ]);
    });

    it('trims whitespace from packages', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, {
        target: { value: '  requests>=2.28.0  ,  boto3  ' },
      });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).toHaveBeenCalledWith(['requests>=2.28.0', 'boto3']);
    });

    it('filters out empty packages after splitting', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, {
        target: { value: 'requests>=2.28.0,,boto3,,' },
      });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).toHaveBeenCalledWith(['requests>=2.28.0', 'boto3']);
    });

    it('appends packages to existing packages', () => {
      const onChange = jest.fn();
      const formData = ['existing-package'];
      const props = createMockProps({ formData, onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'new-package' } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).toHaveBeenCalledWith([
        'existing-package',
        'new-package',
      ]);
    });

    it('closes dialog after adding package', async () => {
      const props = createMockProps();
      const { container } = render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      await waitFor(() => {
        const dialog = container.querySelector('.MuiDialog-root');
        expect(dialog).not.toBeInTheDocument();
      });
    });

    it('does not add empty package', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: '   ' } });

      const submitButton = screen.getByText('Add Package').closest('button');
      expect(submitButton).toBeDisabled();
    });

    it('does not add package when input is only whitespace', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: '   ' } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('displays newly added packages', () => {
      const props = createMockProps();
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      rerender(
        <PackagesPickerExtension {...props} formData={['requests>=2.28.0']} />,
      );

      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();
    });
  });

  describe('Removing Packages', () => {
    it('updates display after removing package', () => {
      const onChange = jest.fn();
      const formData = ['requests>=2.28.0', 'boto3'];
      const props = createMockProps({ formData, onChange });
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      const chip = screen
        .getByText('requests>=2.28.0')
        .closest('.MuiChip-root');
      const deleteButton = chip?.querySelector('button');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      rerender(<PackagesPickerExtension {...props} formData={['boto3']} />);

      expect(screen.queryByText('requests>=2.28.0')).not.toBeInTheDocument();
      expect(screen.getByText('boto3')).toBeInTheDocument();
    });
  });

  describe('Input Field Handling', () => {
    it('updates input field on change', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      expect(input).toHaveValue('requests>=2.28.0');
    });

    it('disables Add Package button when input is empty', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const submitButton = screen.getByText('Add Package').closest('button');
      expect(submitButton).toBeDisabled();
    });

    it('disables Add Package button when input is only whitespace', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: '   ' } });

      const submitButton = screen.getByText('Add Package').closest('button');
      expect(submitButton).toBeDisabled();
    });

    it('enables Add Package button when input has value', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const submitButton = screen.getByText('Add Package');
      expect(submitButton).not.toBeDisabled();
    });

    it('shows helper text with placeholder', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText(
          'Enter package details. Multiple packages can be separated by commas (e.g., requests>=2.28.0, boto3)',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('Schema Extraction', () => {
    it('extracts placeholder from schema ui:placeholder', () => {
      const props = createMockProps({
        schema: {
          items: {
            'ui:placeholder': 'custom.placeholder',
          },
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText('custom.placeholder');
      expect(input).toBeInTheDocument();
    });

    it('extracts placeholder from schema ui.placeholder', () => {
      const props = createMockProps({
        schema: {
          items: {
            ui: { placeholder: 'nested.placeholder' },
          },
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText('nested.placeholder');
      expect(input).toBeInTheDocument();
    });

    it('uses default placeholder when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {},
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      expect(input).toBeInTheDocument();
    });

    it('extracts title from schema', () => {
      const props = createMockProps({
        schema: {
          items: {
            title: 'Custom Package Title',
          },
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Custom Package Title')).toBeInTheDocument();
    });

    it('uses default title when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {},
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Package')).toBeInTheDocument();
    });

    it('extracts description from schema', () => {
      const props = createMockProps({
        schema: {
          items: {
            description: 'Custom package description',
          },
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText(/Custom package description/),
      ).toBeInTheDocument();
    });

    it('uses default description when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {},
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText(
          /Enter package details. Multiple packages can be separated by commas/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('FormData Synchronization', () => {
    it('syncs packages state when formData changes externally', () => {
      const props = createMockProps({ formData: [] });
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      expect(screen.queryByText('requests>=2.28.0')).not.toBeInTheDocument();

      rerender(
        <PackagesPickerExtension {...props} formData={['requests>=2.28.0']} />,
      );

      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();
    });

    it('updates packages when formData is updated with new items', () => {
      const initialFormData = ['package1'];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('package1')).toBeInTheDocument();

      rerender(
        <PackagesPickerExtension
          {...props}
          formData={['package1', 'package2']}
        />,
      );

      expect(screen.getByText('package1')).toBeInTheDocument();
      expect(screen.getByText('package2')).toBeInTheDocument();
    });

    it('clears packages when formData becomes empty', () => {
      const initialFormData = ['requests>=2.28.0'];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();

      rerender(<PackagesPickerExtension {...props} formData={[]} />);

      expect(screen.queryByText('requests>=2.28.0')).not.toBeInTheDocument();
    });

    it('handles formData becoming undefined', () => {
      const initialFormData = ['requests>=2.28.0'];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();

      rerender(<PackagesPickerExtension {...props} formData={undefined} />);

      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();
    });

    it('updates when formData changes multiple times', () => {
      const props = createMockProps({ formData: [] });
      const { rerender } = render(<PackagesPickerExtension {...props} />);

      rerender(<PackagesPickerExtension {...props} formData={['package1']} />);
      expect(screen.getByText('package1')).toBeInTheDocument();

      rerender(
        <PackagesPickerExtension
          {...props}
          formData={['package1', 'package2']}
        />,
      );
      expect(screen.getByText('package1')).toBeInTheDocument();
      expect(screen.getByText('package2')).toBeInTheDocument();

      rerender(<PackagesPickerExtension {...props} formData={['package3']} />);
      expect(screen.getByText('package3')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables add button when disabled prop is true', () => {
      const props = createMockProps({ disabled: true });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      expect(addButton.closest('button')).toBeDisabled();
    });

    it('disables package chips when disabled prop is true', () => {
      const formData = ['requests>=2.28.0'];
      const props = createMockProps({ formData, disabled: true });
      const { container } = render(<PackagesPickerExtension {...props} />);

      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('Mui-disabled');
    });

    it('does not allow adding packages when disabled', () => {
      const props = createMockProps({ disabled: true });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      expect(addButton.closest('button')).toBeDisabled();

      expect(screen.queryByText('Add New Package')).not.toBeInTheDocument();
    });

    it('does not allow removing packages when disabled', () => {
      const formData = ['requests>=2.28.0'];
      const props = createMockProps({ formData, disabled: true });
      const { container } = render(<PackagesPickerExtension {...props} />);

      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('Mui-disabled');

      expect(props.onChange).not.toHaveBeenCalled();
    });
  });

  describe('Error Display', () => {
    it('displays raw errors when present', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2'],
      });
      render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display error message when rawErrors is empty', () => {
      const props = createMockProps({ rawErrors: [] });
      render(<PackagesPickerExtension {...props} />);

      expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
    });

    it('displays single error message', () => {
      const props = createMockProps({ rawErrors: ['Single error'] });
      render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('Single error')).toBeInTheDocument();
    });

    it('displays multiple errors joined by comma', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2', 'Error 3'],
      });
      render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2, Error 3')).toBeInTheDocument();
    });
  });

  describe('Chip Display', () => {
    it('displays chips with package names', () => {
      const formData = ['requests>=2.28.0'];
      const props = createMockProps({ formData });
      render(<PackagesPickerExtension {...props} />);

      expect(screen.getByText('requests>=2.28.0')).toBeInTheDocument();
    });

    it('generates unique keys for chips', () => {
      const formData = ['package1', 'package2', 'package3'];
      const props = createMockProps({ formData });
      const { container } = render(<PackagesPickerExtension {...props} />);

      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(3);
      expect(screen.getByText('package1')).toBeInTheDocument();
      expect(screen.getByText('package2')).toBeInTheDocument();
      expect(screen.getByText('package3')).toBeInTheDocument();
    });

    it('generates unique keys for chips with same value', () => {
      const formData = ['package1', 'package1', 'package1'];
      const props = createMockProps({ formData });
      const { container } = render(<PackagesPickerExtension {...props} />);

      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('handles very long package names', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const longPackageName = 'a'.repeat(100);
      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: longPackageName } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([longPackageName]);
    });

    it('handles packages with special characters', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const specialPackage = 'package@1.0.0+beta';
      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: specialPackage } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([specialPackage]);
    });

    it('handles packages with version constraints', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, {
        target: { value: 'requests>=2.28.0,<3.0.0' },
      });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        'requests>=2.28.0',
        '<3.0.0',
      ]);
    });

    it('handles rapid add and remove operations', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      for (let i = 0; i < 3; i++) {
        const addButton = screen.getByText('Add Packages Manually');
        fireEvent.click(addButton);
        const input = screen.getByPlaceholderText(
          'e.g., requests>=2.28.0, boto3',
        );
        fireEvent.change(input, { target: { value: `package${i}` } });
        fireEvent.click(screen.getByText('Add Package'));
      }

      expect(props.onChange).toHaveBeenCalledTimes(3);
    });

    it('handles adding packages with various separators and whitespace', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, {
        target: { value: 'package1, package2 , package3 ,package4' },
      });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        'package1',
        'package2',
        'package3',
        'package4',
      ]);
    });
  });

  describe('Markdown Links in Description', () => {
    it('renders markdown links in description', () => {
      const props = createMockProps({
        schema: {
          description:
            'Check out [this link](https://example.com) for more info',
          items: {},
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const link = screen.getByText('this link');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', 'https://example.com');
    });

    it('renders multiple markdown links in description', () => {
      const props = createMockProps({
        schema: {
          description:
            'Check [link1](https://example1.com) and [link2](https://example2.com)',
          items: {},
        },
      });
      render(<PackagesPickerExtension {...props} />);

      const link1 = screen.getByRole('link', { name: /link1/i });
      const link2 = screen.getByRole('link', { name: /link2/i });
      expect(link1).toHaveAttribute('href', 'https://example1.com');
      expect(link2).toHaveAttribute('href', 'https://example2.com');
    });
  });

  describe('Integration Scenarios', () => {
    it('handles adding multiple packages in sequence', () => {
      const props = createMockProps();
      render(<PackagesPickerExtension {...props} />);

      const packages = ['package1', 'package2', 'package3'];

      for (const pkg of packages) {
        const addButton = screen.getByText('Add Packages Manually');
        fireEvent.click(addButton);

        const input = screen.getByPlaceholderText(
          'e.g., requests>=2.28.0, boto3',
        );
        fireEvent.change(input, { target: { value: pkg } });
        fireEvent.click(screen.getByText('Add Package'));
      }

      expect(props.onChange).toHaveBeenCalledTimes(3);
    });
  });

  describe('Component Props Handling', () => {
    it('handles onChange callback correctly', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<PackagesPickerExtension {...props} />);

      const addButton = screen.getByText('Add Packages Manually');
      fireEvent.click(addButton);

      const input = screen.getByPlaceholderText(
        'e.g., requests>=2.28.0, boto3',
      );
      fireEvent.change(input, { target: { value: 'requests>=2.28.0' } });

      const submitButton = screen.getByText('Add Package');
      fireEvent.click(submitButton);

      expect(onChange).toHaveBeenCalledWith(['requests>=2.28.0']);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });
});
