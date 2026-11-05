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
      'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18',
      'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel9:2.18',
      'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.16',
      'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel9:2.16',
      'custom',
    ],
    enumNames: [
      'Red Hat Ansible Minimal EE - Ansible Core 2.18 (RHEL 8)',
      'Red Hat Ansible Minimal EE - Ansible Core 2.18 (RHEL 9)',
      'Red Hat Ansible Minimal EE - Ansible Core 2.16 (RHEL 8)',
      'Red Hat Ansible Minimal EE - Ansible Core 2.16 (RHEL 9)',
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
        'Red Hat Ansible Minimal EE - Ansible Core 2.18 (RHEL 8)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Red Hat Ansible Minimal EE - Ansible Core 2.18 (RHEL 9)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Red Hat Ansible Minimal EE - Ansible Core 2.16 (RHEL 8)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Red Hat Ansible Minimal EE - Ansible Core 2.16 (RHEL 9)',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Custom Image')).toBeInTheDocument();
  });

  it('calls onChange when an option is selected', () => {
    render(<BaseImagePickerExtension {...mockProps} />);

    const radioButton = screen.getByDisplayValue(
      'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18',
    );
    fireEvent.click(radioButton);

    expect(mockProps.onChange).toHaveBeenCalledWith(
      'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18',
    );
  });

  describe('Red Hat registry validation', () => {
    it('shows tags for valid registry.redhat.io images', () => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: [
            'registry.redhat.io/ansible-automation-platform/ee-minimal-rhel8:2.18',
          ],
          enumNames: ['Red Hat EE'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it.each([
      [
        'redhat.io in path',
        'evil.com/ansible-automation-platform/ee-minimal-rhel8:2.18',
      ],
      ['redhat.io as subdomain', 'redhat.io.evil.com/malicious-image:latest'],
      ['redhat.io in query string', 'evil.com/image?redirect=redhat.io'],
    ])('does not show tags for malicious URL with %s', (_desc, imageUrl) => {
      const props = {
        ...mockProps,
        schema: {
          ...mockProps.schema,
          enum: [imageUrl],
          enumNames: ['Malicious Image'],
        },
      };
      render(<BaseImagePickerExtension {...props} />);

      expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    });
  });
});
