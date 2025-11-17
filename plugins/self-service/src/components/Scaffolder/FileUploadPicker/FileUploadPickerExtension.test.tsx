import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
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
(globalThis as any).File = function (
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
  return file;
} as any;
Object.setPrototypeOf((globalThis as any).File, OriginalFile);
Object.assign((globalThis as any).File, OriginalFile);

class MockFileReader {
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null =
    null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null =
    null;
  result: string | ArrayBuffer | null = null;

  readAsText(file: Blob) {
    const onloadCallback = this.onload;

    setTimeout(() => {
      if (onloadCallback) {
        if (file instanceof File) {
          const content = fileContentMap.get(file) || '';
          this.result = content;
          const mockTarget = {
            result: content,
          } as FileReader;
          const mockEvent = {
            target: mockTarget,
            currentTarget: mockTarget,
            type: 'load',
          } as unknown as ProgressEvent<FileReader>;
          Object.defineProperty(mockTarget, 'result', {
            value: content,
            writable: false,
            enumerable: true,
            configurable: true,
          });
          onloadCallback.call(this as unknown as FileReader, mockEvent);
        } else {
          this.result = '';
          const mockTarget = {
            result: '',
          } as FileReader;
          const mockEvent = {
            target: mockTarget,
            currentTarget: mockTarget,
            type: 'load',
          } as unknown as ProgressEvent<FileReader>;
          Object.defineProperty(mockTarget, 'result', {
            value: '',
            writable: false,
            enumerable: true,
            configurable: true,
          });
          onloadCallback.call(this as unknown as FileReader, mockEvent);
        }
      }
    }, 0);
  }
}

beforeAll(() => {
  (globalThis as any).FileReader = MockFileReader;
});

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
      expect(screen.getByText('Upload File')).toBeInTheDocument();
    });

    it('renders the description', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      expect(
        screen.getByText(
          'Optionally upload a requirements file with collection details',
        ),
      ).toBeInTheDocument();
    });

    it('renders custom description from uiSchema', () => {
      const props = createMockProps({
        uiSchema: { 'ui:options': { description: 'Custom description' } },
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(screen.getByText('Custom description')).toBeInTheDocument();
    });

    it('renders description from schema when uiSchema description is not provided', () => {
      const props = createMockProps({
        uiSchema: {},
        schema: { description: 'Schema description' },
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(screen.getByText('Schema description')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      const props = createMockProps({
        schema: {},
        uiSchema: {},
      });
      render(<FileUploadPickerExtension {...props} />);
      expect(
        screen.queryByText(
          'Optionally upload a requirements file with collection details',
        ),
      ).not.toBeInTheDocument();
    });

    it('renders the choose file button', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      expect(screen.getByText('Choose File')).toBeInTheDocument();
    });

    it('renders file input with correct accept attribute', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', '.yml,.yaml,.txt');
    });
  });

  describe('Disabled State', () => {
    it('disables the upload button when disabled prop is true', () => {
      const props = createMockProps({ disabled: true });
      render(<FileUploadPickerExtension {...props} />);
      const button = screen.getByText('Choose File').closest('button');
      expect(button).toBeDisabled();
    });

    it('disables the delete button when disabled prop is true', async () => {
      const props = createMockProps({
        disabled: true,
        formData: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
      });
      render(<FileUploadPickerExtension {...props} />);
      await waitFor(() => {
        const deleteButton = screen.getByLabelText('Remove File');
        expect(deleteButton).toBeDisabled();
      });
    });

    it('enables the upload button when disabled prop is false', () => {
      const props = createMockProps({ disabled: false });
      render(<FileUploadPickerExtension {...props} />);
      const button = screen.getByText('Choose File').closest('button');
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
    it('loads and displays file content from base64 formData', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });
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

      await waitFor(() => {
        expect(
          screen.getByText(/File: my-custom-file\.txt/),
        ).toBeInTheDocument();
      });
    });

    it('generates filename from schema title when sessionStorage is empty', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({
        formData,
        schema: { title: 'My Requirements File' },
      });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(
          screen.getByText(/File: my-requirements-file\.txt/),
        ).toBeInTheDocument();
      });
    });

    it('uses default filename when schema title is not available', async () => {
      const base64Content = btoa('Test content');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({
        formData,
        schema: {},
      });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(
          screen.getByText(/File: uploaded-file\.txt/),
        ).toBeInTheDocument();
      });
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

      await waitFor(() => {
        expect(screen.getByText(/File: test-file\.txt/)).toBeInTheDocument();
      });
    });

    it('handles invalid base64 gracefully', async () => {
      const formData = 'data:text/plain;base64,invalid-base64!!!';
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.queryByText(/File:/)).not.toBeInTheDocument();
      });
    });

    it('handles base64 formData without comma separator', async () => {
      const formData = 'data:text/plain;base64,';
      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.queryByText(/File:/)).not.toBeInTheDocument();
      });
    });

    it('clears uploaded file when formData is empty', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData });
      const { rerender } = render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      rerender(<FileUploadPickerExtension {...props} formData="" />);

      await waitFor(() => {
        expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
      });
    });

    it('clears uploaded file when formData does not start with data:', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData });
      const { rerender } = render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      rerender(<FileUploadPickerExtension {...props} formData="plain-text" />);

      await waitFor(() => {
        expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
      });
    });

    it('does not update file when content and name are the same', async () => {
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'test.txt',
      );
      const props = createMockProps({ formData });
      const { rerender } = render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      const setUploadedFileSpy = jest.spyOn(
        require('react'),
        'useState',
      ) as jest.SpyInstance;

      rerender(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      setUploadedFileSpy.mockRestore();
    });
  });

  describe('File Upload', () => {
    it('stores filename in sessionStorage on file upload', async () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<FileUploadPickerExtension {...props} />);

      const file = new File(['Test content'], 'my-file.txt', {
        type: 'text/plain',
      });
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      await act(async () => {
        fireEvent.change(fileInput);
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
          'file-upload-filename-Upload a requirements.yml file',
          'my-file.txt',
        );
      });
    });

    it('does not process upload when no file is selected', () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange, formData: 'not-empty' });
      render(<FileUploadPickerExtension {...props} />);

      onChange.mockClear();

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [],
        writable: false,
      });

      fireEvent.change(fileInput);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('handles FileReader error', async () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      render(<FileUploadPickerExtension {...props} />);

      const mockFileReader = {
        readAsText: jest.fn(),
        onload: null as any,
        onerror: null as any,
      };

      (globalThis as any).FileReader = jest.fn(() => mockFileReader);

      const file = new File(['Test'], 'test.txt', { type: 'text/plain' });
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      if (mockFileReader.onerror) {
        mockFileReader.onerror(new Error('Read error') as any);
      }

      await waitFor(() => {
        expect(mockFileReader.readAsText).toHaveBeenCalledWith(file);
      });
    });
  });

  describe('File Clearing', () => {
    it('clears file and calls onChange with undefined', async () => {
      const onChange = jest.fn();
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const props = createMockProps({ formData, onChange });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      onChange.mockClear();

      const deleteButton = screen.getByLabelText('Remove File');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(undefined);
        expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
      });
    });

    it('removes filename from sessionStorage when clearing file', async () => {
      const onChange = jest.fn();
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      const originalSetItem = sessionStorageMock.setItem;
      sessionStorageMock.setItem = jest.fn((key: string, value: string) => {
        (sessionStorageMock as any).__store[key] = value.toString();
      }) as unknown as jest.Mock<void, [key: string, value: string]>;
      sessionStorageMock.setItem(
        'file-upload-filename-Upload a requirements.yml file',
        'test.txt',
      );
      const props = createMockProps({ formData, onChange });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      sessionStorageMock.removeItem.mockClear();

      const deleteButton = screen.getByLabelText('Remove File');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
          'file-upload-filename-Upload a requirements.yml file',
        );
      });

      sessionStorageMock.setItem = originalSetItem;
    });

    it('handles sessionStorage error when clearing file', async () => {
      const onChange = jest.fn();
      const base64Content = btoa('Hello World');
      const formData = `data:text/plain;base64,${base64Content}`;
      sessionStorageMock.removeItem = jest.fn(() => {
        throw new Error('Storage error');
      }) as unknown as jest.Mock<void, [key: string]>;
      const props = createMockProps({ formData, onChange });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument();
      });

      const deleteButton = screen.getByLabelText('Remove File');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(undefined);
        expect(screen.queryByText('Hello World')).not.toBeInTheDocument();
      });
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

      const button = screen.getByText('Choose File').closest('button');
      fireEvent.click(button!);

      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it('handles missing file input element gracefully', () => {
      const props = createMockProps();
      render(<FileUploadPickerExtension {...props} />);

      const fileInput = document.querySelector('input[type="file"]');
      fileInput?.remove();

      const button = screen.getByText('Choose File').closest('button');
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

  describe('Markdown Links in Description', () => {
    it('renders markdown links in description', () => {
      const props = createMockProps({
        schema: {
          description:
            'Check out [this link](https://example.com) for more info',
        },
      });
      render(<FileUploadPickerExtension {...props} />);

      const link = screen.getByText('this link');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', 'https://example.com');
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

  describe('File Content Display', () => {
    it('displays file name and delete button in header', async () => {
      const base64Content = btoa('Content');
      const formData = `data:text/plain;base64,${base64Content}`;
      const store = (sessionStorageMock as any).__store || {};
      store['file-upload-filename-Upload a requirements.yml file'] =
        'test-file.yml';
      (sessionStorageMock as any).__store = store;
      sessionStorageMock.getItem = jest.fn(
        (key: string) => store[key] || null,
      ) as jest.Mock<string | null, [key: string]>;

      const props = createMockProps({ formData });
      render(<FileUploadPickerExtension {...props} />);

      await waitFor(() => {
        expect(screen.getByText(/File: test-file\.yml/)).toBeInTheDocument();
        expect(screen.getByLabelText('Remove File')).toBeInTheDocument();
      });
    });
  });
});
