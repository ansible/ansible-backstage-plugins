import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { SecretsContextProvider } from '@backstage/plugin-scaffolder-react';

import { AAPTokenField } from './AAPTokenFieldExtension';
import { rhAapAuthApiRef } from '../../../apis';

describe('AAPTokenField', () => {
  const mockOnChange = jest.fn();

  const defaultProps = {
    onChange: mockOnChange,
    required: false,
    disabled: false,
    rawErrors: [],
    schema: { title: 'AAP Token' },
  } as any; // Simplified for testing - only testing the props we care about

  const mockRhAapAuthApi = {
    getAccessToken: jest.fn(),
  };

  const renderComponent = (props = {}) => {
    return renderInTestApp(
      <TestApiProvider apis={[[rhAapAuthApiRef, mockRhAapAuthApi]]}>
        <SecretsContextProvider>
          <AAPTokenField {...defaultProps} {...props} />
        </SecretsContextProvider>
      </TestApiProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show loading state initially', async () => {
    mockRhAapAuthApi.getAccessToken.mockImplementation(
      () =>
        new Promise(resolve => setTimeout(() => resolve('test-token'), 100)),
    );

    await renderComponent();

    expect(
      screen.getByText('Fetching AAP authentication token...'),
    ).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should display masked token after successful fetch', async () => {
    const testToken = 'test-token-123';
    mockRhAapAuthApi.getAccessToken.mockResolvedValue(testToken);

    await renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText('AAP token retrieved and secured.'),
      ).toBeInTheDocument();
    });

    // Should show masked token
    const input = screen.getByDisplayValue('••••••••••••••••');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');

    // Should call onChange with masked token
    expect(mockOnChange).toHaveBeenCalledWith(expect.stringMatching(/^\*+$/));

    // Should show success indicator
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('should handle authentication errors gracefully', async () => {
    const errorMessage = 'Authentication failed';
    mockRhAapAuthApi.getAccessToken.mockRejectedValue(new Error(errorMessage));

    await renderComponent();

    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });

    // Should show error indicator
    expect(screen.getByText('⚠️')).toBeInTheDocument();

    // Should call onChange with empty string on error
    expect(mockOnChange).toHaveBeenCalledWith('');
  });

  it('should handle non-Error rejection', async () => {
    mockRhAapAuthApi.getAccessToken.mockRejectedValue('String error');

    await renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText('Error: Failed to fetch AAP token'),
      ).toBeInTheDocument();
    });
  });

  it('should respect required prop', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({ required: true });

    await waitFor(() => {
      const input = screen.getByLabelText(/AAP Token/);
      expect(input).toBeRequired();
    });
  });

  it('should respect disabled prop', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({ disabled: true });

    await waitFor(() => {
      const input = screen.getByLabelText(/AAP Token/);
      expect(input).toBeDisabled();
    });
  });

  it('should show error state when rawErrors are provided', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({ rawErrors: ['Some validation error'] });

    await waitFor(() => {
      const input = screen.getByLabelText(/AAP Token/);
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('should use custom field title when provided', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({
      schema: { title: 'Custom Token Field' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Custom Token Field')).toBeInTheDocument();
    });
  });

  it('should use default title when schema title is not provided', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({ schema: {} });

    await waitFor(() => {
      expect(screen.getByLabelText('AAP Token')).toBeInTheDocument();
    });
  });

  it('should use custom title from uiSchema ui:options', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({
      uiSchema: { 'ui:options': { title: 'My Custom Token' } },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('My Custom Token')).toBeInTheDocument();
    });
  });

  it('should use custom helperText from uiSchema ui:options', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({
      uiSchema: { 'ui:options': { helperText: 'Custom helper message' } },
    });

    await waitFor(() => {
      expect(screen.getByText('Custom helper message')).toBeInTheDocument();
    });
  });

  it('should fall back to schema.title when uiSchema title is not a string', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent({
      schema: { title: 'Schema Title' },
      uiSchema: { 'ui:options': { title: 42 } },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Schema Title')).toBeInTheDocument();
    });
  });

  it('should make input readonly', async () => {
    mockRhAapAuthApi.getAccessToken.mockResolvedValue('test-token');

    await renderComponent();

    await waitFor(() => {
      const input = screen.getByLabelText(/AAP Token/);
      expect(input).toHaveAttribute('readonly');
    });
  });
});
