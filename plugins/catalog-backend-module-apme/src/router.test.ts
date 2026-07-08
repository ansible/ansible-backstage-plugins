/*
 * Copyright Red Hat
 */

import express from 'express';
import request from 'supertest';
import { ConfigReader } from '@backstage/config';
import { createRouter } from './router';

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
    getOperationState: jest.fn(),
    triggerRemediate: jest.fn(),
    approveProposals: jest.fn(),
    submitRemediation: jest.fn(),
    createPullRequest: jest.fn(),
    getAiModels: jest.fn(),
  };

  const logger = {
    child: () => logger,
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  let app: express.Express;

  beforeEach(async () => {
    jest.clearAllMocks();
    const router = await createRouter({
      apmeService: mockApmeService as never,
      logger: logger as never,
      httpAuth: {
        credentials: jest.fn().mockResolvedValue({}),
      } as never,
      rootConfig: new ConfigReader({
        ansible: { apme: { enabled: true, baseUrl: 'http://localhost:8080' } },
      }),
    });
    app = express().use(router);
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
      .send({
        activity_id: 'scan-1',
        create_pr: true,
        scm_token: 'ghp_test',
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
  });
});
