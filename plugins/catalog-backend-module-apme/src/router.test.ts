/*
 * Copyright Red Hat
 */

import express from 'express';
import request from 'supertest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { ConfigReader } from '@backstage/config';
import { InputError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { createRouter } from './router';
import { ApmePortalSettingsStore } from './apmePortalSettingsStore';

describe('catalog-backend-module-apme router', () => {
  const mockApmeService = {
    getHealth: jest.fn(),
    getProjects: jest.fn(),
    getProject: jest.fn(),
    getProjectByRepoUrl: jest.fn(),
    getViolations: jest.fn(),
    getProjectDependencies: jest.fn(),
    getRules: jest.fn(),
    updateRuleConfig: jest.fn(),
    deleteRuleConfig: jest.fn(),
    createSuppression: jest.fn(),
    deleteSuppression: jest.fn(),
    getSuppressions: jest.fn(),
    triggerScan: jest.fn(),
    createProject: jest.fn(),
    deleteProject: jest.fn(),
    getActivity: jest.fn(),
    getActivityDetail: jest.fn(),
    getOperationState: jest.fn(),
    triggerRemediate: jest.fn(),
    approveProposals: jest.fn(),
    submitRemediation: jest.fn(),
    createPullRequest: jest.fn(),
    getAiModels: jest.fn(),
    getAiConfig: jest.fn(),
    updateAiConfig: jest.fn(),
    getAiProviders: jest.fn(),
    getAiEngines: jest.fn(),
    configureAiProvider: jest.fn(),
    deleteAiProvider: jest.fn(),
    listGalaxyServers: jest.fn(),
    createGalaxyServer: jest.fn(),
    updateGalaxyServer: jest.fn(),
    deleteGalaxyServer: jest.fn(),
  };

  const logger = {
    child: () => logger,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockPermissions = {
    authorize: jest.fn().mockResolvedValue([{ result: AuthorizeResult.ALLOW }]),
    authorizeConditional: jest.fn().mockResolvedValue([]),
  };

  let app: express.Express;
  let settingsPath: string;
  let portalSettingsStore: ApmePortalSettingsStore;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockApmeService.getProject.mockResolvedValue({
      id: 'proj-1',
      name: 'terrible-playbook',
      repo_url: 'https://github.com/acme/terrible-playbook',
      branch: 'main',
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: 'main' }),
      })
      .mockResolvedValueOnce({ ok: true }) as jest.Mock;
    settingsPath = path.join(
      os.tmpdir(),
      `apme-portal-settings-${Date.now()}-${Math.random()}.json`,
    );
    portalSettingsStore = new ApmePortalSettingsStore(settingsPath);
    const router = await createRouter({
      apmeService: mockApmeService as never,
      logger: logger as never,
      httpAuth: {
        credentials: jest.fn().mockResolvedValue({}),
      } as never,
      rootConfig: new ConfigReader({
        ansible: { apme: { enabled: true, baseUrl: 'http://localhost:8080' } },
        integrations: {
          github: [{ host: 'github.com', token: 'test-token' }],
        },
      }),
      portalSettingsStore,
      permissions: mockPermissions as never,
    });
    app = express().use(router);
    app.use(
      (
        err: unknown,
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        if (err instanceof InputError) {
          res.status(400).json({ error: err.message });
          return;
        }
        next(err);
      },
    );
  });

  afterEach(async () => {
    await fs.unlink(settingsPath).catch(() => undefined);
  });

  it('looks up projects by repo URL and branch', async () => {
    const project = {
      id: 'proj-main',
      name: 'terrible-playbook-main',
      repo_url: 'https://github.com/acme/terrible-playbook',
      branch: 'main',
    };
    mockApmeService.getProjectByRepoUrl.mockResolvedValueOnce(project);

    const response = await request(app).get(
      '/apme/lookup?repo_url=https%3A%2F%2Fgithub.com%2Facme%2Fterrible-playbook&branch=main',
    );

    expect(response.status).toBe(200);
    expect(mockApmeService.getProjectByRepoUrl).toHaveBeenCalledWith(
      'https://github.com/acme/terrible-playbook',
      'main',
    );
    expect(response.body).toEqual(project);
  });

  it('returns 404 when lookup misses', async () => {
    mockApmeService.getProjectByRepoUrl.mockResolvedValueOnce(null);

    const response = await request(app).get(
      '/apme/lookup?repo_url=https%3A%2F%2Fgithub.com%2Facme%2Fmissing',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Project not found' });
  });

  it('returns project dependencies', async () => {
    const deps = {
      ansible_core_version: '2.16.0',
      collections: [
        { fqcn: 'ansible.posix', version: '1.5.4', source: 'specified' },
      ],
      python_packages: [{ name: 'cryptography', version: '41.0.0' }],
      requirements_files: ['requirements.txt'],
      dependency_tree: '',
    };
    mockApmeService.getProjectDependencies.mockResolvedValueOnce(deps);

    const response = await request(app).get(
      '/apme/projects/proj-1/dependencies',
    );

    expect(response.status).toBe(200);
    expect(mockApmeService.getProjectDependencies).toHaveBeenCalledWith(
      'proj-1',
    );
    expect(response.body).toEqual(deps);
  });

  it('creates a suppression', async () => {
    const suppression = {
      id: 1,
      fingerprint_hash: 'abc',
      fingerprint_mode: 'rule_only',
      rule_id: 'R200',
      scope: 'project:proj-1',
      reason: 'Acknowledged from portal',
      created_by: '',
      created_at: '2026-07-06T00:00:00Z',
    };
    mockApmeService.createSuppression.mockResolvedValueOnce(suppression);

    const response = await request(app).post('/apme/suppressions').send({
      rule_id: 'R200',
      fingerprint_mode: 'rule_only',
      original_yaml: '',
      scope: 'project:proj-1',
      reason: 'Acknowledged from portal',
    });

    expect(response.status).toBe(201);
    expect(mockApmeService.createSuppression).toHaveBeenCalledWith({
      rule_id: 'R200',
      fingerprint_mode: 'rule_only',
      original_yaml: '',
      scope: 'project:proj-1',
      reason: 'Acknowledged from portal',
    });
    expect(response.body).toEqual(suppression);
  });

  it('submits remediation via gateway SCM endpoint', async () => {
    const submitResult = {
      branch_name: 'apme/remediate-abc12345',
      commit_sha: 'deadbeef',
      pr_url: 'https://github.com/org/repo/pull/1',
      provider: 'github',
    };
    mockApmeService.submitRemediation.mockResolvedValueOnce(submitResult);

    const response = await request(app)
      .post('/apme/projects/proj-1/submit')
      .set('X-SCM-Token', 'ghp_test')
      .send({
        activity_id: 'scan-1',
        create_pr: true,
      });

    expect(response.status).toBe(200);
    expect(mockApmeService.submitRemediation).toHaveBeenCalledWith('proj-1', {
      activity_id: 'scan-1',
      branch_name: undefined,
      create_pr: true,
      title: undefined,
      body: undefined,
      scm_token: 'ghp_test',
    });
    expect(response.body).toEqual(submitResult);

    const stored = await portalSettingsStore.read();
    expect(stored.activities?.['scan-1']).toEqual({
      branch_name: 'apme/remediate-abc12345',
      pr_url: 'https://github.com/org/repo/pull/1',
    });
  });

  it('merges persisted activity outcomes into GET activity', async () => {
    await portalSettingsStore.updateActivityOutcome('scan-rem-1', {
      branch_name: 'apme/remediate-stored',
      pr_url: null,
    });

    const activity = [
      {
        scan_id: 'scan-rem-1',
        scan_type: 'remediate',
        created_at: '2026-07-08T00:00:00Z',
        remediated_count: 5,
      },
    ];
    mockApmeService.getActivity.mockResolvedValueOnce(activity);

    const response = await request(app).get('/apme/projects/proj-1/activity');

    expect(response.status).toBe(200);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        scan_id: 'scan-rem-1',
        branch_name: 'apme/remediate-stored',
        pr_url: null,
      }),
    );
  });

  it('resolves integration token when X-SCM-Token is absent', async () => {
    const submitResult = {
      branch_name: 'apme/remediate-abc12345',
      commit_sha: 'deadbeef',
      pr_url: 'https://github.com/org/repo/pull/2',
      provider: 'github',
    };
    mockApmeService.submitRemediation.mockResolvedValueOnce(submitResult);
    mockApmeService.getProject.mockResolvedValueOnce({
      id: 'proj-1',
      name: 'terrible-playbook',
      repo_url: 'https://github.com/acme/terrible-playbook',
      branch: 'main',
    });

    const response = await request(app)
      .post('/apme/projects/proj-1/submit')
      .send({
        activity_id: 'scan-1',
        create_pr: true,
      });

    expect(response.status).toBe(200);
    expect(mockApmeService.getProject).toHaveBeenCalledWith('proj-1');
    expect(mockApmeService.submitRemediation).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({
        activity_id: 'scan-1',
        create_pr: true,
        // ConfigReader in beforeEach has integrations.github token: test-token
        scm_token: 'test-token',
      }),
    );
    expect(response.body).toEqual(submitResult);
  });

  it('returns project activity history', async () => {
    const activity = [
      {
        scan_id: 'scan-1',
        scan_type: 'check',
        status: 'completed',
        created_at: '2026-07-08T00:00:00Z',
      },
    ];
    mockApmeService.getActivity.mockResolvedValueOnce(activity);

    const response = await request(app).get('/apme/projects/proj-1/activity');

    expect(response.status).toBe(200);
    expect(mockApmeService.getActivity).toHaveBeenCalledWith('proj-1');
    expect(response.body).toEqual(activity);
  });

  it('returns activity detail with proposals', async () => {
    const detail = {
      scan_id: 'scan-1',
      scan_type: 'remediate',
      status: 'completed',
      proposals: [{ id: 'p1', tier: 2 }],
      violations: [],
    };
    mockApmeService.getActivityDetail.mockResolvedValueOnce(detail);

    const response = await request(app).get('/apme/activity/scan-1');

    expect(response.status).toBe(200);
    expect(mockApmeService.getActivityDetail).toHaveBeenCalledWith('scan-1');
    expect(response.body).toEqual(detail);
  });

  it('returns merged portal settings with persisted global default', async () => {
    await portalSettingsStore.updateGlobal('2.17');

    const response = await request(app).get('/apme/settings');

    expect(response.status).toBe(200);
    expect(response.body.targetAnsibleCoreVersion).toBe('2.17');
  });

  it('persists global default via PUT /apme/settings', async () => {
    const response = await request(app)
      .put('/apme/settings')
      .send({ targetAnsibleCoreVersion: '2.18' });

    expect(response.status).toBe(200);
    expect(response.body.targetAnsibleCoreVersion).toBe('2.18');

    const stored = await portalSettingsStore.read();
    expect(stored.global?.targetAnsibleCoreVersion).toBe('2.18');
  });

  it('persists default AI model via PUT /apme/settings', async () => {
    const response = await request(app)
      .put('/apme/settings')
      .send({ defaultAiModelId: 'test/gpt-oss-120b' });

    expect(response.status).toBe(200);
    expect(response.body.defaultAiModelId).toBe('test/gpt-oss-120b');

    const stored = await portalSettingsStore.read();
    expect(stored.global?.defaultAiModelId).toBe('test/gpt-oss-120b');
  });

  it('lists galaxy servers via GET /apme/settings/galaxy-servers', async () => {
    const servers = [
      {
        id: 1,
        name: 'galaxy',
        url: 'https://galaxy.ansible.com/api/',
        auth_url: '',
        has_token: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    mockApmeService.listGalaxyServers.mockResolvedValueOnce(servers);

    const response = await request(app).get('/apme/settings/galaxy-servers');

    expect(response.status).toBe(200);
    expect(mockApmeService.listGalaxyServers).toHaveBeenCalled();
    expect(response.body).toEqual(servers);
  });

  it('creates galaxy server via POST /apme/settings/galaxy-servers', async () => {
    const created = {
      id: 2,
      name: 'automation_hub',
      url: 'https://console.redhat.com/api/automation-hub/',
      auth_url: '',
      has_token: true,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };
    mockApmeService.createGalaxyServer.mockResolvedValueOnce(created);

    const response = await request(app)
      .post('/apme/settings/galaxy-servers')
      .send({
        name: 'automation_hub',
        url: 'https://console.redhat.com/api/automation-hub/',
        token: 'secret',
      });

    expect(response.status).toBe(201);
    expect(mockApmeService.createGalaxyServer).toHaveBeenCalledWith({
      name: 'automation_hub',
      url: 'https://console.redhat.com/api/automation-hub/',
      token: 'secret',
      auth_url: undefined,
    });
    expect(response.body).toEqual(created);
  });

  it('deletes galaxy server via DELETE /apme/settings/galaxy-servers/:id', async () => {
    mockApmeService.deleteGalaxyServer.mockResolvedValueOnce(undefined);

    const response = await request(app).delete(
      '/apme/settings/galaxy-servers/3',
    );

    expect(response.status).toBe(204);
    expect(mockApmeService.deleteGalaxyServer).toHaveBeenCalledWith(3);
  });

  it('resolves per-project scan target with override', async () => {
    await portalSettingsStore.updateGlobal('2.17');
    await portalSettingsStore.updateProjectTarget('proj-1', '2.16');

    const response = await request(app).get(
      '/apme/projects/proj-1/scan-target',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      effective: '2.16',
      source: 'project',
      globalDefault: '2.17',
      projectOverride: '2.16',
    });
  });

  it('clears project override when target is null', async () => {
    await portalSettingsStore.updateGlobal('2.17');
    await portalSettingsStore.updateProjectTarget('proj-1', '2.16');

    const response = await request(app)
      .put('/apme/projects/proj-1/scan-target')
      .send({ targetAnsibleCoreVersion: null });

    expect(response.status).toBe(200);
    expect(response.body.effective).toBe('2.17');
    expect(response.body.projectOverride).toBeUndefined();
  });

  it('passes resolved ansible_version when triggering scan', async () => {
    await portalSettingsStore.updateProjectTarget('proj-1', '2.16');
    (global.fetch as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: 'main' }),
      })
      .mockResolvedValueOnce({ ok: true });
    (global.fetch as jest.Mock).mockReset().mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ operation_id: 'scan-1' }),
      body: null,
    });

    const response = await request(app)
      .post('/apme/projects/proj-1/operation')
      .send({ action: 'check' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ operation_id: 'scan-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/projects/proj-1/operation',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-SCM-Token': 'test-token',
        }),
      }),
    );
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(body.scm_token).toBe('test-token');
    expect(body.file_overrides).toBeUndefined();
  });

  it('proxies operation subpaths to the Gateway', async () => {
    (global.fetch as jest.Mock).mockReset().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ status: 'ok' }),
      body: null,
    });

    const response = await request(app)
      .post('/apme/projects/proj-1/operation/approve')
      .send({ approved_ids: ['p1'] });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/projects/proj-1/operation/approve',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects file_overrides on legacy submit (ADR-056)', async () => {
    const response = await request(app)
      .post('/apme/projects/proj-1/submit')
      .send({
        activity_id: 'act-1',
        file_overrides: { 'playbook.yml': '---\n' },
      });

    expect(response.status).toBe(400);
    expect(mockApmeService.submitRemediation).not.toHaveBeenCalled();
  });

  it('rejects createProject when the branch does not exist', async () => {
    (global.fetch as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: 'master' }),
      })
      .mockResolvedValueOnce({ ok: false });

    const response = await request(app).post('/apme/projects').send({
      name: 'test-repo',
      repo_url: 'https://github.com/acme/terrible-playbook',
      branch: 'main',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Branch 'main' was not found");
    expect(mockApmeService.createProject).not.toHaveBeenCalled();
  });

  it('validates branch via branch-check endpoint', async () => {
    (global.fetch as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: 'main' }),
      })
      .mockResolvedValueOnce({ ok: true });

    const response = await request(app).get(
      '/apme/repos/branch-check?repo_url=https%3A%2F%2Fgithub.com%2Facme%2Fterrible-playbook&branch=main',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true });
  });

  // US-016: AI provider CRUD routes
  it('returns normalised AI providers list', async () => {
    mockApmeService.getAiProviders.mockResolvedValueOnce([
      { id: 'my-openrouter', engine: 'openrouter', models: { 'gpt-4o': {} } },
    ]);

    const response = await request(app).get('/apme/ai/providers');

    expect(response.status).toBe(200);
    expect(mockApmeService.getAiProviders).toHaveBeenCalled();
    expect(response.body).toEqual([
      { id: 'my-openrouter', engine: 'openrouter', models: ['gpt-4o'] },
    ]);
  });

  it('proxies configureAiProvider with envVarName + secretStorage (deploy-time secrets)', async () => {
    mockApmeService.configureAiProvider.mockResolvedValueOnce({ ok: true });

    const response = await request(app)
      .post('/apme/ai/provider/my-openrouter/configure')
      .send({
        engine: 'openrouter',
        envVarName: 'OPENROUTER_API_KEY',
        secretStorage: 'env',
      });

    expect(response.status).toBe(200);
    expect(mockApmeService.configureAiProvider).toHaveBeenCalledWith(
      'my-openrouter',
      {
        engine: 'openrouter',
        envVarName: 'OPENROUTER_API_KEY',
        secretStorage: 'env',
      },
    );
  });

  it('proxies configureAiProvider apiKey body through (keytar host path)', async () => {
    mockApmeService.configureAiProvider.mockResolvedValueOnce({ ok: true });

    const response = await request(app)
      .post('/apme/ai/provider/my-openrouter/configure')
      .send({ engine: 'openrouter', apiKey: 'sk-xxx' });

    expect(response.status).toBe(200);
    expect(mockApmeService.configureAiProvider).toHaveBeenCalledWith(
      'my-openrouter',
      { engine: 'openrouter', apiKey: 'sk-xxx' },
    );
  });

  it('rejects unsafe AI provider ids on configure', async () => {
    const response = await request(app)
      .post('/apme/ai/provider/bad;id/configure')
      .send({ engine: 'openrouter', envVarName: 'OPENROUTER_API_KEY' });

    expect(response.status).toBe(400);
    expect(mockApmeService.configureAiProvider).not.toHaveBeenCalled();
  });

  it('deletes an AI provider and returns 204', async () => {
    mockApmeService.deleteAiProvider.mockResolvedValueOnce(undefined);

    const response = await request(app).delete(
      '/apme/ai/provider/my-openrouter',
    );

    expect(response.status).toBe(204);
    expect(mockApmeService.deleteAiProvider).toHaveBeenCalledWith(
      'my-openrouter',
    );
  });

  it('returns AI status connected from Abbenay health when models list is empty', async () => {
    mockApmeService.getAiModels.mockResolvedValueOnce([]);
    mockApmeService.getAiConfig.mockRejectedValueOnce(new Error('config down'));
    mockApmeService.getAiEngines.mockRejectedValueOnce(
      new Error('engines down'),
    );
    mockApmeService.getHealth.mockResolvedValueOnce({
      status: 'healthy',
      components: [{ name: 'Abbenay AI', status: 'ok' }],
    });

    const response = await request(app).get('/apme/ai/status');

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.modelCount).toBe(0);
  });

  it('reports configuredModelCount without using it as inference modelCount', async () => {
    mockApmeService.getAiModels.mockResolvedValueOnce([]);
    mockApmeService.getAiConfig.mockResolvedValueOnce({
      config: {
        providers: {
          test: {
            engine: 'openai',
            models: {
              'gpt-oss-120b': {},
              'deepseek-r1-distill-qwen-14b': {},
            },
          },
        },
      },
    });

    const response = await request(app).get('/apme/ai/status');

    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.modelCount).toBe(0);
    expect(response.body.configuredModelCount).toBe(2);
  });

  it('returns empty AI models when inference list is empty (no config synthesis)', async () => {
    mockApmeService.getAiModels.mockResolvedValueOnce([]);

    const response = await request(app).get('/apme/ai/models');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(mockApmeService.getAiConfig).not.toHaveBeenCalled();
  });

  it('returns AI config', async () => {
    const cfg = { config: { providers: {} } };
    mockApmeService.getAiConfig.mockResolvedValueOnce(cfg);

    const response = await request(app).get('/apme/ai/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(cfg);
  });

  it('returns AI engines list from GET /apme/ai/engines', async () => {
    const engines = {
      engines: [
        { id: 'openai', requiresKey: true, defaultEnvVar: 'OPENAI_API_KEY' },
        {
          id: 'ollama',
          requiresKey: false,
          defaultBaseUrl: 'http://localhost:11434',
        },
        { id: 'redhat', requiresKey: true },
      ],
    };
    mockApmeService.getAiEngines.mockResolvedValueOnce(engines);

    const response = await request(app).get('/apme/ai/engines');

    expect(response.status).toBe(200);
    expect(mockApmeService.getAiEngines).toHaveBeenCalled();
    expect(response.body).toEqual(engines);
  });

  /**
   * Regression: APME shares the catalog plugin HTTP stack. A global
   * `router.use(json())` consumes POST bodies before core catalog routes
   * (e.g. /entities/by-refs) can parse them → 500 "stream is not readable".
   * This test fails if that anti-pattern is reintroduced.
   */
  it('does not consume request bodies for non-APME catalog POSTs (by-refs)', async () => {
    const composed = express();
    composed.use(app);
    composed.post('/entities/by-refs', express.json(), (req, res) => {
      res.status(200).json({ entityRefs: req.body?.entityRefs ?? null });
    });

    const response = await request(composed)
      .post('/entities/by-refs')
      .set('Content-Type', 'application/json')
      .send({ entityRefs: ['component:default/demo-repo'] });

    expect(response.status).toBe(200);
    expect(response.body.entityRefs).toEqual(['component:default/demo-repo']);
  });

  it('updates rule config via PUT /apme/rules/:ruleId/config', async () => {
    const updated = { id: 'M001', enabled: false, hasOverride: true };
    mockApmeService.updateRuleConfig.mockResolvedValueOnce(updated);

    const response = await request(app)
      .put('/apme/rules/M001/config')
      .send({ enabled_override: false });

    expect(response.status).toBe(200);
    expect(mockApmeService.updateRuleConfig).toHaveBeenCalledWith('M001', {
      enabled_override: false,
    });
    expect(response.body).toEqual(updated);
  });

  it('resets rule config via DELETE /apme/rules/:ruleId/config', async () => {
    mockApmeService.deleteRuleConfig.mockResolvedValueOnce(undefined);

    const response = await request(app).delete('/apme/rules/M001/config');

    expect(response.status).toBe(204);
    expect(mockApmeService.deleteRuleConfig).toHaveBeenCalledWith('M001');
  });

  it('returns 403 on PUT /apme/settings when permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app)
      .put('/apme/settings')
      .send({ targetAnsibleCoreVersion: '2.18' });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain(
      'ansible.settings.edit permission required for capability apme',
    );
  });

  it('returns 403 on POST /apme/settings/galaxy-servers when permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app)
      .post('/apme/settings/galaxy-servers')
      .send({ name: 'test', url: 'https://galaxy.example.com/api/' });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain(
      'ansible.settings.edit permission required for capability apme',
    );
  });

  it('returns 403 on PUT /apme/rules/:ruleId/config when permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app)
      .put('/apme/rules/M001/config')
      .send({ enabled_override: false });

    expect(response.status).toBe(403);
    expect(mockApmeService.updateRuleConfig).not.toHaveBeenCalled();
    expect(response.body.error).toContain(
      'ansible.settings.edit permission required for capability apme',
    );
  });

  it('returns 403 on DELETE /apme/rules/:ruleId/config when permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app).delete('/apme/rules/M001/config');

    expect(response.status).toBe(403);
    expect(mockApmeService.deleteRuleConfig).not.toHaveBeenCalled();
    expect(response.body.error).toContain(
      'ansible.settings.edit permission required for capability apme',
    );
  });

  it('still allows GET /apme/rules regardless of settings permission', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);
    mockApmeService.getRules.mockResolvedValueOnce([{ id: 'M001' }]);

    const response = await request(app).get('/apme/rules');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [{ id: 'M001' }] });
  });

  it('returns 403 on GET /apme/settings/galaxy-servers when view permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app).get('/apme/settings/galaxy-servers');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain(
      'ansible.settings.view permission required for capability apme',
    );
  });

  it('returns 403 on GET /apme/ai/config when view permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app).get('/apme/ai/config');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain(
      'ansible.settings.view permission required for capability apme',
    );
  });

  it('returns 403 on GET /apme/ai/engines when view permission is DENY', async () => {
    mockPermissions.authorize.mockResolvedValueOnce([
      { result: AuthorizeResult.DENY },
    ]);

    const response = await request(app).get('/apme/ai/engines');

    expect(response.status).toBe(403);
    expect(response.body.error).toContain(
      'ansible.settings.view permission required for capability apme',
    );
  });

  it('still allows shared GET routes regardless of settings view permission', async () => {
    mockPermissions.authorize.mockResolvedValue([
      { result: AuthorizeResult.DENY },
    ]);

    mockApmeService.getAiModels.mockResolvedValueOnce([]);
    const modelsRes = await request(app).get('/apme/ai/models');
    expect(modelsRes.status).toBe(200);

    mockApmeService.getAiProviders.mockResolvedValueOnce([]);
    const providersRes = await request(app).get('/apme/ai/providers');
    expect(providersRes.status).toBe(200);

    const settingsRes = await request(app).get('/apme/settings');
    expect(settingsRes.status).toBe(200);

    // Restore default ALLOW for subsequent tests
    mockPermissions.authorize.mockResolvedValue([
      { result: AuthorizeResult.ALLOW },
    ]);
  });
});
