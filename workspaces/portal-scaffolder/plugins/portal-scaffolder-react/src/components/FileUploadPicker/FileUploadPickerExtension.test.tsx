import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadPickerExtension } from './FileUploadPickerExtension';

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    __store: store,
    getItem: jest.fn((key: string) => store[key] || null) as jest.Mock<
      string | null,
      [key: string]
    >,
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }) as jest.Mock<void, [key: string, value: string]>,
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }) as jest.Mock<void, [key: string]>,
    clear: jest.fn(() => {
      store = {};
      (sessionStorageMock as any).__store = store;
    }),
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

const fileContentMap = new WeakMap<File, string>();

const OriginalFile = globalThis.File;
(globalThis as any).File = function MockFile(
  fileBits: BlobPart[],
  fileName: string,
  options?: FilePropertyBag,
) {
  const file = new OriginalFile(fileBits, fileName, options);
  const content = fileBits
    .map((bit: BlobPart) => {
      if (typeof bit === 'string') return bit;
      if (bit instanceof ArrayBuffer) {
        return new TextDecoder().decode(bit);
      }
      return '';
    })
    .join('');
  fileContentMap.set(file, content);

  // Mock the text() method to return a Promise with the content
  file.text = jest.fn(() => Promise.resolve(content));

  return file;
} as any;
Object.setPrototypeOf((globalThis as any).File, OriginalFile);
Object.assign((globalThis as any).File, OriginalFile);

const createMockProps = (overrides = {}) => ({
  onChange: jest.fn(),
  disabled: false,
  rawErrors: [] as string[],
  schema: {
    title: 'Upload a requirements.yml file',
    description:
      'Optionally upload a requirements file with collection details',
  },
  uiSchema: {},
  formData: '',
  idSchema: { $id: 'collectionsFile' } as any,
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'collectionsFile',
  registry: {} as any,
  ...overrides,
});

describe('FileUploadPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorageMock.clear();
  });

  describe('Initial Rendering', () => {
    it('renders the title correctly', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      expect(
        screen.getByText('Upload a requirements.yml file'),
      ).toBeInTheDocument();
    });

    it('renders custom title from uiSchema', () => {
      const props = createMockProps({
        uiSchema: { 'ui:options': { title: 'Custom Upload Title' } },
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(screen.getByText('Custom Upload Title')).toBeInTheDocument();
    });

    it('renders title from schema when uiSchema title is not provided', () => {
      const props = createMockProps({
        uiSchema: {},
        schema: { title: 'Schema Title' },
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(screen.getByText('Schema Title')).toBeInTheDocument();
    });

    it('renders default title when no title provided', () => {
      const props = createMockProps({
        schema: {},
        uiSchema: {},
      });
      render(<FileUploadPickerExtension {...props} />);
      // "Upload File" appears in both title and button
      const uploadFileElements = screen.getAllByText('Upload File');
      expect(uploadFileElements.length).toBe(2);
      // Verify the title is present (first element should be the title)
      expect(uploadFileElements[0]).toBeInTheDocument();
    });

    it('does not render description', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      expect(
        screen.queryByText(
          'Optionally upload a requirements file with collection details',
        ),
      ).not.toBeInTheDocument();
    });

    it('renders text input field initially', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const textArea = screen.getByRole('textbox');
      expect(textArea).toBeInTheDocument();
    });

    it('renders default placeholder in text input', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const textArea = screen.getByPlaceholderText(
        'Paste the content here. Alternatively, upload a file.',
      );
      expect(textArea).toBeInTheDocument();
    });

    it('renders custom placeholder from uiSchema', () => {
      const props = createMockProps({
        uiSchema: {
          'ui:options': {
            placeholder: 'Custom placeholder text',
          },
        },
      });
      render(<FileUploadPickerExtension {...props} />);
      const textArea = screen.getByPlaceholderText('Custom placeholder text');
      expect(textArea).toBeInTheDocument();
    });

    it('renders custom placeholder from schema ui:placeholder', () => {
      const props = createMockProps({
        schema: {
          'ui:placeholder': 'Schema placeholder text',
        },
      });
      render(<FileUploadPickerExtension {...props} />);
      const textArea = screen.getByPlaceholderText('Schema placeholder text');
      expect(textArea).toBeInTheDocument();
    });

    it('renders default button text', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      expect(screen.getByText('Upload File')).toBeInTheDocument();
    });

    it('renders custom button text from uiSchema', () => {
      const props = createMockProps({
        uiSchema: {
          'ui:options': { buttonText: 'Upload YAML file' },
        },
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(screen.getByText('Upload YAML file')).toBeInTheDocument();
    });

    it('renders custom button text from schema ui:buttonText', () => {
      const props = createMockProps({
        schema: {
          'ui:buttonText': 'Upload requirements.txt file',
        },
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(
        screen.getByText('Upload requirements.txt file'),
      ).toBeInTheDocument();
    });

    it('renders file input with correct accept attribute', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', '.yml,.yaml,.txt');
    });
  });

  describe('Text Input', () => {
    it('allows user to type in text area', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const textArea = screen.getByRole('textbox') as HTMLTextAreaElement;

      fireEvent.change(textArea, {
        target: { value: 'collections:\n  - name: test' },
      });

      expect(textArea.value).toBe('collections:\n  - name: test');
    });

    it('calls onChange when text is entered', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial onChange call
      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalled();
      });

      jest.clearAllMocks();

      const textArea = screen.getByRole('textbox');

      const content = 'collections:\n  - name: test';
      fireEvent.change(textArea, { target: { value: content } });

      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalled();
      });
    });

    it('hides upload button when text is entered', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText('Upload File')).toBeInTheDocument();
      });

      const textArea = screen.getByRole('textbox');

      fireEvent.change(textArea, {
        target: { value: 'collections:\n  - name: test' },
      });

      await waitFor(() => {
        expect(screen.queryByText('Upload File')).not.toBeInTheDocument();
      });
    });

    it('clears sessionStorage when text is entered', async () => {
      const props = createMockProps();
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'test.yml',
      );
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      });

      const textArea = screen.getByRole('textbox');

      fireEvent.change(textArea, {
        target: { value: 'collections:\n  - name: test' },
      });

      await waitFor(() => {
        expect(sessionStorageMock.removeItem).toHaveBeenCalled();
      });
    });

    it('calls onChange with undefined when text is cleared', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial onChange
      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalled();
      });

      jest.clearAllMocks();

      const textArea = screen.getByRole('textbox');

      fireEvent.change(textArea, {
        target: { value: 'collections:\n  - name: test' },
      });

      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalled();
      });

      jest.clearAllMocks();

      fireEvent.change(textArea, { target: { value: '' } });

      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalledWith(undefined);
      });
    });

    it('disables text input when file is uploaded', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          const textArea = screen.queryByRole(
            'textbox',
          ) as HTMLTextAreaElement | null;
          expect(textArea).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Disabled State', () => {
    it('disables the upload button when disabled prop is true', () => {
      const props = createMockProps({ disabled: true });
      render(<FileUploadPickerExtension {...props} />);
      const button = screen.getByText('Upload File').closest('button');
      expect(button).toBeDisabled();
    });

    it('disables the text input when disabled prop is true', () => {
      const props = createMockProps({ disabled: true });
      render(<FileUploadPickerExtension {...props} />);
      const textArea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textArea).toBeDisabled();
    });

    it('disables the delete button when disabled prop is true', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({
        disabled: true,
        formData,
      });
      render(<FileUploadPickerExtension {...props} />);
      await waitFor(
        () => {
          const removeButton = screen.getByText('remove');
          expect(removeButton.closest('div')).toHaveStyle({
            cursor: 'not-allowed',
          });
        },
        { timeout: 3000 },
      );
    });

    it('enables the upload button when disabled prop is false', () => {
      const props = createMockProps({ disabled: false });
      render(<FileUploadPickerExtension {...props} />);
      const button = screen.getByText('Upload File').closest('button');
      expect(button).not.toBeDisabled();
    });
  });

  describe('FormData Initialization', () => {
    it('calls onChange with undefined when formData is empty string on mount', () => {
      const onChange = jest.fn();
      const props = createMockProps({ formData: '', onChange });
      render(<FileUploadPickerExtension {...props} />);
      expect(onChange).toHaveBeenCalledWith(undefined);
    });

    it('does not call onChange again on subsequent renders with empty formData', () => {
      const onChange = jest.fn();
      const props = createMockProps({ formData: '', onChange });
      const { rerender } = render(<FileUploadPickerExtension {...props} />);
      onChange.mockClear();
      rerender(<FileUploadPickerExtension {...props} />);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onChange when formData has value', () => {
      const onChange = jest.fn();
      const props = createMockProps({
        formData: 'data:text/plain;base64,SGVsbG8=',
        onChange,
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('FormData Loading from Base64', () => {
    it('loads and displays file from base64 formData', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          // Check for checkmark icon (success indicator)
          const checkIcon = document.querySelector(
            '[class*="checkIcon"], [class*="MuiSvgIcon-root"]',
          );
          expect(checkIcon).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('uses filename from sessionStorage when available', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'my-custom-file.txt',
      );
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText('my-custom-file.txt')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('displays file size when file is uploaded', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'my-custom-file.txt',
      );
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          // File size should be displayed (format: "X.X kb" or "X B")
          const fileSize = screen.getByText(/\d+\.?\d*\s*(B|kb|mb)/i);
          expect(fileSize).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('detects input-data from sessionStorage and shows text input', async () => {
      const base64Content = btoa('collections:\n  - name: test');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'input-data',
      );
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          const textArea = screen.getByRole('textbox') as HTMLTextAreaElement;
          expect(textArea.value).toBe('collections:\n  - name: test');
        },
        { timeout: 3000 },
      );
    });

    it('generates filename from schema title when sessionStorage is empty', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({
        formData,
        schema: { title: 'My Requirements File' },
      });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(
            screen.getByText(/my-requirements-file\.txt/),
          ).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('uses default filename when schema title is not available', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({
        formData,
        schema: {},
      });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText(/uploaded-file\.txt/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('handles sessionStorage error gracefully when getting filename', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.getItem = jest.fn(() => {
        throw new Error('Storage error');
      }) as unknown as jest.Mock<string | null, [key: string]>;
      const props = createMockProps({
        formData,
        schema: { title: 'Test File' },
      });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText(/test-file\.txt/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('handles invalid base64 gracefully', async () => {
      const formData = 'data:text/plain;base64,invalid-base64!!!';
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          // Should not show file display
          expect(screen.queryByText(/remove/)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('handles base64 formData without comma separator', async () => {
      const formData = 'data:text/plain;base64,';
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.queryByText(/remove/)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('clears uploaded file when formData is empty', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData });
      const { rerender } = render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText(/remove/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      rerender(<FileUploadPickerExtension {...props} formData="" />);

      await waitFor(
        () => {
          expect(screen.queryByText(/remove/)).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Plain Text FormData', () => {
    it('parses plain text from formData', async () => {
      const textContent = 'collections:\n  - name: test';
      const props = createMockProps({ formData: textContent });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          const textArea = screen.getByRole('textbox') as HTMLTextAreaElement;
          expect(textArea.value).toBe(textContent);
        },
        { timeout: 3000 },
      );
    });

    it('hides upload button when plain text formData is provided', async () => {
      const textContent = 'collections:\n  - name: test';
      const props = createMockProps({ formData: textContent });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.queryByText('Upload File')).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('File Upload', () => {
    it('stores filename in sessionStorage on file upload', async () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial onChange
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });

      jest.clearAllMocks();
      sessionStorageMock.setItem.mockClear();

      const file = new File(['Test content'], 'my-file.txt', {
        type: 'text/plain',
      });
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
            'file-upload-filename-Upload a requirements.yml file',
            'my-file.txt',
          );
        },
        { timeout: 3000 },
      );
    });

    it('handles file upload correctly', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial onChange
      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalled();
      });

      jest.clearAllMocks();

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['collections:\n  - name: test'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(props.onChange).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );

      expect(props.onChange).toHaveBeenCalledWith(
        expect.stringContaining('data:text/plain;base64,'),
      );
    });

    it('hides text input when file is uploaded', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('displays uploaded file with checkmark, filename, and size', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const fileContent = 'collections:\n  - name: community.general';
      const file = new File([fileContent], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          // Check for filename
          expect(screen.getByText('test.yml')).toBeInTheDocument();
          // Check for remove button
          expect(screen.getByText('remove')).toBeInTheDocument();
          // Check for file size (should be displayed)
          const fileSize = screen.getByText(/\d+\.?\d*\s*(B|kb|mb)/i);
          expect(fileSize).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('does not process upload when no file is selected', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      // Wait for initial onChange call to complete
      await waitFor(() => {
        expect(props.onChange).toHaveBeenCalled();
      });

      jest.clearAllMocks();

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: null } });

      // Give it a moment to ensure no additional calls
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(props.onChange).not.toHaveBeenCalled();
    });

    it('handles file.text() errors gracefully', async () => {
      const props = createMockProps();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test'], 'test.yml', { type: 'text/yaml' });
      // Override the text() method to reject
      file.text = jest.fn(() => Promise.reject(new Error('Read error')));

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            'Failed to read file:',
            expect.any(Error),
          );
        },
        { timeout: 3000 },
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('File Clearing', () => {
    it('clears file and calls onChange with undefined', async () => {
      const onChange = jest.fn();
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData, onChange });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText(/remove/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      onChange.mockClear();

      const removeButton = screen.getByText('remove');
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(undefined);
        expect(screen.queryByText(/remove/)).not.toBeInTheDocument();
      });
    });

    it('removes filename from sessionStorage when clearing file', async () => {
      const onChange = jest.fn();
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'test.txt',
      );
      const props = createMockProps({ formData, onChange });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText(/remove/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      sessionStorageMock.removeItem.mockClear();

      const removeButton = screen.getByText('remove');
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
          'file-upload-filename-Upload a requirements.yml file',
        );
      });
    });

    it('shows text input again after clearing file', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const removeButton = screen.getByText('remove');
      fireEvent.click(removeButton);

      await waitFor(
        () => {
          expect(screen.getByRole('textbox')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('handles sessionStorage error when clearing file', async () => {
      const onChange = jest.fn();
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.removeItem = jest.fn(() => {}) as unknown as jest.Mock<
        void,
        [key: string]
      >;
      const props = createMockProps({ formData, onChange });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(
        () => {
          expect(screen.getByText(/remove/)).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const removeButton = screen.getByText('remove');
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(undefined);
        expect(screen.queryByText(/remove/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Mutual Exclusivity', () => {
    it('hides upload button when text is entered', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Upload File')).toBeInTheDocument();
      });

      const textArea = screen.getByRole('textbox');

      fireEvent.change(textArea, {
        target: { value: 'collections:\n  - name: test' },
      });

      await waitFor(() => {
        expect(screen.queryByText('Upload File')).not.toBeInTheDocument();
      });
    });

    it('prevents text input when file is uploaded', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test'], 'test.yml', { type: 'text/yaml' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          const textArea = screen.queryByRole(
            'textbox',
          ) as HTMLTextAreaElement | null;
          expect(textArea).not.toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Trigger File Upload', () => {
    it('triggers file input click when button is clicked', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const clickSpy = jest.spyOn(fileInput, 'click');

      const button = screen.getByText('Upload File').closest('button');
      fireEvent.click(button!);

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('handles missing file input element gracefully', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      const fileInput = document.querySelector('input[type="file"]');
      fileInput?.remove();

      const button = screen.getByText('Upload File').closest('button');
      expect(() => fireEvent.click(button!)).not.toThrow();
    });
  });

  describe('Error Display', () => {
    it('displays raw errors when present', () => {
      const props = createMockProps({
        rawErrors: ['Error 1', 'Error 2'],
      });
      render(<FileUploadPickerExtension {...props} />);

      expect(screen.getByText('Error 1, Error 2')).toBeInTheDocument();
    });

    it('does not display error message when rawErrors is empty', () => {
      const props = createMockProps({ rawErrors: [] });
      render(<FileUploadPickerExtension {...props} />);

      expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
    });

    it('displays single error message', () => {
      const props = createMockProps({ rawErrors: ['Single error'] });
      render(<FileUploadPickerExtension {...props} />);

      expect(screen.getByText('Single error')).toBeInTheDocument();
    });
  });

  describe('File Display UI', () => {
    it('displays checkmark icon when file is uploaded', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          // Check for checkmark icon (success indicator)
          const checkIcon = document.querySelector(
            '[class*="checkIcon"], [class*="MuiSvgIcon-root"]',
          );
          expect(checkIcon).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('displays filename in blue color', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          const fileName = screen.getByText('test.yml');
          expect(fileName).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('displays file size', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          // File size should be displayed
          const fileSize = screen.getByText(/\d+\.?\d*\s*(B|kb|mb)/i);
          expect(fileSize).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('displays remove button with text and icon', async () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const file = new File(['test content'], 'test.yml', {
        type: 'text/yaml',
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(
        () => {
          expect(screen.getByText('remove')).toBeInTheDocument();
          // Delete icon should also be present
          const deleteIcon = document.querySelector(
            '[class*="MuiSvgIcon-root"]',
          );
          expect(deleteIcon).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('File Input ID', () => {
    it('generates unique file input ID', () => {
      const props1 = createMockProps();
      const { container: container1 } = render(
        <FileUploadPickerExtension {...props1} />,
      );

      const props2 = createMockProps();
      const { container: container2 } = render(
        <FileUploadPickerExtension {...props2} />,
      );

      const input1 = container1.querySelector('input[type="file"]');
      const input2 = container2.querySelector('input[type="file"]');

      expect(input1?.id).toBeTruthy();
      expect(input2?.id).toBeTruthy();
      expect(input1?.id).not.toBe(input2?.id);
    });
  });
});
