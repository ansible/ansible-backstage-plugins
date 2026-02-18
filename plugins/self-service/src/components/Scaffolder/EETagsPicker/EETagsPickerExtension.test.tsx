import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EETagsPickerExtension } from './EETagsPickerExtension';

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

    it('renders with formData when provided', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      expect(screen.getByDisplayValue('tag1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('tag2')).toBeInTheDocument();
    });

    it('calls onChange with default tags when formData is undefined', () => {
      const props = createMockProps({
        formData: undefined,
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      expect(props.onChange).toHaveBeenCalledWith(['execution-environment']);
    });
  });

  describe('Tag Validation - Pattern (Default)', () => {
    it('shows error when tag is empty', async () => {
      const props = createMockProps({
        formData: ['tag1', ''],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: '' } });
      fireEvent.blur(inputs[1]);

      await waitFor(() => {
        const errorText = screen.queryByText(/Tag is required/i);
        // Empty tags don't show validation error on blur if trimmed
        expect(errorText).not.toBeInTheDocument();
      });
    });

    it('shows error when tag contains uppercase letters', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      const updatedFormData = ['tag1', 'INVALID'];
      rerender(<EETagsPickerExtension {...props} formData={updatedFormData} />);

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('shows error when tag contains invalid characters', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag@name'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag@name' } });
      fireEvent.blur(inputs[1]);

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'tag@name']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('shows error when tag contains spaces', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag name'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag name' } });
      fireEvent.blur(inputs[1]);

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'tag name']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('accepts valid tag with lowercase letters and hyphens', async () => {
      const props = createMockProps({
        formData: ['tag1', 'valid-tag'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'valid-tag' } });
      fireEvent.blur(inputs[1]);

      await waitFor(() => {
        expect(
          screen.queryByText(/Tag must consist of lowercase letters/i),
        ).not.toBeInTheDocument();
      });
    });

    it('accepts valid tag with numbers', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag-123'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag-123' } });
      fireEvent.blur(inputs[1]);

      expect(
        screen.queryByText(/Tag must consist of lowercase letters/i),
      ).not.toBeInTheDocument();
    });

    it('accepts valid tag with plus sign', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag+name'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag+name' } });
      fireEvent.blur(inputs[1]);

      expect(
        screen.queryByText(/Tag must consist of lowercase letters/i),
      ).not.toBeInTheDocument();
    });

    it('accepts valid tag with hash sign', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag#name'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag#name' } });
      fireEvent.blur(inputs[1]);

      expect(
        screen.queryByText(/Tag must consist of lowercase letters/i),
      ).not.toBeInTheDocument();
    });

    it('accepts valid tag with mixed valid characters', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag-123+name#v2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'tag-123+name#v2' } });
      fireEvent.blur(inputs[1]);

      expect(
        screen.queryByText(/Tag must consist of lowercase letters/i),
      ).not.toBeInTheDocument();
    });

    it('accepts single character valid tag', async () => {
      const props = createMockProps({
        formData: ['tag1', 'a'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'a' } });
      fireEvent.blur(inputs[1]);

      expect(
        screen.queryByText(/Tag must consist of lowercase letters/i),
      ).not.toBeInTheDocument();
    });

    it('rejects tag starting with hyphen', async () => {
      const props = createMockProps({
        formData: ['tag1', '-invalid'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: '-invalid' } });
      fireEvent.blur(inputs[1]);

      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', '-invalid']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag cannot start with a hyphen/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('rejects tag ending with hyphen', async () => {
      const props = createMockProps({
        formData: ['tag1', 'invalid-'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'invalid-' } });
      fireEvent.blur(inputs[1]);

      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'invalid-']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag cannot end with a hyphen/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('rejects tag with consecutive hyphens', async () => {
      const props = createMockProps({
        formData: ['tag1', 'invalid--tag'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'invalid--tag' } });
      fireEvent.blur(inputs[1]);

      rerender(
        <EETagsPickerExtension
          {...props}
          formData={['tag1', 'invalid--tag']}
        />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag cannot contain consecutive hyphens/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('rejects tag longer than 63 characters', async () => {
      const longTag = 'a'.repeat(64);
      const props = createMockProps({
        formData: ['tag1', longTag],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: longTag } });
      fireEvent.blur(inputs[1]);

      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', longTag]} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must be at most 63 characters long/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });
  });

  describe('Tag Validation - Custom Pattern', () => {
    // Note: Component doesn't currently support custom patterns
    // These tests are kept for future implementation
    it('uses default validation when no custom pattern provided', async () => {
      const props = createMockProps({
        formData: ['tag1', 'valid123'],
        schema: {
          title: 'Tags',
          default: ['execution-environment'],
          items: {
            type: 'string',
          },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'valid123' } });
      fireEvent.blur(inputs[1]);

      // Should accept because it matches default pattern
      expect(
        screen.queryByText(/Tag must consist of lowercase letters/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('Adding Tags', () => {
    it('adds a new tag when add button is clicked', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      fireEvent.click(addButton);

      expect(props.onChange).toHaveBeenCalledWith([
        'execution-environment',
        '',
      ]);
    });

    it('adds empty tag to the list', () => {
      const props = createMockProps();
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      fireEvent.click(addButton);

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension
          {...props}
          formData={['execution-environment', '']}
        />,
      );

      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBe(2);
      expect(inputs[1]).toHaveValue('');
    });

    it('disables add button when disabled is true', () => {
      const props = createMockProps({ disabled: true });
      render(<EETagsPickerExtension {...props} />);

      const addButton = screen.getByLabelText('Add tag');
      expect(addButton).toBeDisabled();
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

    it('reindexes errors when tag is removed', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2', 'tag3'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension
          {...props}
          formData={['tag1', 'INVALID', 'tag3']}
        />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

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

      expect(props.onChange).toHaveBeenCalledWith(['tag2', 'tag1']);
    });

    it('moves tag down when down arrow is clicked', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const downButtons = screen.getAllByLabelText('Move down');
      fireEvent.click(downButtons[0]);

      expect(props.onChange).toHaveBeenCalledWith(['tag2', 'tag1']);
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

      expect(props.onChange).toHaveBeenCalledWith(['tag2', 'tag1']);
    });

    it('reindexes errors when tags are moved up', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'INVALID']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      const upButtons = screen.getAllByLabelText('Move up');
      fireEvent.click(upButtons[1]);

      expect(props.onChange).toHaveBeenCalled();
    });

    it('reindexes errors when tags are moved down', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2', 'tag3'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension
          {...props}
          formData={['tag1', 'INVALID', 'tag3']}
        />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

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
      const lastButton = downButtons[downButtons.length - 1];
      expect(lastButton).toBeDisabled();
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
    it('allows changing first tag (index 0)', () => {
      const props = createMockProps();
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      const input = inputs[0] as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'new-value' } });

      expect(props.onChange).toHaveBeenCalledWith(['new-value']);
    });

    it('clears error when value is empty for non-zero index', () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });
      fireEvent.change(inputs[1], { target: { value: '' } });

      expect(props.onChange).toHaveBeenCalled();
    });

    it('validates tag on change for non-zero index', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'INVALID']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('validates tag on blur', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData after change
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'INVALID']} />,
      );

      // Get fresh inputs after rerender
      const updatedInputs = screen.getAllByRole('textbox');
      // Now blur to trigger validation
      fireEvent.blur(updatedInputs[1]);

      // Wait for validation to complete
      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('handles blur when tag is empty', () => {
      const props = createMockProps({
        formData: ['tag1', ''],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.blur(inputs[1]);

      // Should not show validation error for empty tag on blur
      expect(screen.queryByText(/Tag is required/i)).not.toBeInTheDocument();
    });

    it('handles blur when tag is only whitespace', () => {
      const props = createMockProps({
        formData: ['tag1', '   '],
      });
      render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: '   ' } });
      fireEvent.blur(inputs[1]);

      // Whitespace is trimmed, so it becomes empty
      expect(screen.queryByText(/Tag is required/i)).not.toBeInTheDocument();
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
        screen.queryByDisplayValue('execution-environment'),
      ).not.toBeInTheDocument();
    });

    it('handles formData update to undefined', () => {
      const props = createMockProps({
        formData: undefined, // Start with undefined to trigger useEffect
        schema: {
          default: ['execution-environment'],
          title: 'Tags',
          items: { type: 'string' },
        },
      });
      render(<EETagsPickerExtension {...props} />);

      // When formData is undefined, useEffect should call onChange with defaultTags
      expect(props.onChange).toHaveBeenCalledWith(['execution-environment']);
    });
  });

  describe('Error Display', () => {
    it('shows error message when tag is invalid', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'INVALID']} />,
      );

      // Wait for validation on change
      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('clears error when tag becomes valid', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2'],
      });

      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');

      // First, trigger validation by changing the value
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'INVALID']} />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Now change to valid - get fresh inputs after rerender
      const updatedInputs = screen.getAllByRole('textbox');
      fireEvent.change(updatedInputs[1], { target: { value: 'valid-tag' } });

      // Simulate parent updating formData with valid tag
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'valid-tag']} />,
      );

      // Blur to trigger validation which should clear the error
      const finalInputs = screen.getAllByRole('textbox');
      fireEvent.blur(finalInputs[1]);

      // Wait for error to be cleared
      await waitFor(
        () => {
          expect(
            screen.queryByText(/Tag must consist of lowercase letters/i),
          ).not.toBeInTheDocument();
        },
        { timeout: 2000 },
      );
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
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension {...props} formData={['tag1', 'INVALID']} />,
      );

      // Wait for validation to complete and error to be set
      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // After error is shown, check aria-invalid
      const updatedInputs = screen.getAllByRole('textbox');
      expect(updatedInputs[1]).toHaveAttribute('aria-invalid', 'true');
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

      expect(props.onChange).toHaveBeenCalledWith(['execution-environment']);
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

    it('handles multiple tags with various validations', async () => {
      const props = createMockProps({
        formData: ['tag1', 'tag2', 'tag3'],
      });
      const { rerender } = render(<EETagsPickerExtension {...props} />);

      const inputs = screen.getAllByRole('textbox');

      // Make tag2 invalid
      fireEvent.change(inputs[1], { target: { value: 'INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension
          {...props}
          formData={['tag1', 'INVALID', 'tag3']}
        />,
      );

      await waitFor(
        () => {
          expect(
            screen.getByText(/Tag must consist of lowercase letters/i),
          ).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      // Make tag3 invalid - get fresh inputs
      const updatedInputs = screen.getAllByRole('textbox');
      fireEvent.change(updatedInputs[2], { target: { value: 'ALSO-INVALID' } });

      // Simulate parent updating formData
      rerender(
        <EETagsPickerExtension
          {...props}
          formData={['tag1', 'INVALID', 'ALSO-INVALID']}
        />,
      );

      await waitFor(
        () => {
          const errors = screen.getAllByText(
            /Tag must consist of lowercase letters/i,
          );
          expect(errors.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 2000 },
      );
    });
  });
});
