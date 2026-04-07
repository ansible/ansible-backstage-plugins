import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { scmAuthApiRef } from '@backstage/integration-react';
import { ScmSelectorExtension } from './ScmSelectorExtension';

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

interface GithubFetchMockOptions {
  user?: { login: string };
  orgs?: Array<{ login: string }>;
  repoExists?: boolean;
}

function makeGithubFetchMock({
  user = { login: 'testuser' },
  orgs = [],
  repoExists,
}: GithubFetchMockOptions = {}): (input: any) => Promise<Response> {
  return async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (repoExists !== undefined && url.includes('/repos/')) {
      return {
        ok: repoExists,
        status: repoExists ? 200 : 404,
        json: async () => ({}),
      } as Response;
    }
    if (url.includes('/user/orgs')) {
      return { ok: true, status: 200, json: async () => orgs } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ login: user.login, username: user.login }),
    } as Response;
  };
}

interface GitlabFetchMockOptions {
  user?: { username: string };
  groups?: Array<{ full_path: string; name: string }>;
  repoExists?: boolean;
}

function makeGitlabFetchMock({
  user = { username: 'gluser' },
  groups = [],
  repoExists,
}: GitlabFetchMockOptions = {}): (input: any) => Promise<Response> {
  return async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (repoExists !== undefined && url.includes('/projects/')) {
      return {
        ok: repoExists,
        status: repoExists ? 200 : 404,
        json: async () => ({}),
      } as Response;
    }
    if (url.includes('/groups')) {
      return { ok: true, status: 200, json: async () => groups } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ login: user.username, username: user.username }),
    } as Response;
  };
}

function makeFailingFetchMock(): (input: any) => Promise<Response> {
  return async () =>
    ({ ok: false, status: 500, json: async () => ({}) }) as Response;
}

function mockGlobalFetch(impl: (input: any) => Promise<Response>): void {
  jest.spyOn(global, 'fetch').mockImplementation(impl as any);
}

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
  formData: {
    provider: '',
    providerLabel: '',
    org: '',
    repoName: '',
    repoExists: false,
  },
  formContext: {},
  registry: {} as any,
  idSchema: {} as any,
  name: 'sourceControlProvider',
};

const renderComponent = (props = {}) => {
  return render(
    <TestApiProvider apis={[[scmAuthApiRef, mockScmAuthApi]]}>
      <ScmSelectorExtension {...defaultProps} {...props} />
    </TestApiProvider>,
  );
};

describe('ScmSelectorExtension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScmAuthApi.getCredentials.mockResolvedValue({
      token: 'test-oauth-token',
    });
    mockGlobalFetch(makeGithubFetchMock());
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
      provider: 'github',
      providerLabel: 'Github',
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
        <ScmSelectorExtension
          {...defaultProps}
          formData={{
            provider: 'github',
            providerLabel: 'Github',
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
      mockGlobalFetch(makeGitlabFetchMock());
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
        provider: 'github',
        providerLabel: 'Github',
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
      mockGlobalFetch(makeGithubFetchMock({ orgs: [{ login: 'my-org' }] }));

      renderComponent({
        formData: {
          provider: 'github',
          providerLabel: 'Github',
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
      mockGlobalFetch(
        makeGitlabFetchMock({
          groups: [{ full_path: 'my-group', name: 'My Group' }],
        }),
      );

      renderComponent({
        formData: {
          provider: 'gitlab',
          providerLabel: 'Gitlab',
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
      mockGlobalFetch(makeGithubFetchMock({ orgs: [{ login: 'my-org' }] }));

      const onChange = jest.fn();
      renderComponent({
        onChange,
        formData: {
          provider: 'github',
          providerLabel: 'Github',
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
        provider: 'github',
        providerLabel: 'Github',
        org: 'my-org',
        repoName: '',
        repoExists: false,
      });
    });

    it('shows error when namespace fetch fails', async () => {
      mockGlobalFetch(makeFailingFetchMock());

      renderComponent({
        formData: {
          provider: 'github',
          providerLabel: 'Github',
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
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onChange with repoName when typing in the repository field', async () => {
      mockGlobalFetch(makeGithubFetchMock({ repoExists: false }));

      const onChange = jest.fn();
      renderComponent({
        onChange,
        formData: {
          provider: 'github',
          providerLabel: 'Github',
          org: 'my-org',
          repoName: 'init',
          repoExists: false,
        },
      });

      await act(async () => {});

      expect(screen.getByDisplayValue('init')).toBeInTheDocument();

      fireEvent.change(screen.getByDisplayValue('init'), {
        target: { value: 'new-repo' },
      });

      expect(onChange).toHaveBeenCalledWith({
        provider: 'github',
        providerLabel: 'Github',
        org: 'my-org',
        repoName: 'new-repo',
        repoExists: false,
      });
    });

    it('shows "available" when repo does not exist (GitHub)', async () => {
      mockGlobalFetch(makeGithubFetchMock({ repoExists: false }));

      renderComponent({
        formData: {
          provider: 'github',
          providerLabel: 'Github',
          org: 'my-org',
          repoName: 'new-repo',
          repoExists: false,
        },
      });

      await act(async () => {});
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByText('new-repo is available')).toBeInTheDocument();
      });
    });

    it('shows warning when repo exists (GitHub)', async () => {
      mockGlobalFetch(makeGithubFetchMock({ repoExists: true }));

      renderComponent({
        formData: {
          provider: 'github',
          providerLabel: 'Github',
          org: 'my-org',
          repoName: 'existing-repo',
          repoExists: false,
        },
      });

      await act(async () => {});
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/already exists in the selected namespace/),
        ).toBeInTheDocument();
        expect(screen.getByText(/pull request/i)).toBeInTheDocument();
      });
    });

    it('shows "merge request" for GitLab when repo exists', async () => {
      mockGlobalFetch(makeGitlabFetchMock({ repoExists: true }));

      renderComponent({
        formData: {
          provider: 'gitlab',
          providerLabel: 'Gitlab',
          org: 'my-group',
          repoName: 'my-project',
          repoExists: false,
        },
      });

      await act(async () => {});
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByText(/merge request/i)).toBeInTheDocument();
      });
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
          provider: 'github',
          providerLabel: 'Github',
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
