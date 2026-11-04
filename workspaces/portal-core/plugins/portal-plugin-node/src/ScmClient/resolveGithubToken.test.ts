import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  DefaultGithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import { resolveGithubToken } from './resolveGithubToken';

describe('resolveGithubToken', () => {
  let mockLogger: jest.Mocked<LoggerService>;
  let mockCredentialsProvider: jest.Mocked<DefaultGithubCredentialsProvider>;
  let mockIntegrations: { github: { byHost: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<LoggerService>;

    mockCredentialsProvider = {
      getCredentials: jest.fn(),
    } as unknown as jest.Mocked<DefaultGithubCredentialsProvider>;

    mockIntegrations = {
      github: { byHost: jest.fn() },
    };
  });

  function callResolve(overrides?: {
    host?: string;
    organization?: string;
    repository?: string;
  }) {
    return resolveGithubToken({
      integrations: mockIntegrations as unknown as ScmIntegrationRegistry,
      credentialsProvider: mockCredentialsProvider,
      logger: mockLogger,
      host: overrides?.host ?? 'github.com',
      organization: overrides?.organization ?? 'my-org',
      repository: overrides?.repository,
    });
  }

  it('should return GitHub App token when credentials provider succeeds', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: 'pat-token', apiBaseUrl: 'https://api.github.com' },
    });
    mockCredentialsProvider.getCredentials.mockResolvedValue({
      token: 'app-installation-token',
      headers: { Authorization: 'Bearer app-installation-token' },
      type: 'app' as const,
    } as any);

    const result = await callResolve();

    expect(result).toEqual({
      token: 'app-installation-token',
      apiBaseUrl: 'https://api.github.com',
    });
    expect(mockCredentialsProvider.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/my-org',
    });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[resolveGithubToken] Resolved GitHub credentials for host: github.com',
    );
  });

  it('should fall back to PAT when credentials provider throws', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: 'pat-token', apiBaseUrl: undefined },
    });
    mockCredentialsProvider.getCredentials.mockRejectedValue(
      new Error('No app installation'),
    );

    const result = await callResolve();

    expect(result).toEqual({ token: 'pat-token', apiBaseUrl: undefined });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'GitHub App credentials unavailable for https://github.com/my-org',
      ),
    );
  });

  it('should fall back to PAT when credentials provider returns no token', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: 'pat-token' },
    });
    mockCredentialsProvider.getCredentials.mockResolvedValue({
      token: undefined,
      headers: {},
      type: 'token' as const,
    } as any);

    const result = await callResolve();

    expect(result.token).toBe('pat-token');
  });

  it('should include repository in credentials URL when provided', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: 'pat-token' },
    });
    mockCredentialsProvider.getCredentials.mockResolvedValue({
      token: 'repo-scoped-token',
      headers: {},
      type: 'app' as const,
    } as any);

    await callResolve({ repository: 'my-repo' });

    expect(mockCredentialsProvider.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/my-org/my-repo',
    });
  });

  it('should throw when no integration is configured for the host', async () => {
    mockIntegrations.github.byHost.mockReturnValue(undefined);

    await expect(callResolve({ host: 'unknown.example.com' })).rejects.toThrow(
      'No GitHub integration configured for host: unknown.example.com',
    );
  });

  it('should throw when neither App token nor PAT is available', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: undefined },
    });
    mockCredentialsProvider.getCredentials.mockResolvedValue({
      token: undefined,
      headers: {},
      type: 'token' as const,
    } as any);

    await expect(callResolve()).rejects.toThrow(
      /No credentials for GitHub host: github\.com/,
    );
  });

  it('should include repo in error message when token resolution fails', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: undefined },
    });
    mockCredentialsProvider.getCredentials.mockRejectedValue(
      new Error('no app'),
    );

    await expect(callResolve({ repository: 'my-repo' })).rejects.toThrow(
      'repo: my-repo',
    );
  });

  it('should strip protocol and trailing slash from host when building URL', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: 'pat' },
    });
    mockCredentialsProvider.getCredentials.mockResolvedValue({
      token: 'tok',
      headers: {},
      type: 'app' as const,
    } as any);

    await callResolve({ host: 'https://github.example.com/' });

    expect(mockCredentialsProvider.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.example.com/my-org',
    });
  });

  it('should return apiBaseUrl from integration config', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: {
        token: 'ghe-token',
        apiBaseUrl: 'https://ghe.corp.com/api/v3',
      },
    });
    mockCredentialsProvider.getCredentials.mockResolvedValue({
      token: 'ghe-token',
      headers: {},
      type: 'token' as const,
    } as any);

    const result = await callResolve({ host: 'ghe.corp.com' });

    expect(result.apiBaseUrl).toBe('https://ghe.corp.com/api/v3');
  });

  it('should stringify non-Error exceptions from credentials provider', async () => {
    mockIntegrations.github.byHost.mockReturnValue({
      config: { token: 'pat' },
    });
    mockCredentialsProvider.getCredentials.mockRejectedValue('string-error');

    await callResolve();

    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('string-error'),
    );
  });
});
