global.fetch = jest.fn();

jest.mock('@ansible/backstage-rhaap-common', () => ({
  ScmClientFactory: jest.fn(),
}));

import { mockServices } from '@backstage/backend-test-utils';
import { ConfigReader } from '@backstage/config';
import { ScmClientFactory } from '@ansible/backstage-rhaap-common';
import { registerGitRepositoryAction } from './registerGitRepository';

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
const MockScmClientFactory = ScmClientFactory as jest.MockedClass<
  typeof ScmClientFactory
>;

describe('registerGitRepository', () => {
  const logger = mockServices.logger.mock();
  const auth = mockServices.auth.mock();
  const discovery = mockServices.discovery.mock();
  const mockConfig = new ConfigReader({
    integrations: {
      github: [{ host: 'github.com', token: 'test-token' }],
      gitlab: [{ host: 'gitlab.com', token: 'test-token' }],
    },
  });

  let mockScmClient: {
    repositoryExists: jest.Mock;
  };

  function makeCtx(
    values: Record<string, any>,
    ctxOverrides: Record<string, any> = {},
  ) {
    return {
      input: {
        sourceControlProvider: 'github',
        repositoryOwner: 'test-org',
        repositoryName: 'test-repo',
        repositoryUrl: 'https://github.com/test-org/test-repo',
        defaultBranch: 'main',
        owner: 'user:guest',
        ...values,
      },
      logger,
      output: jest.fn(),
      user: { ref: 'user:default/testuser' },
      ...ctxOverrides,
    } as any;
  }

  function makeAction(cfg?: ConfigReader) {
    return registerGitRepositoryAction({
      auth,
      discovery,
      rootConfig: cfg ?? mockConfig,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockScmClient = {
      repositoryExists: jest.fn().mockResolvedValue(true),
    };
    MockScmClientFactory.mockImplementation(
      () =>
        ({
          createClient: jest.fn().mockResolvedValue(mockScmClient),
        }) as any,
    );

    discovery.getBaseUrl.mockResolvedValue('http://localhost:7007/api/catalog');
    auth.getOwnServiceCredentials.mockResolvedValue({
      token: 'service-token',
    } as any);
    auth.getPluginRequestToken.mockResolvedValue({
      token: 'plugin-token',
    } as any);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        success: true,
        entityRef: 'component:default/test-org-test-repo-github-manual',
      }),
      text: jest.fn().mockResolvedValue(''),
    } as any);
  });

  it('checks repository existence before registering', async () => {
    const action = makeAction();
    const ctx = makeCtx({});

    await action.handler(ctx);

    expect(MockScmClientFactory).toHaveBeenCalledWith({
      rootConfig: mockConfig,
      logger,
    });
    expect(mockScmClient.repositoryExists).toHaveBeenCalledWith(
      'test-org',
      'test-repo',
    );
    expect(mockFetch).toHaveBeenCalled();
  });

  it('registers a repository directly with the catalog backend', async () => {
    const action = makeAction();
    const ctx = makeCtx({});

    await action.handler(ctx);

    expect(discovery.getBaseUrl).toHaveBeenCalledWith('catalog');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/catalog/ansible/git-repository',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer plugin-token',
        }),
      }),
    );

    const [, fetchOptions] = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchOptions!.body as string);
    expect(body.entity).toMatchObject({
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        name: 'test-org-test-repo-github-manual',
        annotations: {
          'ansible.io/scm-provider': 'github',
          'ansible.io/scm-organization': 'test-org',
          'ansible.io/scm-repository': 'test-repo',
          'ansible.io/registration-method': 'manual',
          'backstage.io/source-location':
            'url:https://github.com/test-org/test-repo',
        },
      },
      spec: {
        type: 'git-repository',
        owner: 'user:guest',
        repository_default_branch: 'main',
      },
    });

    expect(ctx.output).toHaveBeenCalledWith(
      'entityRef',
      'component:default/test-org-test-repo-github-manual',
    );
  });

  it('falls back to ctx.user.ref when owner is not provided', async () => {
    const action = makeAction();
    const ctx = makeCtx({ owner: undefined });

    await action.handler(ctx);

    const [, fetchOptions] = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchOptions!.body as string);
    expect(body.entity.spec.owner).toBe('user:default/testuser');
  });

  it('prefers an explicit owner input over ctx.user.ref', async () => {
    const action = makeAction();
    const ctx = makeCtx({ owner: 'group:default/my-team' });

    await action.handler(ctx);

    const [, fetchOptions] = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchOptions!.body as string);
    expect(body.entity.spec.owner).toBe('group:default/my-team');
  });

  it('sanitizes owner/repo names into a valid entity name', async () => {
    const action = makeAction();
    const ctx = makeCtx({
      repositoryOwner: 'Test_Org',
      repositoryName: 'Test.Repo!',
    });

    await action.handler(ctx);

    const [, fetchOptions] = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchOptions!.body as string);
    expect(body.entity.metadata.name).toMatch(/^[a-z0-9-]+$/);
  });

  it('throws without calling the catalog backend when the repository does not exist', async () => {
    mockScmClient.repositoryExists.mockResolvedValue(false);

    const action = makeAction();
    const ctx = makeCtx({});

    await expect(action.handler(ctx)).rejects.toThrow(
      'Repository test-org/test-repo does not exist or is not accessible via github.',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when registration fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Server error'),
    } as any);

    const action = makeAction();
    const ctx = makeCtx({});

    await expect(action.handler(ctx)).rejects.toThrow(
      'Failed to register Git repository: Server error',
    );
  });

  it('logs a warning and throws when the repository is already registered (409)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: jest.fn().mockResolvedValue('Repository already registered'),
    } as any);

    const action = makeAction();
    const ctx = makeCtx({});

    await expect(action.handler(ctx)).rejects.toThrow(
      'Failed to register Git repository: Repository already registered',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Repository already registered'),
    );
  });

  it('does not set entityRef output when the response omits it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true }),
      text: jest.fn().mockResolvedValue(''),
    } as any);

    const action = makeAction();
    const ctx = makeCtx({});

    await action.handler(ctx);

    expect(ctx.output).not.toHaveBeenCalled();
  });
});
