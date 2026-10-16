import { ConfigReader } from '@backstage/config';
import { fetch } from 'undici';
import * as YAML from 'yaml';
import { AAPClient } from './AAPClient';

jest.mock('undici', () => ({ Agent: jest.fn(), fetch: jest.fn() }));

describe('AAP client boundary and lifecycle behavior', () => {
  let client: AAPClient;
  const mockFetch = fetch as unknown as jest.Mock;
  const logger = {
    child: () => logger,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const organization = { id: 1, name: 'Engineering' };
  const project = {
    projectName: 'portal',
    organization,
    scmUrl: 'https://github.com/team/repo',
    scmUpdateOnLaunch: true,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    client = new AAPClient({
      rootConfig: new ConfigReader({
        ansible: {
          rhaap: { baseUrl: 'https://aap.example.com', token: 'server-token' },
        },
        catalog: {
          providers: {
            rhaap: {
              dev: { orgs: ['Engineering', 'Finance'], multiOrgEnabled: true },
            },
          },
        },
        integrations: {
          github: [{ host: 'github.com', token: 'github-token' }],
          gitlab: [{ host: 'gitlab.com', token: 'gitlab-token' }],
        },
      }),
      logger: logger as never,
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it.each([
    {
      name: 'POST',
      call: (service: AAPClient) =>
        service.executePostRequest('/resource', 'token', {}),
      message: 'Failed to send POST request',
    },
    {
      name: 'GET',
      call: (service: AAPClient) =>
        service.executeGetRequest('/resource', 'token'),
      message: 'Failed to send fetch',
    },
    {
      name: 'DELETE',
      call: (service: AAPClient) =>
        service.executeDeleteRequest('/resource', 'token'),
      message: 'Failed to send delete',
    },
  ])(
    'normalizes a non-Error $name transport rejection',
    async ({ call, message }) => {
      mockFetch.mockRejectedValue('offline');
      await expect(call(client)).rejects.toThrow(message);
    },
  );

  it.each([
    { method: 'GET', status: 403, message: 'Insufficient privileges' },
    { method: 'GET', status: 500, message: 'Failed to fetch data' },
    { method: 'DELETE', status: 403, message: 'Insufficient privileges' },
    { method: 'DELETE', status: 500, message: 'Failed to delete' },
  ])(
    'reports $method HTTP $status instead of returning a successful response',
    async ({ method, status, message }) => {
      mockFetch.mockResolvedValue({
        ok: false,
        status,
        statusText: 'Rejected',
      });
      const result =
        method === 'GET'
          ? client.executeGetRequest('/resource', 'token')
          : client.executeDeleteRequest('/resource', 'token');
      await expect(result).rejects.toThrow(message);
      expect(logger.error).toHaveBeenCalled();
    },
  );

  it('aggregates paginated membership data and preserves repeated OR filters', async () => {
    const get = jest
      .spyOn(client, 'executeGetRequest')
      .mockResolvedValueOnce({
        json: async () => ({
          results: [
            { id: 1, name: 'Engineering' },
            { id: 99, name: '' },
          ],
          next: '/api/gateway/v1/users/42/organizations/?page=2',
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          results: [{ id: 2, name: 'Finance' }],
          next: null,
        }),
      });
    await expect(
      client.getOrgsByUserId(42, ['Engineering', 'Finance']),
    ).resolves.toMatchObject([
      { id: 1, name: 'Engineering' },
      { id: 2, name: 'Finance' },
    ]);
    const query = new URL(`https://aap.example.com${get.mock.calls[0][0]}`)
      .searchParams;
    expect(query.getAll('or__name__iexact')).toEqual([
      'Engineering',
      'Finance',
    ]);
    expect(query.get('page_size')).toBe('200');
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/api/gateway/v1/users/42/organizations/?page=2',
      'server-token',
    );
  });

  it('builds multi-organization and label filters without a survey restriction', async () => {
    const get = jest
      .spyOn(client, 'executeGetRequest')
      .mockResolvedValue({ json: async () => ({ results: [], next: null }) });
    await expect(
      client.syncJobTemplates(undefined, ['team', 'production'], ['private']),
    ).resolves.toEqual([]);
    const query = new URL(`https://aap.example.com${get.mock.calls[0][0]}`)
      .searchParams;
    expect(query.getAll('or__organization__name__iexact')).toEqual([
      'engineering',
      'finance',
    ]);
    expect(query.get('labels__name__in')).toBe('team,production');
    expect(query.get('not__labels__name__in')).toBe('private');
    expect(query.has('survey_enabled')).toBe(false);
  });

  it.each(['successful', undefined])(
    'waits for pending project creation until status becomes %s',
    async status => {
      jest.useFakeTimers();
      const remove = jest
        .spyOn(client, 'deleteProjectIfExists')
        .mockResolvedValue(undefined);
      jest.spyOn(client, 'executePostRequest').mockResolvedValue({
        json: async () => ({ ...project, id: 42, status: 'pending' }),
      });
      const get = jest
        .spyOn(client, 'getProject')
        .mockResolvedValueOnce({ ...project, id: 42, status: 'running' })
        .mockResolvedValueOnce({ ...project, id: 42, status });
      const result = client.createProject(project, true, 'token');
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(2000);
      expect(get).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(2000);
      await expect(result).resolves.toMatchObject({ id: 42 });
      expect(get).toHaveBeenCalledTimes(2);
      expect(remove).toHaveBeenCalledWith('portal', organization, 'token');
    },
  );

  it('does not poll a pending project when AAP returned no identifier', async () => {
    jest.spyOn(client, 'executePostRequest').mockResolvedValue({
      json: async () => ({ ...project, status: 'pending' }),
    });
    const get = jest.spyOn(client, 'getProject');
    await expect(
      client.createProject(project, false, 'token'),
    ).resolves.toMatchObject({ status: 'pending' });
    expect(get).not.toHaveBeenCalled();
  });

  it('performs explicitly requested cleanup before creating an execution environment', async () => {
    const remove = jest
      .spyOn(client, 'deleteExecutionEnvironmentExists')
      .mockResolvedValue(undefined);
    const post = jest
      .spyOn(client, 'executePostRequest')
      .mockResolvedValue({ json: async () => ({ id: 7 }) });
    await expect(
      client.createExecutionEnvironment(
        {
          environmentName: 'ee',
          organization,
          image: 'registry.example.com/ee',
          pull: 'always',
        },
        'token',
        true,
      ),
    ).resolves.toMatchObject({ id: 7 });
    expect(remove).toHaveBeenCalledWith('ee', 'token');
    expect(post).toHaveBeenCalledWith(
      'api/controller/v2/execution_environments/',
      'token',
      expect.objectContaining({ name: 'ee', organization: 1 }),
    );
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
      post.mock.invocationCallOrder[0],
    );
  });

  it.each([
    { scmType: 'Github', token: 'github-token', host: 'github.com' },
    { scmType: 'Gitlab', token: 'gitlab-token', host: 'gitlab.com' },
  ])(
    'uses the configured $scmType credential when preparing use-case URLs without mutating the payload',
    async ({ scmType, token, host }) => {
      const remove = jest
        .spyOn(client, 'deleteJobTemplateIfExists')
        .mockResolvedValue(undefined);
      const post = jest
        .spyOn(client, 'executePostRequest')
        .mockResolvedValue({ json: async () => ({ id: 7 }) });
      const payload = {
        templateName: 'job',
        organization,
        project,
        jobInventory: { id: 2, name: 'inventory' },
        playbook: 'playbook.yml',
        scmType,
        credentials: {
          id: 3,
          name: 'scm',
          kind: 'scm',
          inputs: { username: 'robot' },
        },
        extraVariables: { usecases: [{ url: `https://${host}/team/repo` }] },
      };
      const before = JSON.stringify(payload);
      await client.createJobTemplate(payload, true, 'token');
      const variables = YAML.parse(post.mock.calls[0][2].extra_vars);
      expect(variables.usecases[0].url).toBe(
        `https://robot:${token}@${host}/team/repo`,
      );
      expect(variables.aap_hostname).toBe('https://aap.example.com');
      expect(remove).toHaveBeenCalledWith('job', organization, 'token');
      expect(JSON.stringify(payload)).toBe(before);
    },
  );

  it('reports a result-polling failure rather than claiming a launched job succeeded', async () => {
    jest
      .spyOn(client, 'executeGetRequest')
      .mockResolvedValue({ json: async () => ({ results: [{ id: 42 }] }) });
    jest
      .spyOn(client, 'executePostRequest')
      .mockResolvedValue({ json: async () => ({ job: 7 }) });
    jest
      .spyOn(client, 'fetchResult')
      .mockRejectedValue(new Error('Polling failed'));
    await expect(
      client.launchJobTemplate({ template: 'job' }, 'token'),
    ).rejects.toThrow('Job execution failed due to Undefined Error');
    expect(logger.error).toHaveBeenCalledWith(
      'Error while executing job template.',
    );
  });

  it('propagates job status lookup failures while retaining their cause', async () => {
    const error = new Error('Unavailable');
    jest.spyOn(client, 'executeGetRequest').mockRejectedValue(error);
    await expect(client.getJobStatus(7, 'token')).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch job status'),
    );
  });
});
