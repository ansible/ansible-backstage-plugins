import http from 'http';
import express from 'express';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type {
  HttpAuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import {
  remediateLaunchPermission,
  scanLaunchPermission,
  scanReadPermission,
} from '@ansible/compliance-common';
import { createRouter } from './router';
import type { ComplianceDatabase } from './database/ComplianceDatabase';
import type { ComplianceService } from './service/ComplianceService';

async function testRequest(
  app: express.Express,
  options: { method?: string; path: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  const response = await fetch(`http://127.0.0.1:${addr.port}${options.path}`, {
    method: options.method ?? 'GET',
    headers:
      options.body === undefined
        ? undefined
        : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep the raw body */
  }
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
  return { status: response.status, body };
}

function createHarness(
  allowed: string[],
  options?: { authenticated?: boolean },
) {
  const allowedNames = new Set(allowed);
  const authorize = jest.fn(
    async (requests: Array<{ permission: { name: string } }>) =>
      requests.map(request => ({
        result: allowedNames.has(request.permission.name)
          ? AuthorizeResult.ALLOW
          : AuthorizeResult.DENY,
      })),
  );
  const httpAuth = {
    credentials: jest.fn(async () => {
      if (options?.authenticated === false) {
        throw new Error('Missing credentials');
      }
      return {
        principal: { type: 'user', userEntityRef: 'user:default/reader' },
      };
    }),
  };
  const getProfiles = jest.fn(async () => [{ id: 'rhel9-stig' }]);
  const getRemediationProfiles = jest.fn(async () => [
    { id: 'rp-1', name: 'SSH hardening' },
  ]);
  const listProfiles = jest.fn(async () => [
    { id: 'rhel9-stig', displayName: 'STIG for RHEL 9' },
  ]);
  const getInventories = jest.fn(async () => [{ id: 7, name: 'lab' }]);
  const getAllBaselineTargets = jest.fn(async () => []);
  const getProfile = jest.fn(async () => ({
    id: 'rhel9-stig',
    platformSpec: null,
  }));
  const saveRemediationProfile = jest.fn(async () => ({ id: 'rp-1' }));
  const connectProfile = jest.fn(async () => ({ id: 'profile-1' }));

  return {
    authorize,
    getProfiles,
    getProfile,
    getRemediationProfiles,
    listProfiles,
    saveRemediationProfile,
    connectProfile,
    app: async () => {
      const router = await createRouter({
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
          child: jest.fn().mockReturnThis(),
        } as never,
        service: {
          getProfiles,
          getInventories,
          getRemediationProfiles,
          saveRemediationProfile,
        } as unknown as ComplianceService,
        database: {
          getProfile,
          connectProfile,
          listProfiles,
          getAllBaselineTargets,
          getStaleRunningExecutions: jest.fn(async () => []),
          getRecentExecutions: jest.fn(async () => []),
        } as unknown as ComplianceDatabase,
        httpAuth: httpAuth as unknown as HttpAuthService,
        permissions: { authorize } as unknown as PermissionsService,
      });
      const app = express();
      app.use(router);
      return app;
    },
  };
}

describe('compliance permission gates', () => {
  it('leaves GET /health unauthenticated', async () => {
    const harness = createHarness([]);
    const app = await harness.app();

    const res = await testRequest(app, { path: '/health' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
    expect(harness.authorize).not.toHaveBeenCalled();
  });

  it('requires compliance.scan.read for GET routes', async () => {
    const denied = createHarness([scanLaunchPermission.name]);
    const deniedApp = await denied.app();
    const deniedResponse = await testRequest(deniedApp, { path: '/profiles' });

    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.body).toEqual({
      error: `Forbidden: this action requires the '${scanReadPermission.name}' permission`,
    });
    expect(denied.getProfiles).not.toHaveBeenCalled();
    expect(denied.authorize).toHaveBeenCalledWith(
      [{ permission: scanReadPermission }],
      expect.objectContaining({
        credentials: expect.objectContaining({
          principal: expect.objectContaining({
            userEntityRef: 'user:default/reader',
          }),
        }),
      }),
    );

    const allowed = createHarness([scanReadPermission.name]);
    const allowedApp = await allowed.app();
    const allowedResponse = await testRequest(allowedApp, {
      path: '/profiles',
    });

    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.body).toEqual([{ id: 'rhel9-stig' }]);
    expect(allowed.getProfiles).toHaveBeenCalledTimes(1);
  });

  it('lets a signed-in user view remediations without compliance.scan.read', async () => {
    const viewer = createHarness([]);
    const app = await viewer.app();

    const remediations = await testRequest(app, {
      path: '/remediation-profiles',
    });
    const profiles = await testRequest(app, { path: '/compliance-profiles' });
    const inventories = await testRequest(app, { path: '/inventories' });
    const baselines = await testRequest(app, { path: '/baseline-targets' });
    const executions = await testRequest(app, {
      path: '/remediation-executions',
    });

    expect(remediations.status).toBe(200);
    expect(remediations.body).toEqual([{ id: 'rp-1', name: 'SSH hardening' }]);
    expect(profiles.status).toBe(200);
    expect(profiles.body).toEqual([
      { id: 'rhel9-stig', displayName: 'STIG for RHEL 9' },
    ]);
    expect(inventories.status).toBe(200);
    expect(inventories.body).toEqual([{ id: 7, name: 'lab' }]);
    expect(baselines.status).toBe(200);
    expect(baselines.body).toEqual([]);
    expect(executions.status).toBe(200);
    expect(executions.body).toEqual([]);
    expect(viewer.authorize).not.toHaveBeenCalled();
  });

  it('still requires compliance.scan.read for scan, dashboard, and posture reads', async () => {
    const viewer = createHarness([]);
    const app = await viewer.app();

    for (const path of ['/scans', '/dashboard', '/posture']) {
      const response = await testRequest(app, { path });
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: `Forbidden: this action requires the '${scanReadPermission.name}' permission`,
      });
    }
    expect(viewer.authorize).toHaveBeenCalledWith(
      [{ permission: scanReadPermission }],
      expect.any(Object),
    );
  });

  it('rejects an unauthenticated remediations read', async () => {
    const viewer = createHarness([], { authenticated: false });
    const app = await viewer.app();

    const res = await testRequest(app, { path: '/remediation-profiles' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(viewer.getRemediationProfiles).not.toHaveBeenCalled();
  });

  it('does not let compliance.scan.read launch or change settings', async () => {
    const reader = createHarness([scanReadPermission.name]);
    const app = await reader.app();

    const settings = await testRequest(app, {
      method: 'POST',
      path: '/settings',
      body: { retentionDays: 30 },
    });
    const validate = await testRequest(app, {
      method: 'POST',
      path: '/scan/validate',
      body: { profileId: 'rhel9-stig', inventoryId: 1 },
    });
    const connect = await testRequest(app, {
      method: 'POST',
      path: '/compliance-profiles/connect',
      body: { framework: 'DISA_STIG' },
    });

    for (const response of [settings, validate, connect]) {
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: `Forbidden: this action requires the '${scanLaunchPermission.name}' permission`,
      });
    }
    expect(reader.getProfile).not.toHaveBeenCalled();
    expect(reader.connectProfile).not.toHaveBeenCalled();

    const launcher = createHarness([scanLaunchPermission.name]);
    const launcherApp = await launcher.app();
    const allowedSettings = await testRequest(launcherApp, {
      method: 'POST',
      path: '/settings',
      body: { retentionDays: 30 },
    });
    const allowedValidate = await testRequest(launcherApp, {
      method: 'POST',
      path: '/scan/validate',
      body: { profileId: 'rhel9-stig', inventoryId: 1 },
    });

    expect(allowedSettings.status).toBe(200);
    expect(allowedSettings.body).toEqual({ retentionDays: 30 });
    expect(allowedValidate.status).toBe(200);
    expect(allowedValidate.body).toMatchObject({ valid: true });
    expect(launcher.authorize).toHaveBeenCalledWith(
      [{ permission: scanLaunchPermission }],
      expect.any(Object),
    );
  });

  it('requires compliance.remediate.launch for remediation writes', async () => {
    const scanner = createHarness([
      scanReadPermission.name,
      scanLaunchPermission.name,
    ]);
    const scannerApp = await scanner.app();
    const denied = await testRequest(scannerApp, {
      method: 'POST',
      path: '/remediation-profiles',
      body: { name: 'SSH hardening', selections: [] },
    });

    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({
      error: `Forbidden: this action requires the '${remediateLaunchPermission.name}' permission`,
    });
    expect(scanner.saveRemediationProfile).not.toHaveBeenCalled();

    const remediator = createHarness([remediateLaunchPermission.name]);
    const remediatorApp = await remediator.app();
    const allowed = await testRequest(remediatorApp, {
      method: 'POST',
      path: '/remediation-profiles',
      body: { name: 'SSH hardening', selections: [] },
    });

    expect(allowed.status).toBe(201);
    expect(remediator.saveRemediationProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'SSH hardening', selections: [] }),
    );
    expect(remediator.authorize).toHaveBeenCalledWith(
      [{ permission: remediateLaunchPermission }],
      expect.any(Object),
    );
  });
});
