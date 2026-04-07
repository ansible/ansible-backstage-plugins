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
  },
  uiSchema: {
    'ui:options': {
      providers: [
        { label: 'Github', provider: 'github', host: 'github.com' },
        { label: 'Gitlab', provider: 'gitlab', host: 'gitlab.com' },
      ],
      requestUserCredentials: {
        secretsKey: 'USER_OAUTH_TOKEN',
        additionalScopes: {
          github: ['repo'],
          gitlab: ['write_repository'],
        },
      },
    },
  },
  formData: { provider: '', org: '', repoName: '', repoExists: false },
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
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/user/orgs') || url.includes('/groups')) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ login: 'testuser', username: 'testuser' }),
      } as Response;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

    const githubOption = await screen.findByText('Github');
    fireEvent.click(githubOption);

    expect(onChange).toHaveBeenCalledWith({
      provider: 'Github',
      org: '',
      repoName: '',
      repoExists: false,
    });
  });

  it('triggers OAuth authentication when a provider is selected', async () => {
    renderComponent();

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('Github');
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

    const githubOption = await screen.findByText('Github');
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

    const githubOption = await screen.findByText('Github');
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
        <ScmAuthPickerExtension
          {...defaultProps}
          formData={{
            provider: 'Github',
            org: '',
            repoName: '',
            repoExists: false,
          }}
        />
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

    const githubOption = await screen.findByText('Github');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(screen.getByText('Auth failed')).toBeInTheDocument();
    });
  });

  it('does not trigger auth when requestUserCredentials is not configured', async () => {
    const uiSchema = {
      'ui:options': {
        providers: [
          { label: 'Github', provider: 'github', host: 'github.com' },
          { label: 'Gitlab', provider: 'gitlab', host: 'gitlab.com' },
        ],
      },
    };
    renderComponent({ uiSchema });

    const select = screen.getByRole('button', { name: /Source Control/i });
    fireEvent.mouseDown(select);

    const githubOption = await screen.findByText('Github');
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
    it('defaults to github.com when host is omitted for a github provider', async () => {
      const uiSchema = {
        'ui:options': {
          providers: [{ label: 'My GitHub', provider: 'github' }],
          requestUserCredentials: {
            secretsKey: 'USER_OAUTH_TOKEN',
          },
        },
      };
      renderComponent({ uiSchema });

      const select = screen.getByRole('button', { name: /Source Control/i });
      fireEvent.mouseDown(select);

      const githubOption = await screen.findByText('My GitHub');
      fireEvent.click(githubOption);

      await waitFor(() => {
        expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://github.com',
          }),
        );
      });
    });

    it('defaults to gitlab.com when host is omitted for a gitlab provider', async () => {
      const uiSchema = {
        'ui:options': {
          providers: [{ label: 'My GitLab', provider: 'gitlab' }],
          requestUserCredentials: {
            secretsKey: 'USER_OAUTH_TOKEN',
          },
        },
      };
      renderComponent({ uiSchema });

      const select = screen.getByRole('button', { name: /Source Control/i });
      fireEvent.mouseDown(select);

      const gitlabOption = await screen.findByText('My GitLab');
      fireEvent.click(gitlabOption);

      await waitFor(() => {
        expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://gitlab.com',
          }),
        );
      });
    });

    it('uses the explicit host when provided', async () => {
      const uiSchema = {
        'ui:options': {
          providers: [
            {
              label: 'Corp GHE',
              provider: 'github',
              host: 'ghe.corp.example.com',
            },
          ],
          requestUserCredentials: {
            secretsKey: 'USER_OAUTH_TOKEN',
          },
        },
      };
      renderComponent({ uiSchema });

      const select = screen.getByRole('button', { name: /Source Control/i });
      fireEvent.mouseDown(select);

      const gheOption = await screen.findByText('Corp GHE');
      fireEvent.click(gheOption);

      await waitFor(() => {
        expect(mockScmAuthApi.getCredentials).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://ghe.corp.example.com',
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

    const githubOption = await screen.findByText('Github');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(
        screen.getByText('No token received from authentication'),
      ).toBeInTheDocument();
    });
  });

  it('auto-authenticates when formData is pre-populated', async () => {
    renderComponent({
      formData: {
        provider: 'Github',
        org: '',
        repoName: '',
        repoExists: false,
      },
    });

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

    const githubOption = await screen.findByText('Github');
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

    const githubOption = await screen.findByText('Github');
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

    const githubOption = await screen.findByText('Github');
    fireEvent.click(githubOption);

    await waitFor(() => {
      expect(removeItemSpy).toHaveBeenCalledWith('scaffolder-oauth-pending');
    });

    removeItemSpy.mockRestore();
  });

  describe('namespace dropdown', () => {
    it('renders GitHub personal namespace and orgs after auth', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/user/orgs')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ login: 'my-org' }],
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ login: 'testuser', username: 'testuser' }),
        } as Response;
      });

      renderComponent({
        formData: {
          provider: 'Github',
          org: '',
          repoName: '',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      fireEvent.mouseDown(screen.getByLabelText('Namespace'));

      await waitFor(() => {
        expect(screen.getByText('testuser (personal)')).toBeInTheDocument();
        expect(screen.getByText('my-org')).toBeInTheDocument();
      });
    });

    it('renders GitLab personal namespace and groups after auth', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/groups')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ full_path: 'my-group', name: 'My Group' }],
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ login: 'gluser', username: 'gluser' }),
        } as Response;
      });

      renderComponent({
        formData: {
          provider: 'Gitlab',
          org: '',
          repoName: '',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      fireEvent.mouseDown(screen.getByLabelText('Namespace'));

      await waitFor(() => {
        expect(screen.getByText('gluser (personal)')).toBeInTheDocument();
        expect(screen.getByText('My Group')).toBeInTheDocument();
      });
    });

    it('calls onChange with selected org and resets repoName', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/user/orgs')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ login: 'my-org' }],
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ login: 'testuser', username: 'testuser' }),
        } as Response;
      });

      const onChange = jest.fn();
      renderComponent({
        onChange,
        formData: {
          provider: 'Github',
          org: '',
          repoName: '',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      fireEvent.mouseDown(screen.getByLabelText('Namespace'));
      const orgOption = await screen.findByRole('option', { name: 'my-org' });
      fireEvent.click(orgOption);

      expect(onChange).toHaveBeenCalledWith({
        provider: 'Github',
        org: 'my-org',
        repoName: '',
        repoExists: false,
      });
    });

    it('shows error when namespace fetch fails', async () => {
      (global.fetch as jest.Mock).mockImplementation(async () => {
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      });

      renderComponent({
        formData: {
          provider: 'Github',
          org: '',
          repoName: '',
          repoExists: false,
        },
      });

      await waitFor(() => {
        expect(
          screen.getByText('Failed to fetch GitHub namespaces'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('repository name field', () => {
    it('calls onChange with repoName when typing in the repository field', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/repos/')) {
          return { ok: false, status: 404, json: async () => ({}) } as Response;
        }
        if (url.includes('/user/orgs')) {
          return { ok: true, status: 200, json: async () => [] } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ login: 'testuser' }),
        } as Response;
      });

      const onChange = jest.fn();
      renderComponent({
        onChange,
        formData: {
          provider: 'Github',
          org: 'my-org',
          repoName: 'init',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(screen.getByDisplayValue('init')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );

      fireEvent.change(screen.getByDisplayValue('init'), {
        target: { value: 'new-repo' },
      });

      expect(onChange).toHaveBeenCalledWith({
        provider: 'Github',
        org: 'my-org',
        repoName: 'new-repo',
        repoExists: false,
      });
    });

    it('shows "available" when repo does not exist (GitHub)', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/repos/')) {
          return { ok: false, status: 404, json: async () => ({}) } as Response;
        }
        if (url.includes('/user/orgs')) {
          return { ok: true, status: 200, json: async () => [] } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ login: 'testuser' }),
        } as Response;
      });

      renderComponent({
        formData: {
          provider: 'Github',
          org: 'my-org',
          repoName: 'new-repo',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(screen.getByText('new-repo is available')).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('shows warning when repo exists (GitHub)', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/repos/')) {
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }
        if (url.includes('/user/orgs')) {
          return { ok: true, status: 200, json: async () => [] } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ login: 'testuser' }),
        } as Response;
      });

      renderComponent({
        formData: {
          provider: 'Github',
          org: 'my-org',
          repoName: 'existing-repo',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(
            screen.getByText(/already exists in the selected namespace/),
          ).toBeInTheDocument();
          expect(screen.getByText(/pull request/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });

    it('shows "merge request" for GitLab when repo exists', async () => {
      (global.fetch as jest.Mock).mockImplementation(async (input: any) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/projects/')) {
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        }
        if (url.includes('/groups')) {
          return { ok: true, status: 200, json: async () => [] } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ username: 'gluser' }),
        } as Response;
      });

      renderComponent({
        formData: {
          provider: 'Gitlab',
          org: 'my-group',
          repoName: 'my-project',
          repoExists: false,
        },
      });

      await waitFor(
        () => {
          expect(screen.getByText(/merge request/i)).toBeInTheDocument();
        },
        { timeout: 2000 },
      );
    });
  });

  describe('getApiBaseUrl', () => {
    it('uses explicit apiBaseUrl when provided', async () => {
      const uiSchema = {
        'ui:options': {
          providers: [
            {
              label: 'Corp GHE',
              provider: 'github',
              host: 'ghe.corp.example.com',
              apiBaseUrl: 'https://ghe.corp.example.com/api/v3',
            },
          ],
          requestUserCredentials: { secretsKey: 'USER_OAUTH_TOKEN' },
        },
      };

      renderComponent({
        uiSchema,
        formData: {
          provider: 'Corp GHE',
          org: '',
          repoName: '',
          repoExists: false,
        },
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'https://ghe.corp.example.com/api/v3/user',
          expect.any(Object),
        );
      });
    });
  });
});
