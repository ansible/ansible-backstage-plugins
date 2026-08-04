import { ComplianceBackendClient, AapAuthApi } from './ComplianceBackendClient';
import type { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

// ─── Mock helpers ────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:7007/api/compliance';

function createMockDiscovery(): jest.Mocked<DiscoveryApi> {
  return { getBaseUrl: jest.fn().mockResolvedValue(BASE_URL) };
}

function createMockFetch(): jest.Mocked<FetchApi> {
  return { fetch: jest.fn() };
}

function createMockAapAuth(token = 'aap-token-123'): jest.Mocked<AapAuthApi> {
  return { getAccessToken: jest.fn().mockResolvedValue(token) };
}

function okResponse(data: unknown, status = 200) {
  return {
    ok: true,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function noContentResponse() {
  return {
    ok: true,
    status: 204,
    statusText: 'No Content',
    json: () => Promise.reject(new Error('no body')),
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

function errorResponse(
  status: number,
  statusText: string,
  body = 'error details',
) {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({ error: body }),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function createClient(opts?: { aapAuth?: AapAuthApi }) {
  const discoveryApi = createMockDiscovery();
  const fetchApi = createMockFetch();
  const client = new ComplianceBackendClient({
    discoveryApi,
    fetchApi,
    aapAuthApi: opts?.aapAuth,
  });
  return { client, discoveryApi, fetchApi };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ComplianceBackendClient', () => {
  // ── Core request() behaviour ───────────────────────────────────────

  describe('request fundamentals', () => {
    it('discovers base URL from discoveryApi', async () => {
      const { client, discoveryApi, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ status: 'ok' }));
      await client.getHealth();
      expect(discoveryApi.getBaseUrl).toHaveBeenCalledWith('compliance');
    });

    it('builds correct URL from path', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ status: 'ok' }));
      await client.getHealth();
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/health`,
        expect.anything(),
      );
    });

    it('sets Content-Type and Accept headers', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getProfiles();
      const headers = fetchApi.fetch.mock.calls[0][1]!.headers as Record<
        string,
        string
      >;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Accept).toBe('application/json');
    });

    it('returns parsed JSON on success', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([{ id: 'p1' }]));
      const result = await client.getProfiles();
      expect(result).toEqual([{ id: 'p1' }]);
    });

    it('returns undefined on 204 No Content', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(noContentResponse());
      const result = await client.deleteRemediationProfile('rp-1');
      expect(result).toBeUndefined();
    });

    it('throws with status, statusText, and body on non-ok', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(
        errorResponse(500, 'Internal Server Error', 'db down'),
      );
      await expect(client.getProfiles()).rejects.toThrow(
        '500 Internal Server Error: db down',
      );
    });
  });

  // ── AAP token flow ─────────────────────────────────────────────────

  describe('AAP token flow', () => {
    it('passes x-aap-token when aapAuthApi is available', async () => {
      const aapAuth = createMockAapAuth('my-token');
      const { client, fetchApi } = createClient({ aapAuth });
      fetchApi.fetch.mockResolvedValue(
        okResponse({ scanId: 's1', workflowJobId: 1, status: 'pending' }),
      );
      await client.launchScan({ profileId: 'p1', inventoryId: 1 } as any);
      const headers = fetchApi.fetch.mock.calls[0][1]!.headers as Record<
        string,
        string
      >;
      expect(headers['x-aap-token']).toBe('my-token');
    });

    it('omits x-aap-token when aapAuthApi is not provided', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getProfiles();
      const headers = fetchApi.fetch.mock.calls[0][1]!.headers as Record<
        string,
        string
      >;
      expect(headers['x-aap-token']).toBeUndefined();
    });

    it('omits x-aap-token when getAccessToken throws', async () => {
      const aapAuth = createMockAapAuth();
      aapAuth.getAccessToken.mockRejectedValue(new Error('auth unavailable'));
      const { client, fetchApi } = createClient({ aapAuth });
      fetchApi.fetch.mockResolvedValue(
        okResponse({ scanId: 's1', workflowJobId: 1, status: 'pending' }),
      );
      await client.launchScan({ profileId: 'p1', inventoryId: 1 } as any);
      const headers = fetchApi.fetch.mock.calls[0][1]!.headers as Record<
        string,
        string
      >;
      expect(headers['x-aap-token']).toBeUndefined();
    });
  });

  // ── Simple GET methods ─────────────────────────────────────────────

  describe('simple GET methods', () => {
    const cases: Array<
      [string, (c: ComplianceBackendClient) => Promise<unknown>, string]
    > = [
      ['getHealth', c => c.getHealth(), '/health'],
      ['getProfiles', c => c.getProfiles(), '/profiles'],
      ['getScans', c => c.getScans(), '/scans'],
      ['getInventories', c => c.getInventories(), '/inventories'],
      ['getDashboardStats', c => c.getDashboardStats(), '/dashboard'],
      [
        'getRegisteredProfiles',
        c => c.getRegisteredProfiles(),
        '/compliance-profiles',
      ],
      [
        'getControllerJobTemplates',
        c => c.getControllerJobTemplates(),
        '/controller/job-templates',
      ],
      [
        'getControllerWorkflowTemplates',
        c => c.getControllerWorkflowTemplates(),
        '/controller/workflow-job-templates',
      ],
      [
        'getControllerExecutionEnvironments',
        c => c.getControllerExecutionEnvironments(),
        '/controller/execution-environments',
      ],
    ];

    it.each(cases)('%s calls correct endpoint', async (_name, fn, path) => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({}));
      await fn(client);
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        `${BASE_URL}${path}`,
        expect.anything(),
      );
    });
  });

  // ── GET with parameters ────────────────────────────────────────────

  describe('GET with parameters', () => {
    it('getWorkflowTemplates appends name filter', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getWorkflowTemplates('compliance');
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('?name=compliance'),
        expect.anything(),
      );
    });

    it('getWorkflowTemplates omits filter when empty', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getWorkflowTemplates();
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/workflow-templates`,
        expect.anything(),
      );
    });

    it('getFindings builds query params from scanId and profileId', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getFindings('scan-1', 'prof-1');
      const url = fetchApi.fetch.mock.calls[0][0] as string;
      expect(url).toContain('scanId=scan-1');
      expect(url).toContain('profileId=prof-1');
    });

    it('getFindings omits params when not provided', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getFindings();
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/findings`,
        expect.anything(),
      );
    });

    it('getRemediationProfiles appends status filter', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getRemediationProfiles('saved');
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('?status=saved'),
        expect.anything(),
      );
    });

    it('getRemediationExecutions includes profileId', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getRemediationExecutions('rp-1', 10);
      const url = fetchApi.fetch.mock.calls[0][0] as string;
      expect(url).toContain('profileId=rp-1');
      expect(url).toContain('limit=10');
    });

    it('getPostureHistory builds query from profileId and days', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getPostureHistory('prof-1', 30);
      const url = fetchApi.fetch.mock.calls[0][0] as string;
      expect(url).toContain('profileId=prof-1');
      expect(url).toContain('days=30');
    });

    it('getBatchScanStats joins scan IDs', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({}));
      await client.getBatchScanStats(['s1', 's2', 's3']);
      const url = fetchApi.fetch.mock.calls[0][0] as string;
      expect(url).toContain('ids=s1,s2,s3');
    });

    it('getBaselineTargets appends complianceProfileId', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse([]));
      await client.getBaselineTargets('rhel9-stig');
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('complianceProfileId=rhel9-stig'),
        expect.anything(),
      );
    });

    it('getAuthoritativeScan encodes both params', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({}));
      await client.getAuthoritativeScan('prof-1', 5);
      const url = fetchApi.fetch.mock.calls[0][0] as string;
      expect(url).toContain('profileId=prof-1');
      expect(url).toContain('inventoryId=5');
    });
  });

  // ── Null-returning methods ─────────────────────────────────────────

  describe('methods that catch errors and return null', () => {
    it('getScan returns null on error', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(404, 'Not Found'));
      const result = await client.getScan('missing');
      expect(result).toBeNull();
    });

    it('getRemediationProfile returns null on error', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(404, 'Not Found'));
      const result = await client.getRemediationProfile('missing');
      expect(result).toBeNull();
    });

    it('getRemediationExecution returns null on error', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(404, 'Not Found'));
      const result = await client.getRemediationExecution('missing');
      expect(result).toBeNull();
    });

    it('getRegisteredProfile returns null on error', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(404, 'Not Found'));
      const result = await client.getRegisteredProfile('missing');
      expect(result).toBeNull();
    });

    it('getAuthoritativeScan returns null on 404', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(404, 'Not Found'));
      const result = await client.getAuthoritativeScan('prof', 1);
      expect(result).toBeNull();
    });

    it('getRemediationErrorDetails returns null on error', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(500, 'Server Error'));
      const result = await client.getRemediationErrorDetails([1, 2]);
      expect(result).toBeNull();
    });

    it('getBaselineScores returns empty array on error', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(errorResponse(500, 'Server Error'));
      const result = await client.getBaselineScores('rp-1');
      expect(result).toEqual([]);
    });
  });

  // ── Mutating methods with AAP token ────────────────────────────────

  describe('mutating methods with AAP token', () => {
    const aapAuth = createMockAapAuth('user-aap-token');

    it('launchScan passes x-aap-token', async () => {
      const { client, fetchApi } = createClient({ aapAuth });
      fetchApi.fetch.mockResolvedValue(okResponse({ scanId: 's1' }));
      await client.launchScan({ profileId: 'p1', inventoryId: 1 } as any);
      expect(
        (fetchApi.fetch.mock.calls[0][1]!.headers as Record<string, string>)[
          'x-aap-token'
        ],
      ).toBe('user-aap-token');
    });

    it('launchRemediation passes x-aap-token', async () => {
      const { client, fetchApi } = createClient({ aapAuth });
      fetchApi.fetch.mockResolvedValue(okResponse({ remediationId: 'r1' }));
      await client.launchRemediation({ profileId: 'p1' } as any);
      expect(
        (fetchApi.fetch.mock.calls[0][1]!.headers as Record<string, string>)[
          'x-aap-token'
        ],
      ).toBe('user-aap-token');
    });

    it('saveRegisteredProfile passes x-aap-token', async () => {
      const { client, fetchApi } = createClient({ aapAuth });
      fetchApi.fetch.mockResolvedValue(okResponse({ id: 'p1' }));
      await client.saveRegisteredProfile({ displayName: 'test' } as any);
      expect(
        (fetchApi.fetch.mock.calls[0][1]!.headers as Record<string, string>)[
          'x-aap-token'
        ],
      ).toBe('user-aap-token');
    });

    it('deleteRegisteredProfile passes x-aap-token', async () => {
      const { client, fetchApi } = createClient({ aapAuth });
      fetchApi.fetch.mockResolvedValue(noContentResponse());
      await client.deleteRegisteredProfile('p1');
      expect(
        (fetchApi.fetch.mock.calls[0][1]!.headers as Record<string, string>)[
          'x-aap-token'
        ],
      ).toBe('user-aap-token');
    });
  });

  // ── POST/PATCH/DELETE methods ──────────────────────────────────────

  describe('POST/PATCH/DELETE methods', () => {
    it('updateSettings sends POST with body', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ retentionDays: 90 }));
      await client.updateSettings({ retentionDays: 90 });
      const [url, opts] = fetchApi.fetch.mock.calls[0];
      expect(url).toContain('/settings');
      expect(opts!.method).toBe('POST');
      expect(JSON.parse(opts!.body as string)).toEqual({ retentionDays: 90 });
    });

    it('runCleanup sends POST', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ deleted: 5 }));
      await client.runCleanup();
      expect(fetchApi.fetch.mock.calls[0][1]!.method).toBe('POST');
    });

    it('saveRemediationProfile sends POST', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ id: 'rp-1' }));
      await client.saveRemediationProfile({ name: 'test' } as any);
      expect(fetchApi.fetch.mock.calls[0][1]!.method).toBe('POST');
    });

    it('deleteRemediationProfile sends DELETE with encoded ID', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(noContentResponse());
      await client.deleteRemediationProfile('rp-1');
      const [url, opts] = fetchApi.fetch.mock.calls[0];
      expect(url).toContain('/remediation-profiles/rp-1');
      expect(opts!.method).toBe('DELETE');
    });

    it('updateRemediationProfileStatus sends PATCH with status', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(
        okResponse({ id: 'rp-1', status: 'archived' }),
      );
      await client.updateRemediationProfileStatus('rp-1', 'archived' as any);
      const [, opts] = fetchApi.fetch.mock.calls[0];
      expect(opts!.method).toBe('PATCH');
      expect(JSON.parse(opts!.body as string)).toEqual({ status: 'archived' });
    });

    it('validateScan sends POST to /scan/validate', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ valid: true }));
      await client.validateScan({ profileId: 'p1', inventoryId: 1 });
      const [url, opts] = fetchApi.fetch.mock.calls[0];
      expect(url).toContain('/scan/validate');
      expect(opts!.method).toBe('POST');
    });

    it('pinBaselineTarget sends POST', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ id: 'bt-1' }));
      await client.pinBaselineTarget({
        remediationProfileId: 'rp-1',
        complianceProfileId: 'cp-1',
        inventoryId: 1,
      });
      expect(fetchApi.fetch.mock.calls[0][1]!.method).toBe('POST');
    });

    it('unpinBaselineTarget sends DELETE', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(noContentResponse());
      await client.unpinBaselineTarget('bt-1');
      const [url, opts] = fetchApi.fetch.mock.calls[0];
      expect(url).toContain('/baseline-targets/bt-1');
      expect(opts!.method).toBe('DELETE');
    });

    it('updateRemediationExecution sends PATCH', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ id: 'exec-1' }));
      await client.updateRemediationExecution('exec-1', {
        status: 'succeeded',
      } as any);
      expect(fetchApi.fetch.mock.calls[0][1]!.method).toBe('PATCH');
    });

    it('getChain encodes executionId', async () => {
      const { client, fetchApi } = createClient();
      fetchApi.fetch.mockResolvedValue(okResponse({ execution: {} }));
      await client.getChain('exec-1');
      expect(fetchApi.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chain/exec-1'),
        expect.anything(),
      );
    });
  });
});
