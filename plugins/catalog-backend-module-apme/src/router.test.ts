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
    getRules: jest.fn(),
    triggerScan: jest.fn(),
    createProject: jest.fn(),
    deleteProject: jest.fn(),
    getActivity: jest.fn(),
    getOperationState: jest.fn(),
    triggerRemediate: jest.fn(),
    approveProposals: jest.fn(),
    getRemediationBundle: jest.fn(),
    pushRemediationBranch: jest.fn(),
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
});
