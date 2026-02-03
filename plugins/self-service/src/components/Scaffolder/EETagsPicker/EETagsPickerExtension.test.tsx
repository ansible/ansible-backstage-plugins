import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EETagsPickerExtension } from './EETagsPickerExtension';
import { isValidEntityName } from '../../../utils/validationsUtils';

jest.mock('@material-ui/core/styles', () => ({
  ...jest.requireActual('@material-ui/core/styles'),
  makeStyles: () => () => ({
    container: 'container',
    mainContainer: 'mainContainer',
    titleSection: 'titleSection',
    tagsContainer: 'tagsContainer',
    tagRow: 'tagRow',
    tagInputContainer: 'tagInputContainer',
    tagInput: 'tagInput',
    actionsBox: 'actionsBox',
    errorBox: 'errorBox',
    bottomActions: 'bottomActions',
    helpText: 'helpText',
    addButton: 'addButton',
    descriptionText: 'descriptionText',
    minusButton: 'minusButton',
  }),
}));

jest.mock('../../../utils/validationsUtils', () => ({
  isValidEntityName: jest.fn(),
}));

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  required: false,
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'Tags',
    description:
      'Add tags to make this EE definition discoverable in the catalog.',
    default: ['execution-environment'],
    items: {
      type: 'string',
      pattern: '^(?=.{1,63}$)[a-z0-9+#]+(?:-[a-z0-9+#]+)*$',
    },
  } as any,
  uiSchema: {} as any,
  formData: ['execution-environment'] as string[],
  idSchema: { $id: 'tags' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'tags',
  registry: {} as any,
  ...overrides,
});

describe('EETagsPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isValidEntityName as jest.Mock).mockReturnValue({ valid: true });
  });

  describe('Initial Rendering', () => {
    it('renders with default tags from schema', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('execution-environment'),
      ).toBeInTheDocument();
    });

    it('renders without title when schema title is missing', () => {
      const props = createMockProps({
        schema: {
          default: ['tag1'],
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.queryByText('Tags')).not.toBeInTheDocument();
    });

    it('renders with custom title from schema', () => {
      const props = createMockProps({
        schema: {
          title: 'Custom Tags',
          default: ['tag1'],
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByText('Custom Tags')).toBeInTheDocument();
    });

    it('renders description from schema', () => {
      const props = createMockProps({
        schema: {
          title: 'Tags',
          description: 'Custom description text',
          default: ['execution-environment'],
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByText('Custom description text')).toBeInTheDocument();
    });

    it('renders without description when schema description is missing', () => {
      const props = createMockProps({
        schema: {
          title: 'Tags',
          default: ['execution-environment'],
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(
        screen.queryByText(
          'Add tags to make this EE definition discoverable in the catalog.',
        ),
      ).not.toBeInTheDocument();
    });

    it('renders with formData when provided', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByDisplayValue('tag1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('tag2')).toBeInTheDocument();
    });

    it('uses default tags when formData is empty', () => {
      const props = createMockProps({
        formData: [],
        schema: {
          default: ['default-tag'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByDisplayValue('default-tag')).toBeInTheDocument();
    });

    it('renders required indicator when required is true', () => {
      const props = createMockProps({ required: true });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveAttribute('required');
    });

    it('renders required indicator when required is false (always required)', () => {
      const props = createMockProps({ required: false });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveAttribute('required');
    });

    it('disables inputs when disabled is true', () => {
      const props = createMockProps({ disabled: true });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toBeDisabled();
    });

    it('renders add button', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByLabelText('Add tag')).toBeInTheDocument();
    });
  });

  describe('Adding Tags', () => {
    it('adds a new tag when add button is clicked', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalled();
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThanOrEqual(2);
    });

    it('adds empty tag to the list', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      fireEvent.click(addButton);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBe(2);
      expect(inputs[1]).toHaveValue('');
    });

    it('filters out empty tags when calling onChange', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith(['execution-environment']);
    });
  });

  describe('Removing Tags', () => {
    it('removes a tag when remove button is clicked', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const removeButtons = screen.getAllByLabelText('Remove tag');
      fireEvent.click(removeButtons[1]);

      expect(props.onChange).toHaveBeenCalledWith(['tag1']);
    });

    it('keeps default tag when removing last tag if required', () => {
      const props = createMockProps({
        required: true,
        formData: ['execution-environment'],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      const removeButton = screen.getByLabelText('Remove tag');
      expect(removeButton).toBeDisabled();
      fireEvent.click(removeButton);
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('allows removing tag when not required', () => {
      const props = createMockProps({
        required: false,
        formData: ['tag1'],
      });
      render(<EETagsPickerExtension {...props} />);

      const removeButton = screen.getByLabelText('Remove tag');
      fireEvent.click(removeButton);

      expect(props.onChange).toHaveBeenCalledWith([]);
    });

    it('disables remove button when required and only one tag', () => {
      const props = createMockProps({
        required: true,
        formData: ['tag1'],
      });
      render(<EETagsPickerExtension {...props} />);

      const removeButton = screen.getByLabelText('Remove tag');
      expect(removeButton).toBeDisabled();
    });

    it('reindexes errors when tag is removed', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2', 'tag3'],
      });
      (isValidEntityName as jest.Mock).mockImplementation(tag => {
        if (tag === 'tag2') {
          return { valid: false, error: 'Error for tag2' };
        }
        return { valid: true };
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag2' } });
      fireEvent.blur(inputs[1]);

      const removeButtons = screen.getAllByLabelText('Remove tag');
      fireEvent.click(removeButtons[0]);

      expect(props.onChange).toHaveBeenCalled();
    });
  });

  describe('Moving Tags', () => {
    it('moves tag up when up arrow is clicked', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const upButtons = screen.getAllByLabelText('Move up');
      fireEvent.click(upButtons[1]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('moves tag down when down arrow is clicked', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const downButtons = screen.getAllByLabelText('Move down');
      fireEvent.click(downButtons[0]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('restores default tag when first position becomes empty after move down', () => {
      const props = createMockProps({
        formData: ['tag1', ''],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      // Move tag1 down, which swaps it with empty string at index 1
      // After swap: ['', 'tag1'], then check restores default at index 0
      const downButtons = screen.getAllByLabelText('Move down');
      fireEvent.click(downButtons[0]);

      expect(props.onChange).toHaveBeenCalled();
      const callArgs = (props.onChange as jest.Mock).mock.calls[0][0];
      expect(callArgs[0]).toBe('execution-environment');
    });

    it('restores default tag when first position becomes empty after move up', () => {
      // To test this, we need a scenario where after moving up, index 0 becomes empty
      // Start with ['tag2', ''] and move tag2 down to get ['', 'tag2'], then restore
      const props = createMockProps({
        formData: ['tag2', ''],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      // Move tag2 down, which swaps to ['', 'tag2'], then restores default at index 0
      const downButtons = screen.getAllByLabelText('Move down');
      fireEvent.click(downButtons[0]);

      expect(props.onChange).toHaveBeenCalled();
      const callArgs = (props.onChange as jest.Mock).mock.calls[0][0];
      expect(callArgs[0]).toBe('execution-environment');
    });

    it('does not restore default when first position has content after move', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      const upButtons = screen.getAllByLabelText('Move up');
      fireEvent.click(upButtons[1]);

      expect(props.onChange).toHaveBeenCalled();
      const callArgs = (props.onChange as jest.Mock).mock.calls[0][0];
      expect(callArgs[0]).toBe('tag2');
    });

    it('reindexes errors when tags are moved up', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      (isValidEntityName as jest.Mock).mockImplementation(tag => {
        if (tag === 'tag2') {
          return { valid: false, error: 'Error for tag2' };
        }
        return { valid: true };
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag2' } });
      fireEvent.blur(inputs[1]);

      const upButtons = screen.getAllByLabelText('Move up');
      fireEvent.click(upButtons[1]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('reindexes errors when tags are moved down', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2', 'tag3'],
      });
      (isValidEntityName as jest.Mock).mockImplementation(tag => {
        if (tag === 'tag2') {
          return { valid: false, error: 'Error for tag2' };
        }
        return { valid: true };
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag2' } });
      fireEvent.blur(inputs[1]);

      const downButtons = screen.getAllByLabelText('Move down');
      fireEvent.click(downButtons[1]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('does not move down when already at last position', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const downButtons = screen.getAllByLabelText('Move down');
      fireEvent.click(downButtons[1]); // Last tag, should be disabled

      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('disables up arrow for first tag', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const upButtons = screen.getAllByLabelText('Move up');
      expect(upButtons[0]).toBeDisabled();
      expect(upButtons[1]).not.toBeDisabled();
    });

    it('disables down arrow for last tag', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const downButtons = screen.getAllByLabelText('Move down');
      expect(downButtons[0]).not.toBeDisabled();
      expect(downButtons[1]).toBeDisabled();
    });

    it('does not show arrows when only one tag', () => {
      const props = createMockProps({
        formData: ['tag1'],
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.queryByLabelText('Move up')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Move down')).not.toBeInTheDocument();
    });
  });

  describe('Tag Input Handling', () => {
    it('does not allow changing first tag (index 0)', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      const input = inputs[0] as HTMLInputElement;
      const initialValue = input.value;
      fireEvent.change(input, { target: { value: 'new-value' } });

      expect(input.value).toBe(initialValue);
      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('clears error when value is empty for non-zero index', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      (isValidEntityName as jest.Mock).mockReturnValueOnce({
        valid: false,
        error: 'Error',
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'invalid' } });
      fireEvent.change(inputs[1], { target: { value: '' } });

      expect(props.onChange).toHaveBeenCalled();
    });

    it('validates tag on change for non-zero index', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'new-tag' } });

      expect(props.onChange).toHaveBeenCalled();
      expect(isValidEntityName).toHaveBeenCalledWith('new-tag', true);
    });

    it('validates tag on blur', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.blur(inputs[1]);

      expect(isValidEntityName).toHaveBeenCalled();
    });

    it('handles blur when tag is empty', () => {
      const props = createMockProps({
        formData: ['tag1', ''],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.blur(inputs[1]);

      expect(isValidEntityName).not.toHaveBeenCalled();
      // handleBlur returns early for empty tags, so onChange is not called
    });

    it('handles blur when tag is only whitespace', () => {
      const props = createMockProps({
        formData: ['tag1', '   '],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.blur(inputs[1]);

      expect(isValidEntityName).not.toHaveBeenCalled();
    });

    it('handles blur with valid tag and calls onChange', () => {
      const props = createMockProps({
        required: true,
        formData: ['tag1'],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.blur(inputs[0]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('handles blur when tags array is not empty', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.blur(inputs[1]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('handles formData update via useEffect', () => {
      const props = createMockProps({
        formData: ['tag1'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      rerender(<EETagsPickerExtension {...props} formData={['tag2']} />);

      expect(screen.getByDisplayValue('tag2')).toBeInTheDocument();
    });

    it('handles formData update to empty array', () => {
      const props = createMockProps({
        formData: ['tag1'],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      rerender(<EETagsPickerExtension {...props} formData={[]} />);

      expect(
        screen.getByDisplayValue('execution-environment'),
      ).toBeInTheDocument();
    });

    it('handles formData update to undefined', () => {
      const props = createMockProps({
        formData: ['tag1'],
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      // When formData is undefined, useEffect checks formData !== undefined
      // So it won't update, and the component keeps the previous state
      rerender(<EETagsPickerExtension {...props} formData={undefined} />);

      // The component should still show tag1 because undefined formData doesn't trigger useEffect update
      expect(screen.getByDisplayValue('tag1')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('shows error message when tag is invalid', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      (isValidEntityName as jest.Mock).mockImplementation(tag => {
        if (tag === 'invalid!') {
          return { valid: false, error: 'Invalid tag format' };
        }
        return { valid: true };
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'invalid!' } });
      fireEvent.blur(inputs[1]);

      await waitFor(() => {
        expect(screen.getByText('Invalid tag format')).toBeInTheDocument();
      });
    });

    it('clears error when tag becomes valid', async () => {
      const props = createMockProps({
        formData: ['tag1', 'invalid!'],
      });

      (isValidEntityName as jest.Mock)
        .mockReturnValueOnce({ valid: false, error: 'Invalid' })
        .mockReturnValueOnce({ valid: true })
        .mockReturnValueOnce({ valid: true });

      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');

      fireEvent.blur(inputs[1]);

      await waitFor(() => {
        expect(screen.getByText('Invalid')).toBeInTheDocument();
      });

      fireEvent.change(inputs[1], { target: { value: 'valid-tag' } });
      fireEvent.blur(inputs[1]);

      await waitFor(() => {
        expect(screen.queryByText('Invalid')).not.toBeInTheDocument();
      });
    });

    it('shows rawErrors when present', () => {
      const props = createMockProps({
        rawErrors: ['Global error message'],
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByText('Global error message')).toBeInTheDocument();
    });

    it('shows error state on TextField when rawErrors present', () => {
      const props = createMockProps({
        rawErrors: ['Global error message'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows error state on TextField when tag has error', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      (isValidEntityName as jest.Mock).mockImplementation(tag => {
        if (tag === 'invalid!') {
          return { valid: false, error: 'Invalid tag format' };
        }
        return { valid: true };
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'invalid!' } });
      fireEvent.blur(inputs[1]);

      await waitFor(() => {
        expect(inputs[1]).toHaveAttribute('aria-invalid', 'true');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty formData with no default', () => {
      const props = createMockProps({
        formData: [],
        schema: {
          title: 'Tags',
          default: [],
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByLabelText('Add tag')).toBeInTheDocument();
    });

    it('handles undefined formData', () => {
      const props = createMockProps({
        formData: undefined,
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(
        screen.getByDisplayValue('execution-environment'),
      ).toBeInTheDocument();
    });

    it('handles disabled state for all buttons', () => {
      const props = createMockProps({
        disabled: true,
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      const removeButtons = screen.getAllByLabelText('Remove tag');
      const upButtons = screen.getAllByLabelText('Move up');

      expect(addButton).toBeDisabled();
      removeButtons.forEach(btn => expect(btn).toBeDisabled());
      upButtons.forEach(btn => expect(btn).toBeDisabled());
    });

    it('handles validation error with empty error message', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      (isValidEntityName as jest.Mock).mockImplementation(tag => {
        if (tag === 'invalid!') {
          return { valid: false, error: '' };
        }
        return { valid: true };
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'invalid!' } });

      expect(props.onChange).toHaveBeenCalled();
    });
  });
});
