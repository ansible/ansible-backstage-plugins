import { render, screen, fireEvent } from '@testing-library/react';
import { BaseImagePickerExtension } from './BaseImagePickerExtension';

const mockProps = {
  onChange: jest.fn(),
  required: false,
  disabled: false,
  rawErrors: [],
  schema: {
    title: 'Execution environment definition details',
    description: 'Configure the base image for your execution environment',
    enum: [
      'registry.access.redhat.com/ubi9/python-311:latest',
      'registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel9:latest',
      'custom',
    ],
    enumNames: [
      'Red Hat Universal Base Image 9 w/ Python 3.11 (Recommended)',
      'Red Hat Ansible Minimal EE base (RHEL 9) (Requires subscription)',
      'Custom Image',
    ],
  },
  uiSchema: {},
  formData: '',
  idSchema: { $id: 'baseImage' },
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  readonly: false,
  name: 'baseImage',
  registry: {} as any,
};

describe('BaseImagePickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title correctly', () => {
    render(<BaseImagePickerExtension {...mockProps} />);

    expect(
      screen.getByText('Execution environment definition details'),
    ).toBeInTheDocument();
  });

  it('renders all base image options', () => {
    render(<BaseImagePickerExtension {...mockProps} />);

    expect(
      screen.getByText(
        'Red Hat Universal Base Image 9 w/ Python 3.11 (Recommended)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Red Hat Ansible Minimal EE base (RHEL 9) (Requires subscription)',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Custom Image')).toBeInTheDocument();
  });

  it('calls onChange when an option is selected', () => {
    render(<BaseImagePickerExtension {...mockProps} />);

    const radioButton = screen.getByDisplayValue(
      'registry.access.redhat.com/ubi9/python-311:latest',
    );
    fireEvent.click(radioButton);

    expect(mockProps.onChange).toHaveBeenCalledWith(
      'registry.access.redhat.com/ubi9/python-311:latest',
    );
  });

  describe('Red Hat registry validation', () => {
    it('shows tags for valid registry.redhat.io images', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: [
            'registry.redhat.io/ansible-automation-platform-25/ee-minimal-rhel9:latest',
          ],
          enumNames: ['Red Hat EE'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('shows tags for valid redhat.io images', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: [
            'redhat.io/ansible-automation-platform-25/ee-minimal-rhel9:latest',
          ],
          enumNames: ['Red Hat EE'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('shows tags for registry.redhat.io with port', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: [
            'registry.redhat.io:5000/ansible-automation-platform-25/ee-minimal-rhel9:latest',
          ],
          enumNames: ['Red Hat EE'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('does not show tags for malicious URL with redhat.io in path', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: ['evil.com/redhat.io/malicious-image:latest'],
          enumNames: ['Malicious Image'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.queryByText('Subscription')).not.toBeInTheDocument();
      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    });

    it('does not show tags for malicious URL with redhat.io as subdomain', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: ['redhat.io.evil.com/malicious-image:latest'],
          enumNames: ['Malicious Image'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.queryByText('Subscription')).not.toBeInTheDocument();
      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    });

    it('does not show tags for URL with redhat.io in query string', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: ['evil.com/image?redirect=redhat.io'],
          enumNames: ['Malicious Image'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.queryByText('Subscription')).not.toBeInTheDocument();
      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    });

    it('shows tags for images containing rhel', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: ['registry.access.redhat.com/ubi9/rhel9:latest'],
          enumNames: ['RHEL Image'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });
  });
});
