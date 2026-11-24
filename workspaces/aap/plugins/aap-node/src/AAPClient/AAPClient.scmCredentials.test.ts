import { ConfigReader } from '@backstage/config';
import * as YAML from 'yaml';
import { AAPClient } from './AAPClient';

jest.mock('undici', () => ({ Agent: jest.fn(), fetch: jest.fn() }));

type IntegrationConfig = {
  github?: Array<{ host: string; token?: string }>;
  gitlab?: Array<{ host: string; token?: string }>;
};

describe('AAP job-template SCM credential boundaries', () => {
  const logger = {
    child: () => logger,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const integrations: IntegrationConfig = {
    github: [{ host: 'github.com', token: 'github-token' }],
    gitlab: [{ host: 'gitlab.com', token: 'gitlab-token' }],
  };
  const organization = { id: 1, name: 'Engineering' };
  const createClient = (configured: IntegrationConfig = integrations) =>
    new AAPClient({
      rootConfig: new ConfigReader({
        ansible: { rhaap: { baseUrl: 'https://aap.example.com' } },
        integrations: configured,
      }),
      logger: logger as never,
    });

  async function createTemplate(
    client: AAPClient,
    extraVariables: object,
    scmType = 'Github',
    username: string | null = 'robot',
  ) {
    const post = jest.spyOn(client, 'executePostRequest').mockResolvedValue({
      json: async () => ({ id: 7 }),
    });
    const payload = {
      templateName: 'job',
      organization,
      project: {
        projectName: 'project',
        organization,
        scmUrl: 'https://github.com/team/repo',
      },
      jobInventory: { id: 2, name: 'inventory' },
      playbook: 'playbook.yml',
      scmType,
      credentials: {
        id: 3,
        name: 'scm',
        kind: 'scm',
        inputs: username === null ? undefined : { username },
      },
      extraVariables,
    };
    const before = JSON.stringify(payload);
    await client.createJobTemplate(payload, false, 'aap-token');
    expect(JSON.stringify(payload)).toBe(before);
    return YAML.parse(post.mock.calls[0][2].extra_vars);
  }

  afterEach(() => jest.restoreAllMocks());

  it.each([
    { scmType: 'Github', host: 'github.com', token: 'github-token' },
    { scmType: 'Gitlab', host: 'gitlab.com', token: 'gitlab-token' },
  ])(
    'adds only the selected $scmType credential to its exact HTTPS host',
    async ({ scmType, host, token }) => {
      const variables = await createTemplate(
        createClient(),
        {
          usecases: [
            {
              url: `https://${host}/team/repo?ref=main#readme`,
              label: 'Source',
            },
          ],
        },
        scmType,
      );
      const url = new URL(variables.usecases[0].url);
      expect(url.host).toBe(host);
      expect(url.username).toBe('robot');
      expect(url.password).toBe(token);
      expect(url.pathname).toBe('/team/repo');
      expect(url.search).toBe('?ref=main');
      expect(url.hash).toBe('#readme');
      expect(variables.usecases[0].label).toBe('Source');
    },
  );

  it.each([
    ['Github', 'https://gitlab.com/team/repo'],
    ['Gitlab', 'https://github.com/team/repo'],
    ['Github', 'https://github.com.attacker.example/team/repo'],
    ['Github', 'https://github.com@attacker.example/team/repo'],
    ['Github', 'https://attacker.example/?next=https://github.com/team/repo'],
    ['Github', 'http://github.com/team/repo'],
    ['Github', 'https://github.com:8443/team/repo'],
    ['Github', 'ssh://github.com/team/repo'],
    ['Github', '//github.com/team/repo'],
    ['Github', 'not a URL https://github.com/team/repo'],
    ['Github', 'https://existing:secret@github.com/team/repo'],
    ['Unsupported', 'https://github.com/team/repo'],
  ])(
    'does not add integration credentials for %s at %s',
    async (scmType, url) => {
      const variables = await createTemplate(
        createClient(),
        { usecases: [{ url }] },
        scmType,
      );
      expect(variables.usecases[0].url).toBe(url);
      expect(JSON.stringify(variables)).not.toContain('github-token');
      expect(JSON.stringify(variables)).not.toContain('gitlab-token');
    },
  );

  it('filters each URL independently in a mixed collection of use cases', async () => {
    const variables = await createTemplate(createClient(), {
      usecases: [
        { url: 'https://github.com/team/repo' },
        { url: 'https://attacker.example/team/repo' },
      ],
    });
    expect(variables.usecases.map((item: { url: string }) => item.url)).toEqual(
      [
        'https://robot:github-token@github.com/team/repo',
        'https://attacker.example/team/repo',
      ],
    );
  });

  it('supports a configured enterprise host and port without exposing its token to another configured host', async () => {
    const client = createClient({
      github: [
        { host: 'git.example.com:8443', token: 'enterprise-token' },
        { host: 'github.com', token: 'other-token' },
      ],
    });
    const variables = await createTemplate(client, {
      usecases: [
        { url: 'https://git.example.com:8443/team/repo' },
        { url: 'https://github.com/team/repo' },
        { url: 'https://git.example.com/team/repo' },
      ],
    });
    expect(variables.usecases.map((item: { url: string }) => item.url)).toEqual(
      [
        'https://robot:enterprise-token@git.example.com:8443/team/repo',
        'https://github.com/team/repo',
        'https://git.example.com/team/repo',
      ],
    );
  });

  it('encodes credential characters instead of allowing them to change the URL host', async () => {
    const variables = await createTemplate(
      createClient({
        github: [{ host: 'github.com', token: 'secret@:/?#' }],
      }),
      { usecases: [{ url: 'https://GITHUB.com/team/repo' }] },
      'Github',
      'robot@corp',
    );
    const url = new URL(variables.usecases[0].url);
    expect(url.host).toBe('github.com');
    expect(decodeURIComponent(url.username)).toBe('robot@corp');
    expect(decodeURIComponent(url.password)).toBe('secret@:/?#');
  });

  it.each([null, ''])(
    'does not insert incomplete credentials when username is %s',
    async username => {
      const url = 'https://github.com/team/repo';
      const variables = await createTemplate(
        createClient(),
        { usecases: [{ url }] },
        'Github',
        username,
      );
      expect(variables.usecases[0].url).toBe(url);
    },
  );

  it('does not insert a missing integration token', async () => {
    const url = 'https://github.com/team/repo';
    const variables = await createTemplate(
      createClient({ github: [{ host: 'github.com' }] }),
      { usecases: [{ url }] },
    );
    expect(variables.usecases[0].url).toBe(url);
  });

  it.each([
    { other: 'setting' },
    { usecases: null },
    { usecases: 'not a list' },
    { usecases: [null, {}, { url: 17 }] },
  ])(
    'preserves settings that have no usable use-case URL: %j',
    async extraVariables => {
      const variables = await createTemplate(createClient(), extraVariables);
      expect(variables).toMatchObject(extraVariables);
      expect(JSON.stringify(variables)).not.toContain('github-token');
    },
  );
});
