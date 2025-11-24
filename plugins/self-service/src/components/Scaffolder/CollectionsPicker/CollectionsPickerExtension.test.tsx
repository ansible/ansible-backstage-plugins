import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CollectionsPickerExtension } from './CollectionsPickerExtension';
import { CollectionItem } from './types';

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'Ansible Collections',
    description: 'Add collections manually',
    items: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string' as const,
          title: 'Collection Name',
          description: 'Collection name in namespace.collection format',
          pattern: String.raw`^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$`,
          'ui:placeholder': 'e.g., community.general, abc.abc',
        },
        version: {
          type: 'string' as const,
          title: 'Version (Optional)',
          description: 'Specific version of the collection',
          'ui:placeholder': 'e.g., 7.2.1',
        },
      },
    },
  } as any,
  uiSchema: {},
  formData: [] as CollectionItem[],
  idSchema: { $id: 'collections' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'collections',
  registry: {} as any,
  ...overrides,
});

describe('CollectionsPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('renders the title correctly', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Ansible Collections')).toBeInTheDocument();
    });

    it('renders custom title from uiSchema', () => {
      const props = createMockProps({
        uiSchema: { 'ui:options': { title: 'Custom Collections' } },
      });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Custom Collections')).toBeInTheDocument();
    });

    it('renders custom title from schema', () => {
      const props = createMockProps({
        schema: { title: 'Schema Title', items: {} },
      });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Schema Title')).toBeInTheDocument();
    });

    it('renders default title when no title provided', () => {
      const props = createMockProps({
        schema: { items: {} },
        uiSchema: {},
      });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Ansible Collections')).toBeInTheDocument();
    });

    it('renders the add button', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Add Collection Manually')).toBeInTheDocument();
    });

    it('renders no collections when formData is empty', () => {
      const props = createMockProps({ formData: [] });
      render(<CollectionsPickerExtension {...props} />);
      expect(
        screen.queryByRole('button', { name: /community\.general/i }),
      ).not.toBeInTheDocument();
    });

    it('renders collections from initial formData', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
        { name: 'ansible.builtin', version: '2.10.0' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('community.general')).toBeInTheDocument();
      expect(screen.getByText('ansible.builtin')).toBeInTheDocument();
    });

    it('renders collections without version', () => {
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('community.general')).toBeInTheDocument();
      expect(screen.queryByText(/7\.2\.1/i)).not.toBeInTheDocument();
    });

    it('renders collections with empty version string', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('community.general')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      const props = createMockProps({
        schema: {
          description: 'Add collections manually',
          items: {},
        },
      });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Add collections manually')).toBeInTheDocument();
    });

    it('renders description from uiSchema when provided', () => {
      const props = createMockProps({
        uiSchema: {
          'ui:options': { description: 'UI Schema Description' },
        },
      });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('UI Schema Description')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      const props = createMockProps({
        schema: { items: {} },
        uiSchema: {},
      });
      const { container } = render(<CollectionsPickerExtension {...props} />);
      const descriptions = container.querySelectorAll('.MuiTypography-body1');
      const hasDescription = Array.from(descriptions).some(el =>
        el.textContent?.includes('description'),
      );
      expect(hasDescription).toBe(false);
    });

    it('handles undefined formData', () => {
      const props = createMockProps({ formData: undefined });
      render(<CollectionsPickerExtension {...props} />);
      expect(screen.getByText('Add Collection Manually')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /community\.general/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Dialog Management', () => {
    it('opens dialog when add button is clicked', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Collection')).toBeInTheDocument();
    });

    it('closes dialog when Cancel button is clicked', async () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Collection')).toBeInTheDocument();

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).not.toBeInTheDocument();
      });
    });

    it('closes dialog when close icon is clicked', async () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Collection')).toBeInTheDocument();

      const closeButton = screen.getByLabelText('close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).not.toBeInTheDocument();
      });
    });

    it('resets form fields when dialog is closed', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '7.2.1' } });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      fireEvent.click(addButton);
      const newNameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      const newVersionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      expect(newNameInput).toHaveValue('');
      expect(newVersionInput).toHaveValue('');
    });

    it('resets error state when dialog is closed', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      fireEvent.click(addButton);
      const nameInputAfter = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      expect(nameInputAfter).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Adding Collections', () => {
    it('adds collection when form is submitted with name and version', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '7.2.1' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', version: '7.2.1' },
      ]);
    });

    it('adds collection when form is submitted with name only', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });

    it('adds multiple collections', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);
      const nameInput1 = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput1, { target: { value: 'community.general' } });
      fireEvent.click(screen.getByText('Add Collection'));

      fireEvent.click(addButton);
      const nameInput2 = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput2, { target: { value: 'ansible.builtin' } });
      fireEvent.click(screen.getByText('Add Collection'));

      expect(props.onChange).toHaveBeenCalledTimes(2);
      expect(props.onChange).toHaveBeenLastCalledWith([
        { name: 'community.general' },
        { name: 'ansible.builtin' },
      ]);
    });

    it('closes dialog after adding collection', async () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).not.toBeInTheDocument();
      });
    });

    it('displays newly added collection', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '7.2.1' } });

      fireEvent.click(screen.getByText('Add Collection'));

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });
  });

  describe('Removing Collections', () => {
    it('removes a collection when delete icon is clicked', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
        { name: 'ansible.builtin', version: '2.10.0' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();

      const chipLabel = screen.getByText('community.general');
      const chip = chipLabel.closest('.MuiChip-root');
      expect(chip).toBeInTheDocument();

      const svg = chip?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('removes correct collection when multiple exist', () => {
      const formData: CollectionItem[] = [
        { name: 'collection.one', version: '1.0.0' },
        { name: 'collection.two', version: '2.0.0' },
        { name: 'collection.three', version: '3.0.0' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('collection.one')).toBeInTheDocument();
      expect(screen.getByText('collection.two')).toBeInTheDocument();
      expect(screen.getByText('collection.three')).toBeInTheDocument();

      const chipLabel = screen.getByText('collection.two');
      const chip = chipLabel.closest('.MuiChip-root');
      expect(chip).toBeInTheDocument();

      const svg = chip?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('updates display after removing collection', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
        { name: 'ansible.builtin', version: '2.10.0' },
      ];
      const props = createMockProps({ formData });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      const chip = screen
        .getByText('community.general')
        .closest('.MuiChip-root');
      const deleteButton = chip?.querySelector('button');
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      rerender(
        <CollectionsPickerExtension
          {...props}
          formData={[{ name: 'ansible.builtin', version: '2.10.0' }]}
        />,
      );

      expect(screen.queryByText('community.general')).not.toBeInTheDocument();
      expect(screen.getByText('ansible.builtin')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('shows error for empty collection name', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'test' } });
      fireEvent.change(nameInput, { target: { value: '' } });
      fireEvent.blur(nameInput);

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton.closest('button')).toHaveAttribute('disabled');
    });

    it('shows error for invalid collection name format', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();
    });

    it('validates collection name in real-time', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );

      fireEvent.change(nameInput, { target: { value: 'invalid' } });
      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();

      fireEvent.change(nameInput, { target: { value: 'community.general' } });
      expect(
        screen.queryByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).not.toBeInTheDocument();
    });

    it('clears error when name becomes valid', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();

      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      expect(
        screen.queryByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).not.toBeInTheDocument();
    });

    it('does not validate empty string until user types', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );

      fireEvent.change(nameInput, { target: { value: '' } });
      expect(
        screen.queryByText('Collection name is required'),
      ).not.toBeInTheDocument();

      fireEvent.change(nameInput, { target: { value: ' ' } });
      fireEvent.change(nameInput, { target: { value: '' } });
      expect(
        screen.queryByText('Collection name is required'),
      ).not.toBeInTheDocument();
    });

    it('validates names with underscores', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: 'my_namespace.my_collection' },
      });

      expect(
        screen.queryByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).not.toBeInTheDocument();
    });

    it('validates names with numbers', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'ns123.collection456' } });

      expect(
        screen.queryByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).not.toBeInTheDocument();
    });

    it('rejects names without dot separator', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalidname' } });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();
    });

    it('rejects names with multiple dots', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: 'namespace.collection.sub' },
      });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();
    });

    it('rejects names with special characters', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: 'ns-name.collection@name' },
      });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();
    });

    it('trims whitespace from collection name before validation', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: '  community.general  ' },
      });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });

    it('disables Add Collection button when name is empty', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const submitButton = screen.getByText('Add Collection');
      const buttonElement = submitButton.closest('button');
      expect(buttonElement).toHaveAttribute('disabled');
    });

    it('disables Add Collection button when name has validation error', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton.closest('button')).toHaveAttribute('disabled');
    });

    it('enables Add Collection button when name is valid', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton).not.toBeDisabled();
    });

    it('enables Add Collection button when name has only spaces but gets trimmed to valid', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: '  community.general  ' },
      });

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Form Field Handling', () => {
    it('updates name field on input change', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      expect(nameInput).toHaveValue('community.general');
    });

    it('updates version field on input change', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '7.2.1' } });

      expect(versionInput).toHaveValue('7.2.1');
    });

    it('handles version field with empty string', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '' } });

      expect(versionInput).toHaveValue('');
    });
  });

  describe('Schema Extraction', () => {
    it('extracts name placeholder from schema ui:placeholder', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {
                'ui:placeholder': 'custom.placeholder',
              },
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('custom.placeholder');
      expect(nameInput).toBeInTheDocument();
    });

    it('extracts name placeholder from schema ui.placeholder', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {
                ui: { placeholder: 'nested.placeholder' },
              },
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('nested.placeholder');
      expect(nameInput).toBeInTheDocument();
    });

    it('uses default name placeholder when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      expect(nameInput).toBeInTheDocument();
    });

    it('extracts version placeholder from schema ui:placeholder', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {
                'ui:placeholder': 'custom.version',
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const versionInput = screen.getByPlaceholderText('custom.version');
      expect(versionInput).toBeInTheDocument();
    });

    it('uses default version placeholder when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      expect(versionInput).toBeInTheDocument();
    });

    it('extracts name title from schema', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {
                title: 'Custom Name Title',
              },
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Custom Name Title')).toBeInTheDocument();
    });

    it('uses default name title when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Collection Name')).toBeInTheDocument();
    });

    it('extracts name description from schema', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {
                description: 'Custom name description',
              },
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Custom name description')).toBeInTheDocument();
    });

    it('uses default name description when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText('Collection name in namespace.collection format'),
      ).toBeInTheDocument();
    });

    it('extracts version title from schema', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {
                title: 'Custom Version Title',
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Custom Version Title')).toBeInTheDocument();
    });

    it('uses default version title when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Version (Optional)')).toBeInTheDocument();
    });

    it('extracts version description from schema', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {
                description: 'Custom version description',
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText('Custom version description'),
      ).toBeInTheDocument();
    });

    it('uses default version description when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {},
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText('Specific version of the collection'),
      ).toBeInTheDocument();
    });

    it('extracts pattern from schema', () => {
      const customPattern = String.raw`^[a-z]+\.[a-z]+$`;
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {
                pattern: customPattern,
                'ui:placeholder': 'e.g., community.general',
              },
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'COMMUNITY.GENERAL' } });

      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();
    });

    it('uses default pattern when not provided', () => {
      const props = createMockProps({
        schema: {
          items: {
            properties: {
              name: {
                'ui:placeholder': 'e.g., community.general',
              },
              version: {},
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'NS123.COLLECTION456' } });

      expect(
        screen.queryByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe('State Synchronization', () => {
    it('syncs collections state when formData changes externally', () => {
      const props = createMockProps({ formData: [] });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      expect(screen.queryByText('community.general')).not.toBeInTheDocument();

      const newFormData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      rerender(
        <CollectionsPickerExtension {...props} formData={newFormData} />,
      );

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });

    it('updates collections when formData is updated with new items', () => {
      const initialFormData: CollectionItem[] = [
        { name: 'collection.one', version: '1.0.0' },
      ];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('collection.one')).toBeInTheDocument();

      const updatedFormData: CollectionItem[] = [
        { name: 'collection.one', version: '1.0.0' },
        { name: 'collection.two', version: '2.0.0' },
      ];
      rerender(
        <CollectionsPickerExtension {...props} formData={updatedFormData} />,
      );

      expect(screen.getByText('collection.one')).toBeInTheDocument();
      expect(screen.getByText('collection.two')).toBeInTheDocument();
    });

    it('clears collections when formData becomes empty', () => {
      const initialFormData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();

      rerender(<CollectionsPickerExtension {...props} formData={[]} />);

      expect(screen.queryByText('community.general')).not.toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('disables add button when disabled prop is true', () => {
      const props = createMockProps({ disabled: true });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      expect(addButton.closest('button')).toHaveAttribute('disabled');
    });

    it('disables collection chips when disabled prop is true', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      const props = createMockProps({ formData, disabled: true });
      const { container } = render(<CollectionsPickerExtension {...props} />);

      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveClass('Mui-disabled');
    });

    it('does not allow adding collections when disabled', () => {
      const props = createMockProps({ disabled: true });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      expect(addButton.closest('button')).toHaveAttribute('disabled');

      expect(screen.queryByText('Add New Collection')).not.toBeInTheDocument();
    });

    it('does not allow removing collections when disabled', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      const props = createMockProps({ formData, disabled: true });
      const { container } = render(<CollectionsPickerExtension {...props} />);

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
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display error message when rawErrors is empty', () => {
      const props = createMockProps({ rawErrors: [] });
      const { container } = render(<CollectionsPickerExtension {...props} />);

      const errorText = container.querySelector('[color="error"]');
      expect(errorText).not.toBeInTheDocument();
    });

    it('displays validation error in name field', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Chip Display', () => {
    it('displays chip with collection name only when version is not provided', () => {
      const formData: CollectionItem[] = [{ name: 'community.general' }];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
      expect(screen.queryByText(/7\.2\.1/i)).not.toBeInTheDocument();
    });

    it('displays chip with collection name and version', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });

    it('displays chip with empty version string as name only', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '' },
      ];
      const props = createMockProps({ formData });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
      expect(screen.queryByText(/\(\)/)).not.toBeInTheDocument();
    });

    it('generates unique keys for chips with same name but different versions', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
        { name: 'community.general', version: '7.2.2' },
      ];
      const props = createMockProps({ formData });
      const { container } = render(<CollectionsPickerExtension {...props} />);

      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(2);
      const generalChips = screen.getAllByText('community.general');
      expect(generalChips.length).toBe(2);
    });

    it('generates unique keys for chips with same name and no version', () => {
      const formData: CollectionItem[] = [
        { name: 'community.general' },
        { name: 'community.general' },
      ];
      const props = createMockProps({ formData });
      const { container } = render(<CollectionsPickerExtension {...props} />);

      const chips = container.querySelectorAll('.MuiChip-root');
      expect(chips.length).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('handles very long collection names', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const longName = `${'a'.repeat(50)}.${'b'.repeat(50)}`;
      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: longName } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([{ name: longName }]);
    });

    it('handles collection names with special characters in valid format', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: 'ns123.collection_456' },
      });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'ns123.collection_456' },
      ]);
    });

    it('handles version with special characters', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '>=7.2.1,<8.0.0' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', version: '>=7.2.1,<8.0.0' },
      ]);
    });

    it('handles whitespace in collection name input', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, {
        target: { value: '  community.general  ' },
      });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });

    it('handles whitespace in version input', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '  7.2.1  ' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', version: '7.2.1' },
      ]);
    });

    it('handles rapid add and remove operations', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      for (let i = 0; i < 3; i++) {
        const addButton = screen.getByText('Add Collection Manually');
        fireEvent.click(addButton);
        const nameInput = screen.getByPlaceholderText(
          'e.g., community.general, abc.abc',
        );
        fireEvent.change(nameInput, { target: { value: `collection.${i}` } });
        fireEvent.click(screen.getByText('Add Collection'));
      }

      expect(props.onChange).toHaveBeenCalledTimes(3);

      expect(props.onChange).toHaveBeenCalledTimes(3);
    });

    it('handles formData becoming undefined', async () => {
      const initialFormData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      const props = createMockProps({ formData: initialFormData });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();

      rerender(<CollectionsPickerExtension {...props} formData={undefined} />);

      expect(screen.getByText('community.general')).toBeInTheDocument();
    });
  });

  describe('Markdown Links in Description', () => {
    it('renders markdown links in description', () => {
      const props = createMockProps({
        schema: {
          description: 'See this [link](https://example.com) for more info',
          items: {},
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const link = screen.getByRole('link', { name: /link/i });
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('renders multiple markdown links in description', () => {
      const props = createMockProps({
        schema: {
          description:
            'Check [link1](https://example1.com) and [link2](https://example2.com)',
          items: {},
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const link1 = screen.getByRole('link', { name: /link1/i });
      const link2 = screen.getByRole('link', { name: /link2/i });
      expect(link1).toHaveAttribute('href', 'https://example1.com');
      expect(link2).toHaveAttribute('href', 'https://example2.com');
    });

    it('renders description text alongside links', () => {
      const props = createMockProps({
        schema: {
          description:
            'Before link. [Click here](https://example.com) After link.',
          items: {},
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText(/Before link/i)).toBeInTheDocument();
      expect(screen.getByText(/After link/i)).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /Click here/i }),
      ).toBeInTheDocument();
    });
  });

  describe('Enum Field Support', () => {
    it('renders Select dropdown for fields with enum property', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                description: 'Determines the source of the collection.',
                enum: ['file', 'galaxy', 'git', 'url', 'dir', 'subdirs'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Type (Optional)')).toBeInTheDocument();
      });

      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        const select = dialog?.querySelector('[aria-haspopup="listbox"]');
        expect(select).toBeInTheDocument();
      });
    });

    it('renders TextField for fields without enum property', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              version: {
                type: 'string' as const,
                title: 'Version (Optional)',
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      expect(versionInput).toBeInTheDocument();
      expect(versionInput.tagName).toBe('INPUT');
    });

    it('displays all enum options in Select dropdown', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy', 'git', 'url', 'dir', 'subdirs'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      let select: HTMLElement | null = null;
      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        select = dialog?.querySelector(
          '[aria-haspopup="listbox"]',
        ) as HTMLElement;
        expect(select).toBeInTheDocument();
      });

      if (select) {
        fireEvent.mouseDown(select);
      }

      await waitFor(() => {
        expect(screen.getByText('file')).toBeInTheDocument();
      });
      expect(screen.getByText('galaxy')).toBeInTheDocument();
      expect(screen.getByText('git')).toBeInTheDocument();
      expect(screen.getByText('url')).toBeInTheDocument();
      expect(screen.getByText('dir')).toBeInTheDocument();
      expect(screen.getByText('subdirs')).toBeInTheDocument();
    });

    it('uses enumNames when provided for display labels', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy', 'git'],
                enumNames: ['File System', 'Ansible Galaxy', 'Git Repository'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      let select: HTMLElement | null = null;
      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        select = dialog?.querySelector(
          '[aria-haspopup="listbox"]',
        ) as HTMLElement;
        expect(select).toBeInTheDocument();
      });

      if (select) {
        fireEvent.mouseDown(select);
      }

      await waitFor(() => {
        expect(screen.getByText('File System')).toBeInTheDocument();
      });
      expect(screen.getByText('Ansible Galaxy')).toBeInTheDocument();
      expect(screen.getByText('Git Repository')).toBeInTheDocument();
    });

    it('falls back to enum value when enumNames not provided', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      let select: HTMLElement | null = null;
      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        select = dialog?.querySelector(
          '[aria-haspopup="listbox"]',
        ) as HTMLElement;
        expect(select).toBeInTheDocument();
      });

      if (select) {
        fireEvent.mouseDown(select);
      }

      await waitFor(() => {
        expect(screen.getByText('file')).toBeInTheDocument();
      });
      expect(screen.getByText('galaxy')).toBeInTheDocument();
    });

    it('allows selecting enum value from dropdown', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
                'ui:placeholder': 'e.g., community.general',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy', 'git'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('e.g., community.general'),
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      let select: HTMLElement | null = null;
      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        select = dialog?.querySelector(
          '[aria-haspopup="listbox"]',
        ) as HTMLElement;
        expect(select).toBeInTheDocument();
      });

      if (select) {
        fireEvent.mouseDown(select);
      }

      await waitFor(() => {
        expect(screen.getByText('galaxy')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('galaxy'));

      const dialog = document.querySelector('.MuiDialog-root');
      const selectInput = dialog?.querySelector(
        'input[aria-hidden="true"]',
      ) as HTMLInputElement;
      expect(selectInput).toHaveValue('galaxy');
    });

    it('adds collection with enum field value', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
                'ui:placeholder': 'e.g., community.general',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy', 'git'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('e.g., community.general'),
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      let select: HTMLElement | null = null;
      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        select = dialog?.querySelector(
          '[aria-haspopup="listbox"]',
        ) as HTMLElement;
        expect(select).toBeInTheDocument();
      });

      if (select) {
        fireEvent.mouseDown(select);
      }

      await waitFor(() => {
        expect(screen.getByText('galaxy')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('galaxy'));

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', type: 'galaxy' },
      ]);
    });

    it('handles enum field with empty value (optional field)', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
                'ui:placeholder': 'e.g., community.general',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy', 'git'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });

    it('displays description for enum field', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                description: 'Determines the source of the collection.',
                enum: ['file', 'galaxy'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByText('Determines the source of the collection.'),
      ).toBeInTheDocument();
    });

    it('works with multiple enum fields in same form', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
                'ui:placeholder': 'e.g., community.general',
              },
              type: {
                type: 'string' as const,
                title: 'Type',
                enum: ['file', 'galaxy'],
              },
              source: {
                type: 'string' as const,
                title: 'Source',
                enum: ['local', 'remote'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        const foundSelects = dialog?.querySelectorAll(
          '[aria-haspopup="listbox"]',
        );
        expect(foundSelects?.length).toBe(2);
      });

      const dialog = document.querySelector('.MuiDialog-root');
      const selects = dialog?.querySelectorAll('[aria-haspopup="listbox"]');
      expect(selects).toBeDefined();
      expect(selects?.length).toBe(2);

      if (selects && selects.length > 0) {
        const typeSelect = selects[0] as HTMLElement;
        fireEvent.mouseDown(typeSelect);
      }

      await waitFor(() => {
        expect(screen.getByText('file')).toBeInTheDocument();
      });
      expect(screen.getByText('galaxy')).toBeInTheDocument();

      fireEvent.click(screen.getByText('file'));

      if (selects && selects.length > 1) {
        const sourceSelect = selects[1] as HTMLElement;
        fireEvent.mouseDown(sourceSelect);
      }

      await waitFor(() => {
        expect(screen.getByText('local')).toBeInTheDocument();
      });
      expect(screen.getByText('remote')).toBeInTheDocument();
    });

    it('handles enum field alongside text fields', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
                'ui:placeholder': 'e.g., community.general, abc.abc',
              },
              version: {
                type: 'string' as const,
                title: 'Version (Optional)',
                'ui:placeholder': 'e.g., 7.2.1',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy', 'git'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('e.g., community.general, abc.abc'),
        ).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');

      let typeSelect: HTMLElement | null = null;
      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
        typeSelect = dialog?.querySelector(
          '[aria-haspopup="listbox"]',
        ) as HTMLElement;
        expect(typeSelect).toBeInTheDocument();
      });

      expect(nameInput).toBeInTheDocument();
      expect(versionInput).toBeInTheDocument();
      expect(typeSelect).toBeInTheDocument();

      fireEvent.change(nameInput, { target: { value: 'community.general' } });
      fireEvent.change(versionInput, { target: { value: '7.2.1' } });

      if (typeSelect) {
        fireEvent.mouseDown(typeSelect);
      }

      await waitFor(() => {
        expect(screen.getByText('galaxy')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('galaxy'));

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', version: '7.2.1', type: 'galaxy' },
      ]);
    });

    it('disables enum field when disabled prop is true', () => {
      const props = createMockProps({
        disabled: true,
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type (Optional)',
                enum: ['file', 'galaxy'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      expect(addButton.closest('button')).toHaveAttribute('disabled');
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete workflow: add, validate, remove', async () => {
      const props = createMockProps();
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '7.2.1' } });

      fireEvent.click(screen.getByText('Add Collection'));

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', version: '7.2.1' },
      ]);

      const updatedFormData: CollectionItem[] = [
        { name: 'community.general', version: '7.2.1' },
      ];
      rerender(
        <CollectionsPickerExtension {...props} formData={updatedFormData} />,
      );

      expect(screen.getByText('community.general')).toBeInTheDocument();

      const chipLabel = screen.getByText('community.general');
      const chip = chipLabel.closest('.MuiChip-root');
      expect(chip).toBeInTheDocument();

      const svg = chip?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('handles adding collection with validation error, then fixing it', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton.closest('button')).toHaveAttribute('disabled');

      fireEvent.change(nameInput, { target: { value: 'community.general' } });
      const fixedSubmitButton = screen.getByText('Add Collection');
      expect(fixedSubmitButton.closest('button')).not.toHaveAttribute(
        'disabled',
      );

      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });

    it('handles multiple collections with various versions', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const collections = [
        { name: 'collection.one', version: '1.0.0' },
        { name: 'collection.two' },
        { name: 'collection.three', version: '3.0.0-beta' },
      ];

      collections.forEach(collection => {
        const addButton = screen.getByText('Add Collection Manually');
        fireEvent.click(addButton);

        const nameInput = screen.getByPlaceholderText(
          'e.g., community.general, abc.abc',
        );
        fireEvent.change(nameInput, { target: { value: collection.name } });

        if (collection.version) {
          const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
          fireEvent.change(versionInput, {
            target: { value: collection.version },
          });
        }

        fireEvent.click(screen.getByText('Add Collection'));
      });

      expect(screen.getByText('collection.one')).toBeInTheDocument();
      expect(screen.getByText('collection.two')).toBeInTheDocument();
      expect(screen.getByText('collection.three')).toBeInTheDocument();
    });
  });

  describe('Array Field Support', () => {
    it('handles signatures array field with comma-separated values)', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              signatures: {
                type: 'array' as const,
                title: 'Signatures (Optional)',
                items: { type: 'string' as const },
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const signaturesInput = screen.getByPlaceholderText(
        'Enter values separated by newlines',
      );
      fireEvent.change(signaturesInput, {
        target: { value: 'sig1, sig2, sig3' },
      });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          name: 'community.general',
          signatures: ['sig1, sig2, sig3'],
        },
      ]);
    });

    it('handles signatures array field with newline-separated values', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              signatures: {
                type: 'array' as const,
                title: 'Signatures (Optional)',
                items: { type: 'string' as const },
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const signaturesInput = screen.getByPlaceholderText(
        'Enter values separated by newlines',
      );
      fireEvent.change(signaturesInput, {
        target: { value: 'sig1\nsig2\nsig3' },
      });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          name: 'community.general',
          signatures: ['sig1', 'sig2', 'sig3'],
        },
      ]);
    });

    it('handles empty signatures array field', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              signatures: {
                type: 'array' as const,
                title: 'Signatures (Optional)',
                items: { type: 'string' as const },
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });

    it('handles editing collection with array field as array', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              signatures: {
                type: 'array' as const,
                title: 'Signatures (Optional)',
                items: { type: 'string' as const },
              },
            },
          },
        },
        formData: [{ name: 'community.general', signatures: ['sig1', 'sig2'] }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        expect(screen.getByText('Edit Collection')).toBeInTheDocument();
      });

      const signaturesInput = screen.getByPlaceholderText(
        'Enter values separated by newlines',
      );
      expect(signaturesInput).toHaveValue('sig1\nsig2');
    });

    it('handles editing collection with array field as string', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              signatures: {
                type: 'array' as const,
                title: 'Signatures (Optional)',
                items: { type: 'string' as const },
              },
            },
          },
        },
        formData: [{ name: 'community.general', signatures: 'sig1' as any }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        expect(screen.getByText('Edit Collection')).toBeInTheDocument();
      });

      const signaturesInput = screen.getByPlaceholderText(
        'Enter values separated by newlines',
      );
      expect(signaturesInput).toHaveValue('sig1');
    });

    it('handles required array field', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            required: ['name', 'signatures'],
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              signatures: {
                type: 'array' as const,
                title: 'Signatures',
                items: { type: 'string' as const },
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(props.onChange).toHaveBeenCalledWith([
        {
          name: 'community.general',
          signatures: [],
        },
      ]);
    });
  });

  describe('Editing Functionality Edge Cases', () => {
    it('handles editing with invalid index (negative)', () => {
      const props = createMockProps({
        formData: [{ name: 'community.general' }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Collection')).toBeInTheDocument();
    });

    it('handles editing with invalid index (out of bounds)', () => {
      const props = createMockProps({
        formData: [{ name: 'community.general' }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Collection')).toBeInTheDocument();
    });

    it('updates existing collection when editing', async () => {
      const props = createMockProps({
        formData: [{ name: 'community.general', version: '1.0.0' }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        expect(screen.getByText('Edit Collection')).toBeInTheDocument();
      });

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: '2.0.0' } });

      const updateButton = screen.getByText('Update Collection');
      fireEvent.click(updateButton);

      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general', version: '2.0.0' },
      ]);
    });

    it('does not add duplicate when editing', async () => {
      const props = createMockProps({
        formData: [{ name: 'community.general' }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      await waitFor(() => {
        expect(screen.getByText('Edit Collection')).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update Collection');
      fireEvent.click(updateButton);

      expect(props.onChange).toHaveBeenCalledTimes(1);
      expect(props.onChange).toHaveBeenCalledWith([
        { name: 'community.general' },
      ]);
    });
  });

  describe('Required Field Validation', () => {
    it('validates required non-name field', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            required: ['name', 'version'],
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              version: {
                type: 'string' as const,
                title: 'Version',
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText('e.g., community.general');
      fireEvent.change(nameInput, { target: { value: 'community.general' } });

      const submitButton = screen.getByText('Add Collection');
      fireEvent.click(submitButton);

      expect(screen.getByText(/Version is required/i)).toBeInTheDocument();
      expect(submitButton.closest('button')).toHaveAttribute('disabled');
    });
  });

  describe('Field Metadata Edge Cases', () => {
    it('handles ui.placeholder (dot notation)', () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
                ui: { placeholder: 'Custom placeholder' },
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(
        screen.getByPlaceholderText('Custom placeholder'),
      ).toBeInTheDocument();
    });

    it('handles enumNames for enum fields', async () => {
      const props = createMockProps({
        schema: {
          items: {
            type: 'object' as const,
            properties: {
              name: {
                type: 'string' as const,
                title: 'Collection Name',
              },
              type: {
                type: 'string' as const,
                title: 'Type',
                enum: ['file', 'galaxy'],
                enumNames: ['File System', 'Galaxy Server'],
              },
            },
          },
        },
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      await waitFor(() => {
        const dialog = document.querySelector('.MuiDialog-root');
        expect(dialog).toBeInTheDocument();
      });

      const select = document.querySelector(
        '[aria-haspopup="listbox"]',
      ) as HTMLElement;
      fireEvent.mouseDown(select);

      await waitFor(() => {
        expect(screen.getByText('File System')).toBeInTheDocument();
        expect(screen.getByText('Galaxy Server')).toBeInTheDocument();
      });
    });
  });

  describe('Collection Display Edge Cases', () => {
    it('displays "Unnamed" for collection without name', () => {
      const props = createMockProps({
        formData: [{ name: '' } as any],
      });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Unnamed')).toBeInTheDocument();
    });

    it('handles collection with undefined name', () => {
      const props = createMockProps({
        formData: [{} as any],
      });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Unnamed')).toBeInTheDocument();
    });
  });

  describe('Form Data Updates', () => {
    it('updates collections when formData changes', () => {
      const props = createMockProps({
        formData: [{ name: 'collection.one' }],
      });
      const { rerender } = render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('collection.one')).toBeInTheDocument();

      const newProps = {
        ...props,
        formData: [{ name: 'collection.one' }, { name: 'collection.two' }],
      };
      rerender(<CollectionsPickerExtension {...newProps} />);

      expect(screen.getByText('collection.one')).toBeInTheDocument();
      expect(screen.getByText('collection.two')).toBeInTheDocument();
    });

    it('handles formData as undefined', () => {
      const props = createMockProps({
        formData: undefined as any,
      });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Add Collection Manually')).toBeInTheDocument();
      expect(screen.queryByText('community.general')).not.toBeInTheDocument();
    });
  });

  describe('Dialog State Management', () => {
    it('resets state when dialog closes', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'test' } });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      fireEvent.click(addButton);

      const nameInputAfterClose = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      expect(nameInputAfterClose).toHaveValue('');
    });

    it('closes dialog when clicking close icon', async () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      expect(screen.getByText('Add New Collection')).toBeInTheDocument();

      const closeButton = screen.getByLabelText('close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(
          screen.queryByText('Add New Collection'),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Field Change Handling', () => {
    it('clears error for non-name field when changed', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const versionInput = screen.getByPlaceholderText('e.g., 7.2.1');
      fireEvent.change(versionInput, { target: { value: 'test' } });
      fireEvent.change(versionInput, { target: { value: '' } });

      expect(screen.queryByText(/is required/i)).not.toBeInTheDocument();
    });

    it('validates name field only when it has content', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );

      fireEvent.change(nameInput, { target: { value: '' } });
      expect(
        screen.queryByText('Collection name is required'),
      ).not.toBeInTheDocument();

      fireEvent.change(nameInput, { target: { value: 'invalid' } });
      expect(
        screen.getByText(
          'Collection name must be in namespace.collection format (e.g., community.general)',
        ),
      ).toBeInTheDocument();

      fireEvent.change(nameInput, { target: { value: 'community.general' } });
      expect(
        screen.queryByText(
          'Collection name must be in namespace.collection format',
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe('Button State', () => {
    it('disables submit button when name is empty', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton.closest('button')).toHaveAttribute('disabled');
    });

    it('disables submit button when there are validation errors', () => {
      const props = createMockProps();
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      fireEvent.click(addButton);

      const nameInput = screen.getByPlaceholderText(
        'e.g., community.general, abc.abc',
      );
      fireEvent.change(nameInput, { target: { value: 'invalid' } });

      const submitButton = screen.getByText('Add Collection');
      expect(submitButton.closest('button')).toHaveAttribute('disabled');
    });
  });

  describe('Raw Errors Display', () => {
    it('displays rawErrors when provided', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2'],
      });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display rawErrors when empty', () => {
      const props = createMockProps({
        rawErrors: [],
      });
      render(<CollectionsPickerExtension {...props} />);

      expect(screen.queryByText(/Error/i)).not.toBeInTheDocument();
    });
  });

  describe('Disabled State Edge Cases', () => {
    it('disables all interactions when disabled prop is true', () => {
      const props = createMockProps({
        disabled: true,
        formData: [{ name: 'community.general' }],
      });
      render(<CollectionsPickerExtension {...props} />);

      const addButton = screen.getByText('Add Collection Manually');
      expect(addButton.closest('button')).toHaveAttribute('disabled');

      const chip = screen.getByText('community.general');
      fireEvent.click(chip);

      expect(screen.queryByText('Add New Collection')).not.toBeInTheDocument();
    });
  });
});
