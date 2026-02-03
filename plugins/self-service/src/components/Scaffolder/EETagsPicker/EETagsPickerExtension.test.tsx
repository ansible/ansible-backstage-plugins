import {
    render,
    screen,
    fireEvent,
    waitFor,
  } from '@testing-library/react';
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
      description: 'Add tags to make this EE definition discoverable in the catalog.',
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
        expect(screen.getByDisplayValue('execution-environment')).toBeInTheDocument();
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
        // Button should be disabled when required and only one tag
        expect(removeButton).toBeDisabled();
        // Since it's disabled, clicking won't trigger onChange
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

        // Value should remain unchanged because index 0 is protected
        expect(input.value).toBe(initialValue);
        expect(props.onChange).not.toHaveBeenCalled();
      })
    });
    describe('Validation', () => {
      it('shows error message when tag is invalid', async () => {
        const props = createMockProps({
          formData: ['tag1', 'tag2'],
        });
        (isValidEntityName as jest.Mock).mockImplementation((tag) => {
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
        
        // Set up mock to handle validation calls properly
        // The component validates on blur, so:
        // First call: invalid! on blur (to show error)
        // Second call: valid-tag on change
        // Third call: valid-tag on blur (to clear error)
        (isValidEntityName as jest.Mock)
          .mockReturnValueOnce({ valid: false, error: 'Invalid' }) // invalid! on blur
          .mockReturnValueOnce({ valid: true }) // valid-tag on change
          .mockReturnValueOnce({ valid: true }); // valid-tag on blur

        render(<EETagsPickerExtension {...props} />);

        const inputs = screen.getAllByRole('textbox');
        
        // First trigger validation by blurring the invalid tag
        fireEvent.blur(inputs[1]);
        
        // Wait for error to appear
        await waitFor(() => {
          expect(screen.getByText('Invalid')).toBeInTheDocument();
        });
         // Now change to valid tag
         fireEvent.change(inputs[1], { target: { value: 'valid-tag' } });
         fireEvent.blur(inputs[1]);
 
         // Error should be cleared after blur with valid tag
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
  
        // Should render add button even with no tags
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
  
        expect(screen.getByDisplayValue('execution-environment')).toBeInTheDocument();
      });
  
      it('reindexes errors when tag is removed', () => {
        const props = createMockProps({
          formData: ['tag1', 'tag2', 'tag3'],
        });
        (isValidEntityName as jest.Mock).mockImplementation((tag) => {
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
  
      it('reindexes errors when tags are moved', () => {
        const props = createMockProps({
          formData: ['tag1', 'tag2'],
        });
        (isValidEntityName as jest.Mock).mockImplementation((tag) => {
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
  
      it('restores default tag when first position becomes empty after move', () => {
        const props = createMockProps({
          formData: ['', 'tag2'],
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
    });
  });