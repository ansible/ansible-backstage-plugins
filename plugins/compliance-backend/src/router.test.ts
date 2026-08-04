import http from 'http';
import express from 'express';
import { createRouter } from './router';

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Minimal HTTP test helper (replaces supertest).
 * Creates a temporary server, sends a request, and returns the parsed response.
 */
async function testRequest(
  app: express.Express,
  options: {
    method?: string;
    path: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; body: unknown }> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address() as { port: number };

  const url = `http://127.0.0.1:${addr.port}${options.path}`;
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  let bodyStr: string | undefined;
  if (options.rawBody !== undefined) {
    bodyStr = options.rawBody;
  } else if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr,
  });

  let responseBody: unknown;
  const text = await response.text();
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = text;
  }

  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );

  return { status: response.status, body: responseBody };
}

// ─── Mock factories ──────────────────────────────────────────────────

function createMockService() {
  return {
    getDataSource: jest.fn().mockReturnValue('mock'),
    getProfiles: jest
      .fn()
      .mockResolvedValue([
        { id: 'rhel9-stig', name: 'DISA STIG RHEL 9', framework: 'DISA_STIG' },
      ]),
    getInventories: jest
      .fn()
      .mockResolvedValue([{ id: 1, name: 'test-inventory', hostCount: 3 }]),
    getWorkflowTemplates: jest
      .fn()
      .mockResolvedValue([
        { id: 10, name: 'compliance-scan', type: 'workflow_job_template' },
      ]),
    getExecutionEnvironments: jest.fn().mockResolvedValue([
      {
        id: 5,
        name: 'ee-supported-rhel9',
        image: 'registry.example.com/ee:latest',
      },
    ]),
    launchScan: jest.fn().mockResolvedValue({
      scanId: 'scan-1',
      workflowJobId: 42,
      status: 'pending',
    }),
    launchRemediation: jest.fn().mockResolvedValue({
      remediationId: 'rem-1',
      workflowJobId: 43,
      status: 'pending',
    }),
    getFindings: jest.fn().mockResolvedValue([]),
    getWorkflowJobStatus: jest.fn().mockResolvedValue({
      id: 42,
      status: 'pending',
      finished: null,
      failed: false,
      elapsed: 0,
      name: 'compliance-scan',
    }),
    getJobStatus: jest.fn().mockResolvedValue({
      id: 42,
      status: 'pending',
      finished: null,
      failed: false,
      elapsed: 0,
      name: 'compliance-remediate',
    }),
    getWorkflowNodes: jest.fn().mockResolvedValue([]),
    getJobEvents: jest.fn().mockResolvedValue([]),
    getDashboardStats: jest.fn().mockResolvedValue({
      hostsScanned: 0,
      criticalFindings: 0,
      pendingRemediation: 0,
      activeProfiles: 0,
      recentScans: [],
      frameworkScores: [],
    }),
    getPostureHistory: jest.fn().mockResolvedValue([]),
    getRemediationEventsForTrend: jest.fn().mockResolvedValue([]),
    getHostPosture: jest.fn().mockResolvedValue({
      hosts: [],
      scanId: 'scan-1',
      scanTimestamp: '2026-06-11T00:00:00Z',
      profileId: 'prof-1',
      inventoryId: 1,
    }),
    getRemediationProfiles: jest.fn().mockResolvedValue([]),
    getRemediationProfile: jest.fn().mockResolvedValue(null),
    saveRemediationProfile: jest.fn().mockResolvedValue({ id: 'rp-1' }),
    deleteRemediationProfile: jest.fn().mockResolvedValue(true),
    buildRemediationPlan: jest
      .fn()
      .mockReturnValue({ groups: [], totalRules: 0, totalHosts: 0 }),
    fetchAndParseResults: jest.fn().mockResolvedValue([]),
    fetchScanErrorDetails: jest.fn().mockResolvedValue(null),
    getInventoryHostFacts: jest.fn().mockResolvedValue([]),
    aggregateFindings: jest.fn().mockReturnValue([]),
    aggregateFindingsWithMetadata: jest.fn().mockResolvedValue([]),
    mapRawFindingPublic: jest.fn().mockReturnValue({
      scanId: 'scan-1',
      ruleId: 'test',
      stigId: '',
      host: 'unknown',
      status: 'pass',
      severity: 'CAT_II',
      actualValue: '',
      expectedValue: '',
      evidence: null,
    }),
  } as any;
}

function createMockDatabase() {
  return {
    createScan: jest.fn().mockResolvedValue({
      id: 'scan-1',
      profileId: 'rhel9-stig',
      inventoryId: 1,
      scanner: 'oscap',
      scanType: 'assessment',
      workflowJobId: null,
      status: 'pending',
      startedAt: '2026-04-30T00:00:00.000Z',
      completedAt: null,
      errorDetails: null,
    }),
    updateScanWorkflowJobId: jest.fn().mockResolvedValue(undefined),
    getRecentScans: jest.fn().mockResolvedValue([
      {
        id: 'scan-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'completed',
        startedAt: '2026-04-30T00:00:00.000Z',
        completedAt: '2026-04-30T00:05:00.000Z',
        errorDetails: null,
      },
    ]),
    getFindingsByScanId: jest.fn().mockResolvedValue([]),
    saveFindingsForScan: jest.fn().mockResolvedValue(0),
    getScanById: jest.fn().mockResolvedValue(null),
    getScanByWorkflowJobId: jest.fn().mockResolvedValue(null),
    getPreviousScan: jest.fn().mockResolvedValue(null),
    cleanupOldFindings: jest.fn().mockResolvedValue(0),
    getLatestFindings: jest.fn().mockResolvedValue([]),
    updateScanStatus: jest.fn().mockResolvedValue(undefined),
    updateScanErrorDetails: jest.fn().mockResolvedValue(undefined),
    listProfiles: jest.fn().mockResolvedValue([]),
    saveProfile: jest.fn().mockResolvedValue({
      id: 'cart-1',
      displayName: 'RHEL 9 STIG',
      description: '',
      framework: 'DISA_STIG',
      version: 'V2R1',
      platform: 'RHEL 9',
      workflowTemplateId: null,
      eeId: null,
      remediationPlaybookPath: '',
      scanTags: '',
      certification: null,
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    }),
    getProfile: jest.fn().mockResolvedValue(null),
    deleteProfile: jest.fn().mockResolvedValue(true),
    updateProfileRuleCount: jest.fn().mockResolvedValue(undefined),
    getDistinctRuleCountForScan: jest.fn().mockResolvedValue(0),
    getAggregatedStatsByScanIds: jest.fn().mockResolvedValue(new Map()),
    getAuthoritativeScan: jest.fn().mockResolvedValue({
      id: 'auth-scan-1',
      profileId: 'rhel9-stig',
      inventoryId: 1,
      scanner: 'oscap',
      scanType: 'assessment',
      workflowJobId: 100,
      status: 'completed',
      startedAt: '2026-06-01T00:00:00.000Z',
      completedAt: '2026-06-01T00:10:00.000Z',
      errorDetails: null,
    }),
    getPostureSnapshots: jest.fn().mockResolvedValue([]),
    savePostureSnapshot: jest.fn().mockResolvedValue({ id: 'snap-1' }),
    upsertRuleMetadata: jest.fn().mockResolvedValue(0),
    getRuleMetadataBulk: jest.fn().mockResolvedValue(new Map()),
    getAllRuleMetadata: jest.fn().mockResolvedValue(new Map()),
    storeIngestToken: jest.fn().mockResolvedValue(undefined),
    getIngestToken: jest.fn().mockResolvedValue(null),
    listRemediationProfiles: jest.fn().mockResolvedValue([]),
    getRemediationProfile: jest.fn().mockResolvedValue(null),
    saveRemediationProfile: jest.fn().mockResolvedValue({ id: 'rp-1' }),
    deleteRemediationProfile: jest.fn().mockResolvedValue(true),
    updateRemediationProfileStatus: jest.fn().mockResolvedValue(true),
    createExecution: jest.fn().mockResolvedValue({
      id: 'exec-1',
      remediationProfileId: 'rp-1',
      inventoryId: 1,
      status: 'pending',
      startedAt: '2026-06-01T00:00:00.000Z',
    }),
    getExecutionById: jest.fn().mockResolvedValue(null),
    getExecutionsByProfileId: jest.fn().mockResolvedValue([]),
    getRunningExecutionForInventory: jest.fn().mockResolvedValue(null),
    updateExecutionStatus: jest.fn().mockResolvedValue(undefined),
    updateVerificationScanId: jest.fn().mockResolvedValue(undefined),
    getStaleRunningExecutions: jest.fn().mockResolvedValue([]),
    isProfilePinnedAsBaseline: jest.fn().mockResolvedValue(false),
    pinBaselineTarget: jest.fn().mockResolvedValue({ id: 'bt-1' }),
    unpinBaselineTarget: jest.fn().mockResolvedValue(true),
    getBaselineTargetsForProfile: jest.fn().mockResolvedValue([]),
    getNotApplicableRules: jest.fn().mockResolvedValue([]),
    getBatchScanStatsAggregated: jest.fn().mockResolvedValue(new Map()),
    resolveProfileId: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(
          id.includes('-') && id.length >= 36 ? id : `resolved-${id}-uuid`,
        ),
      ),
    getHostFindings: jest.fn().mockResolvedValue([]),
    getLatestCompletedScan: jest.fn().mockResolvedValue(null),
  } as any;
}

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as any;

// ─── App setup ───────────────────────────────────────────────────────

async function createApp(
  serviceOverrides?: Partial<ReturnType<typeof createMockService>>,
  databaseOverrides?: Partial<ReturnType<typeof createMockDatabase>>,
) {
  const service = { ...createMockService(), ...serviceOverrides };
  const database = { ...createMockDatabase(), ...databaseOverrides };
  const router = await createRouter({
    logger: mockLogger,
    service,
    database,
  });
  const app = express();
  app.use(router);
  return { app, service, database };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('compliance backend router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /health ──────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok and dataSource', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, { path: '/health' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        dataSource: 'mock',
      });
    });

    it('reflects the actual data source', async () => {
      const { app } = await createApp({
        getDataSource: jest.fn().mockReturnValue('live'),
      });
      const res = await testRequest(app, { path: '/health' });

      expect(res.status).toBe(200);
      expect((res.body as any).dataSource).toBe('live');
    });
  });

  // ─── GET /profiles ────────────────────────────────────────────────

  describe('GET /profiles', () => {
    it('returns 200 with profiles array', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/profiles' });

      expect(res.status).toBe(200);
      const body = res.body as any[];
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe('rhel9-stig');
      expect(service.getProfiles).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no profiles exist', async () => {
      const { app } = await createApp({
        getProfiles: jest.fn().mockResolvedValue([]),
      });
      const res = await testRequest(app, { path: '/profiles' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ─── GET /scans ───────────────────────────────────────────────────

  describe('GET /scans', () => {
    it('returns 200 with scans array from the database', async () => {
      const { app, database } = await createApp();
      const res = await testRequest(app, { path: '/scans' });

      expect(res.status).toBe(200);
      const body = res.body as any[];
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].id).toBe('scan-1');
      expect(database.getRecentScans).toHaveBeenCalledWith(50);
    });
  });

  // ─── POST /scan/validate ─────────────────────────────────────────

  describe('POST /scan/validate', () => {
    it('returns valid when profile has no platformSpec', async () => {
      const { app } = await createApp(undefined, {
        getProfile: jest.fn().mockResolvedValue({
          id: 'p1',
          displayName: 'Test',
          platformSpec: null,
        }),
      });
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { profileId: 'p1', inventoryId: 1 },
      });

      expect(res.status).toBe(200);
      expect((res.body as any).valid).toBe(true);
    });

    it('returns mismatch when hosts do not match platform spec', async () => {
      const { app } = await createApp(
        {
          getInventoryHostFacts: jest.fn().mockResolvedValue([
            { hostname: 'win01', ansible_os_family: 'Windows' },
            {
              hostname: 'rhel01',
              ansible_os_family: 'RedHat',
              ansible_distribution_major_version: '9',
            },
          ]),
        },
        {
          getProfile: jest.fn().mockResolvedValue({
            id: 'p1',
            displayName: 'STIG RHEL 9',
            platformSpec: { os_family: ['RedHat'], os_version: ['9'] },
          }),
        },
      );
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { profileId: 'p1', inventoryId: 1 },
      });

      expect(res.status).toBe(200);
      expect((res.body as any).valid).toBe(false);
      expect((res.body as any).mismatchedHosts).toHaveLength(1);
      expect((res.body as any).mismatchedHosts[0].hostname).toBe('win01');
      expect((res.body as any).matchedHosts).toContain('rhel01');
    });

    it('returns valid when scanner_validates is true', async () => {
      const { app } = await createApp(undefined, {
        getProfile: jest.fn().mockResolvedValue({
          id: 'p1',
          displayName: 'Tenable',
          platformSpec: { os_family: ['RedHat'], scanner_validates: true },
        }),
      });
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { profileId: 'p1', inventoryId: 1 },
      });

      expect(res.status).toBe(200);
      expect((res.body as any).valid).toBe(true);
    });

    it('returns 500 when Controller API fails', async () => {
      const { app } = await createApp(
        {
          getInventoryHostFacts: jest
            .fn()
            .mockRejectedValue(new Error('Controller unreachable')),
        },
        {
          getProfile: jest.fn().mockResolvedValue({
            id: 'p1',
            displayName: 'STIG',
            platformSpec: { os_family: ['RedHat'] },
          }),
        },
      );
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { profileId: 'p1', inventoryId: 1 },
      });

      expect(res.status).toBe(500);
      expect((res.body as any).error).toBe('Platform validation failed');
    });

    it('returns valid when all hosts match', async () => {
      const { app } = await createApp(
        {
          getInventoryHostFacts: jest.fn().mockResolvedValue([
            {
              hostname: 'rhel01',
              ansible_os_family: 'RedHat',
              ansible_distribution_major_version: '9',
            },
            {
              hostname: 'rhel02',
              ansible_os_family: 'RedHat',
              ansible_distribution_major_version: '9',
            },
          ]),
        },
        {
          getProfile: jest.fn().mockResolvedValue({
            id: 'p1',
            displayName: 'STIG',
            platformSpec: { os_family: ['RedHat'], os_version: ['9'] },
          }),
        },
      );
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { profileId: 'p1', inventoryId: 1 },
      });

      expect(res.status).toBe(200);
      expect((res.body as any).valid).toBe(true);
      expect((res.body as any).matchedHosts).toHaveLength(2);
    });

    it('returns 400 when profileId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { inventoryId: 1 },
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when inventoryId is invalid', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan/validate',
        body: { profileId: 'p1', inventoryId: 'abc' },
      });

      expect(res.status).toBe(400);
    });
  });

  // ─── POST /scan ───────────────────────────────────────────────────

  describe('POST /scan', () => {
    it('returns 400 when profileId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { inventoryId: 1 },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/profileId/);
    });

    it('returns 400 when profileId is empty string', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: '  ', inventoryId: 1 },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/profileId/);
    });

    it('returns 400 when inventoryId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig' },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/inventoryId/);
    });

    it('returns 400 when inventoryId is not a positive integer', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig', inventoryId: -1 },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/inventoryId/);
    });

    it('returns 400 when inventoryId is a string', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig', inventoryId: 'abc' },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/inventoryId/);
    });

    it('returns 400 when workflowTemplateId is invalid', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          workflowTemplateId: 'bad',
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/workflowTemplateId/);
    });

    it('returns 200 on valid input and persists scan', async () => {
      const { app, service, database } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig', inventoryId: 1 },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.scanId).toBe('scan-1');
      expect(body.workflowJobId).toBe(42);
      expect(body.status).toBe('pending');
      expect(database.createScan).toHaveBeenCalledTimes(1);
      expect(service.launchScan).toHaveBeenCalledTimes(1);
      expect(service.launchScan).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        'scan-1',
        expect.any(String),
      );
      expect(database.updateScanWorkflowJobId).toHaveBeenCalledWith(
        'scan-1',
        42,
      );
    });

    it('accepts optional workflowTemplateId', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          workflowTemplateId: 10,
        },
      });

      expect(res.status).toBe(200);
      expect(service.launchScan).toHaveBeenCalledWith(
        expect.objectContaining({ workflowTemplateId: 10 }),
        undefined,
        'scan-1',
        expect.any(String),
      );
    });

    it('passes user AAP token from header', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig', inventoryId: 1 },
        headers: { 'x-aap-token': 'my-user-token' },
      });

      expect(res.status).toBe(200);
      expect(service.launchScan).toHaveBeenCalledWith(
        expect.any(Object),
        'my-user-token',
        'scan-1',
        expect.any(String),
      );
    });

    it('returns 500 when service throws', async () => {
      const { app } = await createApp({
        launchScan: jest
          .fn()
          .mockRejectedValue(new Error('Controller unreachable')),
      });
      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig', inventoryId: 1 },
      });

      expect(res.status).toBe(500);
      expect((res.body as any).error).toBe('Failed to launch compliance scan');
    });
  });

  // ─── POST /compliance-profiles ─────────────────────────────────────────────

  describe('POST /compliance-profiles', () => {
    it('returns 400 when displayName is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: { framework: 'DISA_STIG' },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/displayName/);
    });

    it('returns 400 when framework is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: { displayName: 'RHEL 9 STIG' },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/framework/);
    });

    it('returns 400 when workflowTemplateId is invalid', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
          workflowTemplateId: 'not-a-number',
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/workflowTemplateId/);
    });

    it('returns 201 on valid input', async () => {
      const { app, database } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
          version: 'V2R1',
          platform: 'RHEL 9',
        },
      });

      expect(res.status).toBe(201);
      const body = res.body as any;
      expect(body.id).toBe('cart-1');
      expect(body.displayName).toBe('RHEL 9 STIG');
      expect(database.saveProfile).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when database throws', async () => {
      const { app } = await createApp(undefined, {
        saveProfile: jest.fn().mockRejectedValue(new Error('DB error')),
      });
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
        },
      });

      expect(res.status).toBe(500);
      expect((res.body as any).error).toBe('Failed to save compliance profile');
    });

    it('accepts platformSpec object', async () => {
      const { app, database } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
          platformSpec: {
            os_family: ['RedHat'],
            os_version: ['9'],
          },
        },
      });

      expect(res.status).toBe(201);
      expect(database.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          platformSpec: { os_family: ['RedHat'], os_version: ['9'] },
        }),
      );
    });

    it('returns 400 when platformSpec is a string', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
          platformSpec: 'not-an-object',
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/platformSpec/);
    });

    it('returns 400 when platformSpec is an array', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
          platformSpec: ['RedHat'],
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/platformSpec/);
    });

    it('accepts null platformSpec', async () => {
      const { app, database } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/compliance-profiles',
        body: {
          displayName: 'RHEL 9 STIG',
          framework: 'DISA_STIG',
          platformSpec: null,
        },
      });

      expect(res.status).toBe(201);
      expect(database.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ platformSpec: null }),
      );
    });
  });

  // ─── GET /compliance-profiles/:id ─────────────────────────────────────────

  describe('GET /compliance-profiles/:id', () => {
    it('returns 200 with the profile when found', async () => {
      const profile = {
        id: 'cart-1',
        displayName: 'RHEL 9 STIG',
        description: '',
        framework: 'DISA_STIG',
        version: 'V2R1',
        platform: 'RHEL 9',
        platformSpec: null,
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
      };
      const { app, database } = await createApp(undefined, {
        getProfile: jest.fn().mockResolvedValue(profile),
      });
      const res = await testRequest(app, {
        path: '/compliance-profiles/cart-1',
      });

      expect(res.status).toBe(200);
      expect((res.body as any).displayName).toBe('RHEL 9 STIG');
      expect(database.getProfile).toHaveBeenCalledWith('cart-1');
    });

    it('returns 404 when profile not found', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        path: '/compliance-profiles/nonexistent',
      });

      expect(res.status).toBe(404);
      expect((res.body as any).error).toMatch(/not found/i);
    });
  });

  // ─── DELETE /compliance-profiles/:id ───────────────────────────────────────

  describe('DELETE /compliance-profiles/:id', () => {
    it('returns 204 on successful delete', async () => {
      const { app, database } = await createApp();
      const res = await testRequest(app, {
        method: 'DELETE',
        path: '/compliance-profiles/cart-1',
      });

      expect(res.status).toBe(204);
      expect(database.deleteProfile).toHaveBeenCalledWith('cart-1');
    });

    it('returns 404 when profile not found', async () => {
      const { app } = await createApp(undefined, {
        deleteProfile: jest.fn().mockResolvedValue(false),
      });
      const res = await testRequest(app, {
        method: 'DELETE',
        path: '/compliance-profiles/nonexistent',
      });

      expect(res.status).toBe(404);
      expect((res.body as any).error).toMatch(/not found/i);
    });

    it('returns 500 when database throws', async () => {
      const { app } = await createApp(undefined, {
        deleteProfile: jest.fn().mockRejectedValue(new Error('DB error')),
      });
      const res = await testRequest(app, {
        method: 'DELETE',
        path: '/compliance-profiles/cart-1',
      });

      expect(res.status).toBe(500);
      expect((res.body as any).error).toBe(
        'Failed to delete compliance profile',
      );
    });
  });

  // ─── GET /posture ─────────────────────────────────────────────────

  describe('GET /posture', () => {
    it('returns 200 with posture history', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/posture' });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        undefined,
        30, // default days
        undefined,
      );
    });

    it('passes profileId query parameter', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/posture?profileId=rhel9-stig',
      });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        'rhel9-stig',
        30,
        undefined,
      );
    });

    it('passes inventoryId query parameter', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/posture?profileId=rhel9-stig&inventoryId=5',
      });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        'rhel9-stig',
        30,
        5,
      );
    });

    it('clamps days parameter to minimum of 1', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/posture?days=0.5' });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        undefined,
        1,
        undefined,
      );
    });

    it('treats days=0 as default (30) because 0 is falsy', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/posture?days=0' });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        undefined,
        30,
        undefined,
      );
    });

    it('clamps days parameter to maximum of 365', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/posture?days=999' });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        undefined,
        365,
        undefined,
      );
    });

    it('defaults days to 30 when not a valid number', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/posture?days=abc' });

      expect(res.status).toBe(200);
      expect(service.getPostureHistory).toHaveBeenCalledWith(
        undefined,
        30,
        undefined,
      );
    });
  });

  // ─── GET /inventory/:id/host-posture ────────────────────────────

  describe('GET /inventory/:id/host-posture', () => {
    it('returns 400 without profileId', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, { path: '/inventory/1/host-posture' });
      expect(res.status).toBe(400);
    });

    it('returns 400 with invalid inventoryId', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        path: '/inventory/abc/host-posture?profileId=p1',
      });
      expect(res.status).toBe(400);
    });

    it('returns 200 with valid params', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/inventory/5/host-posture?profileId=rhel9-stig',
      });
      expect(res.status).toBe(200);
      expect(service.getHostPosture).toHaveBeenCalledWith(
        5,
        'resolved-rhel9-stig-uuid',
        expect.anything(),
        { baselineView: false },
      );
    });

    it('accepts profile query param as alias', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/inventory/5/host-posture?profile=stig',
      });
      expect(res.status).toBe(200);
      expect(service.getHostPosture).toHaveBeenCalledWith(
        5,
        'resolved-stig-uuid',
        expect.anything(),
        { baselineView: false },
      );
    });
  });

  // ─── GET /dashboard ───────────────────────────────────────────────

  describe('GET /dashboard', () => {
    it('returns 200 with dashboard stats', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/dashboard' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        hostsScanned: 0,
        criticalFindings: 0,
        pendingRemediation: 0,
        activeProfiles: 0,
        recentScans: [],
        frameworkScores: [],
      });
      expect(service.getDashboardStats).toHaveBeenCalledTimes(1);
    });
  });

  // ─── GET /inventories ─────────────────────────────────────────────

  describe('GET /inventories', () => {
    it('returns 200 with inventories array', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/inventories' });

      expect(res.status).toBe(200);
      const body = res.body as any[];
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('test-inventory');
      expect(service.getInventories).toHaveBeenCalledWith(undefined);
    });

    it('passes user AAP token', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/inventories',
        headers: { 'x-aap-token': 'user-tok' },
      });

      expect(res.status).toBe(200);
      expect(service.getInventories).toHaveBeenCalledWith('user-tok');
    });
  });

  // ─── GET /workflow-status/:jobId ──────────────────────────────────

  describe('GET /workflow-status/:jobId', () => {
    it('returns 400 for non-numeric jobId', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        path: '/workflow-status/abc',
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/jobId must be a number/);
    });

    it('returns 200 with status for valid jobId', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/workflow-status/42',
      });

      expect(res.status).toBe(200);
      expect((res.body as any).id).toBe(42);
      expect(service.getWorkflowJobStatus).toHaveBeenCalledWith(42, undefined);
    });

    it('returns 500 when service throws', async () => {
      const { app } = await createApp({
        getWorkflowJobStatus: jest
          .fn()
          .mockRejectedValue(new Error('Not found')),
        getJobStatus: jest.fn().mockRejectedValue(new Error('Not found')),
      });
      const res = await testRequest(app, {
        path: '/workflow-status/999',
      });

      expect(res.status).toBe(500);
      expect((res.body as any).error).toBe('Failed to retrieve job status');
    });
  });

  // ─── POST /remediate ──────────────────────────────────────────────

  describe('POST /remediate', () => {
    it('returns 400 when profileId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediate',
        body: { inventoryId: 1, selections: [] },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/profileId/);
    });

    it('returns 400 when inventoryId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediate',
        body: { profileId: 'rhel9-stig', selections: [] },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/inventoryId/);
    });

    it('returns 400 when selections is not an array', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediate',
        body: {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          selections: 'not-array',
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/selections/);
    });

    it('returns 400 when a selection is missing ruleId', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediate',
        body: {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          selections: [{ enabled: true }],
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/selections\[0\]\.ruleId/);
    });

    it('returns 400 when a selection is missing enabled', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediate',
        body: {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          selections: [{ ruleId: 'rule-1' }],
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/selections\[0\]\.enabled/);
    });

    it('returns 200 on valid remediation request', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediate',
        body: {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          selections: [{ ruleId: 'rule-1', enabled: true }],
          remediationProfileId: 'rem-profile-1',
        },
      });

      expect(res.status).toBe(200);
      const body = res.body as any;
      expect(body.remediationId).toBe('rem-1');
      expect(body.executionId).toBe('exec-1');
      expect(body.plan).toBeDefined();
      expect(service.launchRemediation).toHaveBeenCalledTimes(1);
      expect(service.buildRemediationPlan).toHaveBeenCalledTimes(1);
    });
  });

  // ─── POST /remediation-profiles ───────────────────────────────────

  describe('POST /remediation-profiles', () => {
    it('returns 400 when name is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediation-profiles',
        body: { selections: [] },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/name/);
    });

    it('returns 400 when selections is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediation-profiles',
        body: { name: 'my-profile' },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/selections/);
    });

    it('returns 201 on valid input', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediation-profiles',
        body: {
          name: 'my-profile',
          selections: [{ ruleId: 'r1', enabled: true }],
        },
      });

      expect(res.status).toBe(201);
      expect(service.saveRemediationProfile).toHaveBeenCalledTimes(1);
    });

    it('forwards status field to service', async () => {
      const { app, service } = await createApp();
      await testRequest(app, {
        method: 'POST',
        path: '/remediation-profiles',
        body: {
          name: 'draft-profile',
          selections: [{ ruleId: 'r1', enabled: true }],
          status: 'draft',
        },
      });

      expect(service.saveRemediationProfile).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft' }),
      );
    });

    it('returns 400 for invalid status value', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/remediation-profiles',
        body: {
          name: 'bad-status',
          selections: [{ ruleId: 'r1', enabled: true }],
          status: 'invalid',
        },
      });

      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/status/);
    });
  });

  // ─── GET /findings ────────────────────────────────────────────────

  describe('GET /findings', () => {
    it('returns findings from service when no scanId given', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, { path: '/findings' });

      expect(res.status).toBe(200);
      expect(service.getFindings).toHaveBeenCalledWith(undefined, undefined);
    });

    it('returns DB findings when scanId matches stored data', async () => {
      const scanUuid = 'aaccae65-24cd-424c-b123-abcdef123456';
      const storedFindings = [
        {
          id: 'f-1',
          scanId: scanUuid,
          ruleId: 'rule-1',
          stigId: 'RHEL-09-001',
          host: 'host1',
          status: 'fail',
          severity: 'high',
          actualValue: 'off',
          expectedValue: 'on',
          evidence: null,
        },
      ];
      const aggregated = [
        { ruleId: 'rule-1', hosts: [{ host: 'host1', status: 'fail' }] },
      ];
      const { app, database, service } = await createApp(
        {
          aggregateFindingsWithMetadata: jest
            .fn()
            .mockResolvedValue(aggregated),
        },
        { getFindingsByScanId: jest.fn().mockResolvedValue(storedFindings) },
      );
      const res = await testRequest(app, {
        path: `/findings?scanId=${scanUuid}`,
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(aggregated);
      expect(database.getFindingsByScanId).toHaveBeenCalledWith(scanUuid);
      expect(service.aggregateFindingsWithMetadata).toHaveBeenCalledWith(
        storedFindings,
      );
      expect(service.getFindings).not.toHaveBeenCalled();
    });

    it('resolves numeric workflowJobId to scan UUID before DB lookup', async () => {
      const storedFindings = [
        {
          id: 'f-2',
          scanId: 'real-scan-uuid',
          ruleId: 'rule-1',
          stigId: 'RHEL-09-001',
          host: 'host1',
          status: 'pass',
          severity: 'medium',
          actualValue: 'on',
          expectedValue: 'on',
          evidence: null,
        },
      ];
      const aggregated = [
        { ruleId: 'rule-1', hosts: [{ host: 'host1', status: 'pass' }] },
      ];
      const {
        app,
        database,
        service: _service,
      } = await createApp(
        {
          aggregateFindingsWithMetadata: jest
            .fn()
            .mockResolvedValue(aggregated),
        },
        {
          getScanByWorkflowJobId: jest.fn().mockResolvedValue({
            id: 'real-scan-uuid',
            profileId: 'rhel9-stig',
            workflowJobId: 42,
            status: 'completed',
          }),
          getFindingsByScanId: jest.fn().mockResolvedValue(storedFindings),
        },
      );
      const res = await testRequest(app, {
        path: '/findings?scanId=42',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(aggregated);
      expect(database.getScanByWorkflowJobId).toHaveBeenCalledWith(42);
      expect(database.getFindingsByScanId).toHaveBeenCalledWith(
        'real-scan-uuid',
      );
    });

    it('falls through to service when numeric scanId has no DB scan', async () => {
      const mockFindings = [{ ruleId: 'mock-1' }];
      const { app, database, service } = await createApp(
        { getFindings: jest.fn().mockResolvedValue(mockFindings) },
        { getScanByWorkflowJobId: jest.fn().mockResolvedValue(null) },
      );
      const res = await testRequest(app, {
        path: '/findings?scanId=999',
      });

      expect(res.status).toBe(200);
      expect(database.getScanByWorkflowJobId).toHaveBeenCalledWith(999);
      expect(service.getFindings).toHaveBeenCalledWith('999', undefined);
    });

    it('resolves scan- prefixed numeric IDs to workflowJobId', async () => {
      const storedFindings = [
        {
          id: 'f-3',
          scanId: 'prefixed-uuid',
          ruleId: 'rule-1',
          stigId: 'RHEL-09-001',
          host: 'host1',
          status: 'pass',
          severity: 'low',
          actualValue: 'on',
          expectedValue: 'on',
          evidence: null,
        },
      ];
      const aggregated = [
        { ruleId: 'rule-1', hosts: [{ host: 'host1', status: 'pass' }] },
      ];
      const {
        app,
        database,
        service: _service2,
      } = await createApp(
        {
          aggregateFindingsWithMetadata: jest
            .fn()
            .mockResolvedValue(aggregated),
        },
        {
          getScanByWorkflowJobId: jest.fn().mockResolvedValue({
            id: 'prefixed-uuid',
            profileId: 'rhel9-stig',
            workflowJobId: 42,
            status: 'completed',
          }),
          getFindingsByScanId: jest.fn().mockResolvedValue(storedFindings),
        },
      );
      const res = await testRequest(app, {
        path: '/findings?scanId=scan-42',
      });

      expect(res.status).toBe(200);
      expect(database.getScanByWorkflowJobId).toHaveBeenCalledWith(42);
      expect(database.getFindingsByScanId).toHaveBeenCalledWith(
        'prefixed-uuid',
      );
    });

    it('returns 400 for invalid scanId characters', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        path: '/findings?scanId=;DROP%20TABLE',
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid scanId' });
    });

    it('skips DB findings lookup when numeric ID has no matching scan', async () => {
      const { app, database } = await createApp(
        {},
        { getScanByWorkflowJobId: jest.fn().mockResolvedValue(null) },
      );
      const res = await testRequest(app, {
        path: '/findings?scanId=777',
      });

      expect(res.status).toBe(200);
      expect(database.getScanByWorkflowJobId).toHaveBeenCalledWith(777);
      expect(database.getFindingsByScanId).not.toHaveBeenCalled();
    });
  });

  // ─── GET /compliance-profiles ──────────────────────────────────────────────

  describe('GET /compliance-profiles', () => {
    it('returns 200 with profiles from database', async () => {
      const { app, database } = await createApp();
      const res = await testRequest(app, { path: '/compliance-profiles' });

      expect(res.status).toBe(200);
      expect(database.listProfiles).toHaveBeenCalledTimes(1);
    });
  });

  // ─── GET /workflow-templates ──────────────────────────────────────

  describe('GET /workflow-templates', () => {
    it('returns workflow templates', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/workflow-templates',
      });

      expect(res.status).toBe(200);
      const body = res.body as any[];
      expect(body).toHaveLength(1);
      expect(service.getWorkflowTemplates).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
    });

    it('passes name filter query parameter', async () => {
      const { app, service } = await createApp();
      const res = await testRequest(app, {
        path: '/workflow-templates?name=compliance',
      });

      expect(res.status).toBe(200);
      expect(service.getWorkflowTemplates).toHaveBeenCalledWith(
        'compliance',
        undefined,
      );
    });
  });

  describe('GET /previous-findings', () => {
    it('returns 400 when scanId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        path: '/previous-findings',
      });
      expect(res.status).toBe(400);
    });

    it('returns empty array when scan not found', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        path: '/previous-findings?scanId=nonexistent-uuid',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('resolves scan by UUID and returns previous findings', async () => {
      const { app, database: db } = await createApp();
      const currentScan = {
        id: 'scan-verify-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'verification' as const,
        workflowJobId: 100,
        status: 'completed' as const,
        startedAt: '2026-05-01T12:00:00.000Z',
        completedAt: '2026-05-01T12:05:00.000Z',
      };
      const previousScan = {
        ...currentScan,
        id: 'scan-assess-1',
        scanType: 'assessment' as const,
        workflowJobId: 99,
        startedAt: '2026-05-01T10:00:00.000Z',
        completedAt: '2026-05-01T10:05:00.000Z',
      };
      const storedFindings = [
        {
          id: 'f1',
          scanId: 'scan-assess-1',
          ruleId: 'r1',
          stigId: 'V-001',
          host: 'host1',
          status: 'fail',
          severity: 'CAT_II',
          actualValue: '',
          expectedValue: '',
          evidence: null,
        },
      ];

      (db.getScanById as jest.Mock).mockResolvedValueOnce(currentScan);
      (db.getPreviousScan as jest.Mock).mockResolvedValueOnce(previousScan);
      (db.getFindingsByScanId as jest.Mock).mockResolvedValueOnce(
        storedFindings,
      );

      const res = await testRequest(app, {
        path: '/previous-findings?scanId=scan-verify-1',
      });
      expect(res.status).toBe(200);
      expect(db.getScanById).toHaveBeenCalledWith('scan-verify-1');
      expect(db.getPreviousScan).toHaveBeenCalledWith(currentScan);
    });

    it('falls back to workflowJobId for numeric scanId', async () => {
      const { app, database: db } = await createApp();
      const scan = {
        id: 'scan-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'verification' as const,
        workflowJobId: 42,
        status: 'completed' as const,
        startedAt: '2026-05-01T12:00:00.000Z',
        completedAt: '2026-05-01T12:05:00.000Z',
      };
      (db.getScanById as jest.Mock).mockResolvedValueOnce(null);
      (db.getScanByWorkflowJobId as jest.Mock).mockResolvedValueOnce(scan);
      (db.getPreviousScan as jest.Mock).mockResolvedValueOnce(null);

      const res = await testRequest(app, {
        path: '/previous-findings?scanId=42',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(db.getScanByWorkflowJobId).toHaveBeenCalledWith(42);
    });

    it('does not call getScanByWorkflowJobId for UUID scanId', async () => {
      const { app, database: db } = await createApp();
      await testRequest(app, {
        path: '/previous-findings?scanId=abc-def-123',
      });
      expect(db.getScanByWorkflowJobId).not.toHaveBeenCalled();
    });
  });

  describe('POST /findings/ingest', () => {
    it('returns 400 when scanId is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: { findings: [] },
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when findings is missing', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: { scanId: 'scan-1' },
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 when scan not found', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(null);
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: { scanId: 'nonexistent', findings: [] },
      });
      expect(res.status).toBe(404);
    });

    it('saves findings and returns 201', async () => {
      const { app, database: db, service } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('valid-token');
      (db.saveFindingsForScan as jest.Mock).mockResolvedValueOnce(2);
      service.mapRawFindingPublic = jest.fn().mockReturnValue({
        scanId: 'scan-1',
        ruleId: 'test',
        stigId: '',
        host: 'rhel01',
        status: 'fail',
        severity: 'CAT_II',
        actualValue: '',
        expectedValue: '',
        evidence: null,
      });

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: {
          scanId: 'scan-1',
          ingestToken: 'valid-token',
          findings: [
            {
              rule_id: 'sshd_set_keepalive_0',
              status: 'fail',
              host: 'rhel01',
              severity: 'high',
            },
            {
              rule_id: 'accounts_tmout',
              status: 'pass',
              host: 'rhel01',
              severity: 'medium',
            },
          ],
        },
      });
      expect(res.status).toBe(201);
      expect((res.body as any).findingsCount).toBe(2);
      expect(db.updateScanStatus).toHaveBeenCalledWith(
        'scan-1',
        'completed',
        expect.any(String),
      );
    });

    it('rejects request when no stored token exists in database', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-1',
        profileId: 'rhel9-stig',
        status: 'pending',
      });
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce(null);

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: {
          scanId: 'scan-1',
          ingestToken: 'some-token',
          findings: [{ rule_id: 'test', status: 'pass', host: 'h1' }],
        },
      });
      // Without a stored token in the database, the request is rejected (H1 fix)
      expect(res.status).toBe(403);
    });

    it('rejects ingest request with wrong token when valid token exists', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('correct-token');

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: {
          scanId: 'scan-1',
          ingestToken: 'wrong-token',
          findings: [{ rule_id: 'test', status: 'pass', host: 'h1' }],
        },
      });
      expect(res.status).toBe(403);
      expect((res.body as any).error).toMatch(/Invalid ingest token/);
    });

    it('accepts ingest request with correct token', async () => {
      const { app, database: db, service } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('correct-token');
      (db.saveFindingsForScan as jest.Mock).mockResolvedValueOnce(1);
      service.mapRawFindingPublic = jest.fn().mockReturnValue({
        scanId: 'scan-1',
        ruleId: 'test',
        stigId: '',
        host: 'h1',
        status: 'pass',
        severity: 'CAT_II',
        actualValue: '',
        expectedValue: '',
        evidence: null,
      });

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: {
          scanId: 'scan-1',
          ingestToken: 'correct-token',
          findings: [{ rule_id: 'test', status: 'pass', host: 'h1' }],
        },
      });
      expect(res.status).toBe(201);
      expect((res.body as any).findingsCount).toBe(1);
    });

    it('rejects ingest request when no stored token exists for unknown scan', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'unknown-scan',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: null,
        status: 'pending',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce(null);

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: {
          scanId: 'unknown-scan',
          ingestToken: 'any-token',
          findings: [{ rule_id: 'test', status: 'pass', host: 'h1' }],
        },
      });
      expect(res.status).toBe(403);
      expect((res.body as any).error).toMatch(/Invalid ingest token/);
    });
  });

  // ─── POST /findings/ingest (NDJSON streaming, ADR-034) ─────────────

  describe('POST /findings/ingest (NDJSON)', () => {
    const SCAN_RECORD = {
      id: 'scan-ndj',
      profileId: 'supply-chain',
      inventoryId: 1,
      scanner: 'syft-grype',
      scanType: 'assessment' as const,
      workflowJobId: 99,
      status: 'running' as const,
      startedAt: '2026-06-26T00:00:00.000Z',
      completedAt: null,
      errorDetails: null,
    };

    function ndjson(...lines: unknown[]): string {
      return `${lines.map(l => JSON.stringify(l)).join('\n')}\n`;
    }

    it('returns 201 for valid NDJSON stream', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(SCAN_RECORD);
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('tok-valid');
      (db.saveFindingsForScan as jest.Mock).mockResolvedValue(0);

      const body = ndjson(
        {
          _meta: true,
          scanId: 'scan-ndj',
          ingestToken: 'tok-valid',
          finalize: false,
        },
        { rule_id: 'CVE-1', status: 'fail', host: 'web01' },
        { rule_id: 'CVE-2', status: 'fail', host: 'web01' },
      );

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(201);
      expect((res.body as any).findingsCount).toBe(2);
      expect((res.body as any).scanId).toBe('scan-ndj');
    });

    it('returns 400 when preamble lacks _meta', async () => {
      const { app } = await createApp();
      const body = ndjson(
        { scanId: 'scan-ndj', ingestToken: 'tok' },
        { rule_id: 'CVE-1', status: 'fail' },
      );
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/_meta/);
    });

    it('returns 400 for empty NDJSON body', async () => {
      const { app } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: '',
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toMatch(/preamble/i);
    });

    it('returns 404 when scan not found', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(null);

      const body = ndjson({
        _meta: true,
        scanId: 'nonexistent',
        ingestToken: 'tok',
      });
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(404);
    });

    it('returns 403 when ingest token is wrong', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(SCAN_RECORD);
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('correct-token');

      const body = ndjson({
        _meta: true,
        scanId: 'scan-ndj',
        ingestToken: 'wrong-token',
      });
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(403);
    });

    it('skips malformed JSON lines and reports warnings', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(SCAN_RECORD);
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('tok');
      (db.saveFindingsForScan as jest.Mock).mockResolvedValue(0);

      const body = `${[
        JSON.stringify({
          _meta: true,
          scanId: 'scan-ndj',
          ingestToken: 'tok',
          finalize: false,
        }),
        'this is not json',
        JSON.stringify({ rule_id: 'CVE-1', status: 'fail', host: 'web01' }),
        '{broken json',
        JSON.stringify({ rule_id: 'CVE-2', status: 'fail', host: 'web01' }),
      ].join('\n')}\n`;

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(201);
      expect((res.body as any).findingsCount).toBe(2);
      expect((res.body as any).warningCount).toBe(2);
    });

    it('finalizes scan when finalize is true in preamble', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(SCAN_RECORD);
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('tok');
      (db.saveFindingsForScan as jest.Mock).mockResolvedValue(0);
      (db.getFindingsByScanId as jest.Mock).mockResolvedValue([]);

      const body = ndjson(
        { _meta: true, scanId: 'scan-ndj', ingestToken: 'tok', finalize: true },
        { rule_id: 'CVE-1', status: 'fail', host: 'web01' },
      );

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(201);
      expect(db.updateScanStatus).toHaveBeenCalledWith(
        'scan-ndj',
        'completed',
        expect.any(String),
      );
    });

    it('does NOT finalize when finalize is false', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(SCAN_RECORD);
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('tok');
      (db.saveFindingsForScan as jest.Mock).mockResolvedValue(0);

      const body = ndjson(
        {
          _meta: true,
          scanId: 'scan-ndj',
          ingestToken: 'tok',
          finalize: false,
        },
        { rule_id: 'CVE-1', status: 'fail', host: 'web01' },
      );

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(201);
      expect(db.updateScanStatus).not.toHaveBeenCalled();
    });

    it('returns 201 with 0 findings when only preamble is sent', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce(SCAN_RECORD);
      (db.getIngestToken as jest.Mock).mockResolvedValueOnce('tok');
      (db.getFindingsByScanId as jest.Mock).mockResolvedValue([]);

      const body = ndjson({
        _meta: true,
        scanId: 'scan-ndj',
        ingestToken: 'tok',
        finalize: true,
      });

      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        rawBody: body,
        headers: { 'content-type': 'application/x-ndjson' },
      });
      expect(res.status).toBe(201);
      expect((res.body as any).findingsCount).toBe(0);
      expect(db.updateScanStatus).toHaveBeenCalled();
    });

    it('falls through to JSON handler when content-type is application/json', async () => {
      const { app, database: _db } = await createApp();
      const res = await testRequest(app, {
        method: 'POST',
        path: '/findings/ingest',
        body: { scanId: 'scan-1', findings: [] },
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── GET /scans/:scanId (error details) ───────────────────────────

  describe('GET /scans/:scanId error details', () => {
    it('returns errorDetails for a failed scan when already cached', async () => {
      const { app, database: db } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-fail-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: '2026-05-27T00:05:00.000Z',
        errorDetails: 'All 10 hosts unreachable: SSH connection timed out',
      });

      const res = await testRequest(app, { path: '/scans/scan-fail-1' });
      expect(res.status).toBe(200);
      expect((res.body as any).errorDetails).toBe(
        'All 10 hosts unreachable: SSH connection timed out',
      );
    });

    it('lazily fetches error details when not cached for failed scan', async () => {
      const {
        app,
        database: db,
        service,
      } = await createApp({
        fetchScanErrorDetails: jest
          .fn()
          .mockResolvedValue('Host nm-rhel01 unreachable'),
      });
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-fail-2',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: '2026-05-27T00:05:00.000Z',
        errorDetails: null,
      });

      const res = await testRequest(app, { path: '/scans/scan-fail-2' });
      expect(res.status).toBe(200);
      expect((res.body as any).errorDetails).toBe('Host nm-rhel01 unreachable');
      expect(service.fetchScanErrorDetails).toHaveBeenCalledWith(42, undefined);
      expect(db.updateScanErrorDetails).toHaveBeenCalledWith(
        'scan-fail-2',
        'Host nm-rhel01 unreachable',
      );
    });

    it('returns null errorDetails when fetch returns nothing', async () => {
      const { app, database: db } = await createApp({
        fetchScanErrorDetails: jest.fn().mockResolvedValue(null),
      });
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-fail-3',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: '2026-05-27T00:05:00.000Z',
        errorDetails: null,
      });

      const res = await testRequest(app, { path: '/scans/scan-fail-3' });
      expect(res.status).toBe(200);
      expect((res.body as any).errorDetails).toBeNull();
    });

    it('does not fetch error details for non-failed scans', async () => {
      const { app, database: db, service } = await createApp();
      (db.getScanById as jest.Mock).mockResolvedValueOnce({
        id: 'scan-ok-1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'completed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: '2026-05-27T00:05:00.000Z',
        errorDetails: null,
      });

      const res = await testRequest(app, { path: '/scans/scan-ok-1' });
      expect(res.status).toBe(200);
      expect(service.fetchScanErrorDetails).not.toHaveBeenCalled();
    });
  });

  // ─── POST /scan (error details cached on failure) ─────────────────

  describe('POST /scan error caching', () => {
    it('caches error details when scan launch fails', async () => {
      const { app, database: db } = await createApp({
        launchScan: jest
          .fn()
          .mockRejectedValue(new Error('Controller unreachable')),
      });

      const res = await testRequest(app, {
        method: 'POST',
        path: '/scan',
        body: { profileId: 'rhel9-stig', inventoryId: 1 },
      });

      expect(res.status).toBe(500);
      expect(db.updateScanErrorDetails).toHaveBeenCalledWith(
        'scan-1',
        'Controller unreachable',
      );
    });
  });
});
