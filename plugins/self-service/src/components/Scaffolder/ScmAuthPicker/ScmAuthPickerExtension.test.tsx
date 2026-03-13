import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { scmAuthApiRef } from '@backstage/integration-react';
import { ScmAuthPickerExtension } from './ScmAuthPickerExtension';

const mockSetSecrets = jest.fn();
jest.mock('@backstage/plugin-scaffolder-react', () => ({
  useTemplateSecrets: () => ({
    secrets: {},
    setSecrets: mockSetSecrets,
  }),
}));

const mockScmAuthApi = {
  getCredentials: jest.fn(),
};

const defaultProps = {
  onChange: jest.fn(),
  onBlur: jest.fn(),
  onFocus: jest.fn(),
  required: false,
  disabled: false,
  readonly: false,
  rawErrors: [],
  schema: {
    title: 'Source Control',
    description: 'Select your source control provider',
    enum: ['Github', 'Gitlab'],
    enumNames: ['GitHub', 'GitLab'],
  },
  uiSchema: {
    'ui:options': {
      requestUserCredentials: {
        secretsKey: 'USER_OAUTH_TOKEN',
        additionalScopes: {
          github: ['repo'],
          gitlab: ['write_repository'],
        },
      },
      hostMapping: {
        Github: 'github.com',
        Gitlab: 'gitlab.com',
      },
    },
  },
  formData: '',
  formContext: {},
  registry: {} as any,
  idSchema: {} as any,
  name: 'sourceControlProvider',
};

const renderComponent = (props = {}) => {
  return render(
    <TestApiProvider apis={[[scmAuthApiRef, mockScmAuthApi]]}>
      <ScmAuthPickerExtension {...defaultProps} {...props} />
    </TestApiProvider>,
  );
};

describe('ScmAuthPickerExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScmAuthApi.getCredentials.mockResolvedValue({
      token: 'test-oauth-token',
    });
  });

  it('renders the select field with options', () => {
    renderComponent();

    expect(screen.getByLabelText('Source Control')).toBeInTheDocument();
  });

  it('calls onChange when a value is selected', async () => {
    const onChange = jest.fn();
    renderComponent({ onChange });

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    expect(onChange).toHaveBeenCalledWith('Github');
  });

  it('triggers OAuth authentication when a provider is selected', async () => {
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith({
        url: 'https://github.com',
        additionalScope: {
          repoWrite: true,
          customScopes: {
            github: ['repo'],
            gitlab: ['write_repository'],
          },
        },
      });
    });
  });

  it('stores the token in secrets after successful authentication', async () => {
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(mockSetSecrets).toHaveBeenCalledWith({
        USER_OAUTH_TOKEN: 'test-oauth-token',
      });
    });
  });

  it('shows authenticated status after successful auth', async () => {
    const { rerender } = renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    // Wait for authentication to complete
    await waitFor(() => {
      expect(mockSetSecrets).toHaveBeenCalledWith({
        USER_OAUTH_TOKEN: 'test-oauth-token',
      });
    });

    // Re-render with the selected value to simulate parent state update
    rerender(
      <TestApiProvider apis={[[scmAuthApiRef, mockScmAuthApi]]}>
        <ScmAuthPickerExtension {...defaultProps} formData="Github" />
      </TestApiProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Authenticated with github.com/),
      ).toBeInTheDocument();
    });
  });

  it('shows error message when authentication fails', async () => {
    mockScmAuthApi.getCredentials.mockRejectedValue(new Error('Auth failed'));
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(screen.getByText('Auth failed')).toBeInTheDocument();
    });
  });

  it('does not trigger auth when requestUserCredentials is not configured', async () => {
    const uiSchema = {
      'ui:options': {},
    };
    renderComponent({ uiSchema });

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    expect(mockScmAuthApi.getCredentials).not.toHaveBeenCalled();
  });

  it('renders with disabled state', () => {
    renderComponent({ disabled: true });

    const select = screen.getByRole('button', { name: /Source Control/i });
    expect(select).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows raw errors when present', () => {
    renderComponent({ rawErrors: ['Field is required'] });

    expect(screen.getByText('Field is required')).toBeInTheDocument();
  });

  describe('getHostForValue fallback logic', () => {
    it('uses github.com for values containing "github" without hostMapping', async () => {
      const uiSchema = {
        'ui:options': {
          requestUserCredentials: {
            secretsKey: 'USER_OAUTH_TOKEN',
          },
          // No hostMapping provided
        },
      };
      renderComponent({ uiSchema });

      const select = screen.getByRole('button', { name: /Source Control/i });
      fireEvent.mouseDown(select);

      const githubOption = await screen.findByText('GitHub');
      fireEvent.click(githubOption);

      await waitFor(() => {
        expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://github.com',
          }),
        );
      });
    });

    it('uses gitlab.com for values containing "gitlab" without hostMapping', async () => {
      const uiSchema = {
        'ui:options': {
          requestUserCredentials: {
            secretsKey: 'USER_OAUTH_TOKEN',
          },
          // No hostMapping provided
        },
      };
      renderComponent({ uiSchema });

      const select = screen.getByRole('button', { name: /Source Control/i });
      fireEvent.mouseDown(select);

      const gitlabOption = await screen.findByText('GitLab');
      fireEvent.click(gitlabOption);

      await waitFor(() => {
        expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://gitlab.com',
          }),
        );
      });
    });

    it('uses the value itself when no hostMapping and no github/gitlab in name', async () => {
      const schema = {
        title: 'Source Control',
        description: 'Select your source control provider',
        enum: ['bitbucket.org'],
        enumNames: ['Bitbucket'],
      };
      const uiSchema = {
        'ui:options': {
          requestUserCredentials: {
            secretsKey: 'USER_OAUTH_TOKEN',
          },
          // No hostMapping provided
        },
      };
      renderComponent({ schema, uiSchema });

      const select = screen.getByRole('button', { name: /Source Control/i });
      fireEvent.mouseDown(select);

      const bitbucketOption = await screen.findByText('Bitbucket');
      fireEvent.click(bitbucketOption);

      await waitFor(() => {
        expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://bitbucket.org',
          }),
        );
      });
    });
  });

  it('throws error when no token is received from authentication', async () => {
    mockScmAuthApi.getCredentials.mockResolvedValue({ token: null });
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(
        screen.getByText('No token received from authentication'),
      ).toBeInTheDocument();
    });
  });

  it('auto-authenticates when formData is pre-populated', async () => {
    renderComponent({ formData: 'Github' });

    await waitFor(() => {
      expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://github.com',
        }),
      );
    });
  });

  it('sets OAuth pending flag in sessionStorage before authentication', async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(setItemSpy).toHaveBeenCalledWith(
        'scaffolder-oauth-pending',
        'true',
      );
    });

    setItemSpy.mockRestore();
  });

  it('clears OAuth pending flag after successful authentication', async () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(removeItemSpy).toHaveBeenCalledWith('scaffolder-oauth-pending');
    });

    removeItemSpy.mockRestore();
  });

  it('clears OAuth pending flag on authentication failure', async () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');
    mockScmAuthApi.getCredentials.mockRejectedValue(new Error('Auth failed'));
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('GitHub');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(removeItemSpy).toHaveBeenCalledWith('scaffolder-oauth-pending');
    });

    removeItemSpy.mockRestore();
  });
});
