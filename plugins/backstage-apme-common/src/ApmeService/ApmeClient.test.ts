/*
 * Copyright Red Hat
 */

import { ConfigReader } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { ApmeClient } from './ApmeClient';

describe('ApmeClient', () => {
  const logger = {
    child: () => logger,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const rootConfig = new ConfigReader({
    ansible: {
      apme: {
        enabled: true,
        baseUrl: 'http://localhost:8080',
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('looks up projects by repo URL and branch', async () => {
    const mockProject = {
      id: 'proj-backup',
      name: 'terrible-playbook-backup',
      repo_url: 'https://github.com/acme/terrible-playbook',
      branch: 'backup',
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProject),
    });

    const client = new ApmeClient({ rootConfig, logger: logger as never });
    const result = await client.getProjectByRepoUrl(
      'https://github.com/acme/terrible-playbook',
      'backup',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/projects/lookup?repo_url=https%3A%2F%2Fgithub.com%2Facme%2Fterrible-playbook&branch=backup',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual(mockProject);
  });

  it('returns null when branch lookup misses', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });

    const client = new ApmeClient({ rootConfig, logger: logger as never });
    await expect(
      client.getProjectByRepoUrl(
        'https://github.com/acme/terrible-playbook',
        'missing',
      ),
    ).resolves.toBeNull();
  });

  it('rethrows non-404 lookup failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    const client = new ApmeClient({ rootConfig, logger: logger as never });
    await expect(
      client.getProjectByRepoUrl('https://github.com/acme/terrible-playbook'),
    ).rejects.toBeInstanceOf(InputError);
  });

  it('fetches activity detail and normalizes remediation classes', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          scan_id: 'scan-1',
          scan_type: 'remediate',
          status: 'completed',
          violations: [{ id: 1, remediation_class: 'auto-fixable' }],
          proposals: [{ id: 'p1', tier: 2 }],
        }),
    });

    const client = new ApmeClient({ rootConfig, logger: logger as never });
    const detail = await client.getActivityDetail('scan-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/activity/scan-1',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(detail.violations[0].remediation_class).toBe(1);
    expect(detail.proposals).toHaveLength(1);
  });
});
