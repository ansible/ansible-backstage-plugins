import { LoggerService } from '@backstage/backend-plugin-api';
import { ControllerClient, ControllerClientOptions } from './ControllerClient';

// ─── Mock undici ─────────────────────────────────────────────────────

const mockFetch = jest.fn();
jest.mock('undici', () => ({
  Agent: jest.fn(),
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

function createMockLogger(): LoggerService {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as LoggerService;
}

const DEFAULT_OPTS: ControllerClientOptions = {
  baseUrl: 'https://aap.example.com',
  token: 'service-token-abc',
  checkSSL: true,
};

function createClient(overrides?: Partial<ControllerClientOptions>) {
  const logger = createMockLogger();
  const client = new ControllerClient({ ...DEFAULT_OPTS, ...overrides }, logger);
  return { client, logger };
}

function okResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(data),
  };
}

function errorResponse(status: number, statusText: string, body?: unknown) {
  return {
    ok: false,
    status,
    statusText,
    json: body !== undefined
      ? () => Promise.resolve(body)
      : () => { throw new Error('no body'); },
    text: () => Promise.resolve(body ? JSON.stringify(body) : ''),
  };
}


// ─── Tests ───────────────────────────────────────────────────────────

describe('ControllerClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Constructor ────────────────────────────────────────────────────

  describe('constructor', () => {
    it('strips trailing slashes from baseUrl', async () => {
      const { client } = createClient({ baseUrl: 'https://aap.example.com///' });
      mockFetch.mockResolvedValue(okResponse({ id: 1, status: 'pending' }));
      await client.getJobStatus(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://aap.example.com/api/controller/v2/jobs/1/',
        expect.anything(),
      );
    });
  });

  // ── GET request fundamentals ───────────────────────────────────────

  describe('GET requests', () => {
    it('sends bearer auth with service token', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, status: 'pending' }));
      await client.getJobStatus(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer service-token-abc',
          }),
        }),
      );
    });

    it('uses per-request user token when provided', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, status: 'pending' }));
      await client.getJobStatus(1, 'user-token-xyz');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer user-token-xyz',
          }),
        }),
      );
    });

    it('throws specific message on 403', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(errorResponse(403, 'Forbidden'));
      await expect(client.getJobStatus(1)).rejects.toThrow(
        'Insufficient privileges. Please contact your administrator.',
      );
    });

    it('throws with status and statusText on other errors', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(errorResponse(500, 'Internal Server Error'));
      await expect(client.getJobStatus(1)).rejects.toThrow('500 Internal Server Error');
    });

    it('throws wrapped message on network error', async () => {
      const { client } = createClient();
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(client.getJobStatus(1)).rejects.toThrow('Failed to fetch');
      await expect(client.getJobStatus(1)).rejects.toThrow('ECONNREFUSED');
    });

    it('normalizes leading slashes in endpoint', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 42 }));
      await client.getWorkflowJobStatus(42);
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('//api');
    });
  });

  // ── POST request fundamentals ──────────────────────────────────────

  describe('POST requests', () => {
    it('sends POST with JSON body', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, workflow_job: 1, status: 'pending' }));
      await client.launchWorkflow(10, { scan_id: 's1' });
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.extra_vars).toBeDefined();
    });

    it('throws specific message on 403', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(errorResponse(403, 'Forbidden'));
      await expect(client.launchWorkflow(10)).rejects.toThrow(
        'Insufficient privileges. Please contact your administrator.',
      );
    });

    it('parses error body JSON on non-ok response', async () => {
      const { client, logger } = createClient();
      mockFetch.mockResolvedValue(errorResponse(400, 'Bad Request', { detail: 'Invalid vars' }));
      await expect(client.launchWorkflow(10)).rejects.toThrow('400 Bad Request');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid vars'),
      );
    });

    it('throws wrapped message on network error', async () => {
      const { client } = createClient();
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));
      await expect(client.launchWorkflow(10)).rejects.toThrow('Failed to POST');
    });
  });

  // ── Pagination ─────────────────────────────────────────────────────

  describe('fetchAllPages (via getJobEvents)', () => {
    it('fetches single page when next is null', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(
        okResponse({ count: 2, next: null, previous: null, results: [{ id: 1 }, { id: 2 }] }),
      );
      const result = await client.getJobEvents(42);
      expect(result.results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('follows next URLs for multi-page results', async () => {
      const { client } = createClient();
      mockFetch
        .mockResolvedValueOnce(okResponse({
          count: 4, next: 'https://aap.example.com/api/controller/v2/jobs/42/job_events/?page=2', previous: null, results: [{ id: 1 }, { id: 2 }],
        }))
        .mockResolvedValueOnce(okResponse({
          count: 4, next: null, previous: null, results: [{ id: 3 }, { id: 4 }],
        }));
      const result = await client.getJobEvents(42);
      expect(result.results).toHaveLength(4);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('caps at maxPages and logs warning', async () => {
      const { client, logger } = createClient();
      // getRunnerOkEvents uses maxPages=10, but we can test via getJobEvents
      // which uses default 50. We'll test via getRunnerOkEvents with maxPages=1.
      mockFetch
        .mockResolvedValueOnce(okResponse({
          count: 100, next: 'https://aap.example.com/next', previous: null, results: [{ id: 1 }],
        }))
        .mockResolvedValueOnce(okResponse({
          count: 100, next: 'https://aap.example.com/next2', previous: null, results: [{ id: 2 }],
        }));
      // Call getRunnerOkEvents with maxPages=1 to test the cap
      await client.getRunnerOkEvents(42, undefined, 1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Pagination capped'),
      );
    });
  });

  // ── Workflow Job Templates ─────────────────────────────────────────

  describe('listWorkflowJobTemplates', () => {
    it('calls correct endpoint without filter', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ count: 1, next: null, previous: null, results: [{ id: 10 }] }));
      await client.listWorkflowJobTemplates();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://aap.example.com/api/controller/v2/workflow_job_templates/',
        expect.anything(),
      );
    });

    it('appends name filter when provided', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ count: 0, next: null, previous: null, results: [] }));
      await client.listWorkflowJobTemplates('compliance');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('name__icontains=compliance'),
        expect.anything(),
      );
    });
  });

  // ── launchWorkflow ─────────────────────────────────────────────────

  describe('launchWorkflow', () => {
    it('POSTs to correct endpoint with extra_vars', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, workflow_job: 1, status: 'pending' }));
      await client.launchWorkflow(10, { scan_id: 'abc' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://aap.example.com/api/controller/v2/workflow_job_templates/10/launch/',
        expect.anything(),
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(JSON.parse(body.extra_vars)).toEqual({ scan_id: 'abc' });
    });

    it('includes limit, job_tags, and inventory when provided', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, workflow_job: 1, status: 'pending' }));
      await client.launchWorkflow(10, undefined, undefined, 'host1,host2', 'sshd', 5);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.limit).toBe('host1,host2');
      expect(body.job_tags).toBe('sshd');
      expect(body.inventory).toBe(5);
    });

    it('omits optional fields when not provided', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, workflow_job: 1, status: 'pending' }));
      await client.launchWorkflow(10);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({});
    });
  });

  // ── Job Templates ──────────────────────────────────────────────────

  describe('listJobTemplates', () => {
    it('uses page_size=50 without filter', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ count: 0, next: null, previous: null, results: [] }));
      await client.listJobTemplates();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page_size=50'),
        expect.anything(),
      );
    });

    it('uses page_size=10 with filter', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ count: 0, next: null, previous: null, results: [] }));
      await client.listJobTemplates('compliance');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page_size=10'),
        expect.anything(),
      );
    });
  });

  // ── launchJobTemplate ──────────────────────────────────────────────

  describe('launchJobTemplate', () => {
    it('POSTs with body containing all optional fields', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 1, status: 'pending' }));
      await client.launchJobTemplate(49, { key: 'val' }, undefined, 'host1', 'tag1', 3);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.limit).toBe('host1');
      expect(body.job_tags).toBe('tag1');
      expect(body.inventory).toBe(3);
    });
  });

  // ── Workflow Jobs ──────────────────────────────────────────────────

  describe('getWorkflowJobStatus', () => {
    it('calls correct endpoint', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 42, status: 'successful' }));
      const result = await client.getWorkflowJobStatus(42);
      expect(result.status).toBe('successful');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://aap.example.com/api/controller/v2/workflow_jobs/42/',
        expect.anything(),
      );
    });
  });

  describe('getWorkflowNodes', () => {
    it('calls correct endpoint with page_size=200', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ count: 0, next: null, previous: null, results: [] }));
      await client.getWorkflowNodes(42);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('workflow_nodes/?page_size=200'),
        expect.anything(),
      );
    });
  });

  // ── Jobs ───────────────────────────────────────────────────────────

  describe('getJobStatus', () => {
    it('returns full job status object', async () => {
      const { client } = createClient();
      const data = { id: 99, status: 'failed', finished: '2026-01-01', failed: true, elapsed: 30, job_tags: '', result_traceback: 'error' };
      mockFetch.mockResolvedValue(okResponse(data));
      const result = await client.getJobStatus(99);
      expect(result).toEqual(data);
    });
  });

  describe('getRunnerOkEvents', () => {
    it('fires parallel fetches for runner_on_ok and runner_item_on_ok', async () => {
      const { client } = createClient();
      mockFetch
        .mockResolvedValueOnce(okResponse({ count: 1, next: null, previous: null, results: [{ id: 1, event: 'runner_on_ok' }] }))
        .mockResolvedValueOnce(okResponse({ count: 1, next: null, previous: null, results: [{ id: 2, event: 'runner_item_on_ok' }] }));
      const result = await client.getRunnerOkEvents(42);
      expect(result.results).toHaveLength(2);
      const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u: string) => u.includes('event=runner_on_ok'))).toBe(true);
      expect(urls.some((u: string) => u.includes('event=runner_item_on_ok'))).toBe(true);
    });
  });

  describe('getJobFailureEvents', () => {
    it('merges runner_on_failed and runner_on_unreachable', async () => {
      const { client } = createClient();
      mockFetch
        .mockResolvedValueOnce(okResponse({ count: 1, next: null, previous: null, results: [{ id: 1 }] }))
        .mockResolvedValueOnce(okResponse({ count: 1, next: null, previous: null, results: [{ id: 2 }] }));
      const result = await client.getJobFailureEvents(42);
      expect(result.results).toHaveLength(2);
    });
  });

  // ── Inventories ────────────────────────────────────────────────────

  describe('listInventories', () => {
    it('calls correct endpoint', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ count: 0, next: null, previous: null, results: [] }));
      await client.listInventories();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('inventories/?order_by=name&page_size=200'),
        expect.anything(),
      );
    });
  });

  describe('getInventoryHostnames', () => {
    it('returns array of host names', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({
        count: 2, next: null, previous: null,
        results: [{ id: 1, name: 'host-a' }, { id: 2, name: 'host-b' }],
      }));
      const names = await client.getInventoryHostnames(5);
      expect(names).toEqual(['host-a', 'host-b']);
    });
  });

  describe('getInventoryHostFacts', () => {
    it('fetches hosts then facts in parallel', async () => {
      const { client } = createClient();
      // First call: list hosts
      mockFetch.mockResolvedValueOnce(okResponse({
        count: 2, next: null, previous: null,
        results: [{ id: 10, name: 'web-01' }, { id: 11, name: 'web-02' }],
      }));
      // Per-host facts calls
      mockFetch
        .mockResolvedValueOnce(okResponse({ ansible_os_family: 'RedHat', ansible_distribution_major_version: '9' }))
        .mockResolvedValueOnce(okResponse({ ansible_os_family: 'RedHat', ansible_distribution_major_version: '9' }));

      const facts = await client.getInventoryHostFacts(5);
      expect(facts).toHaveLength(2);
      expect(facts[0].hostname).toBe('web-01');
      expect(facts[0].ansible_os_family).toBe('RedHat');
    });

    it('handles individual host fact failures gracefully', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValueOnce(okResponse({
        count: 2, next: null, previous: null,
        results: [{ id: 10, name: 'web-01' }, { id: 11, name: 'web-02' }],
      }));
      mockFetch
        .mockResolvedValueOnce(okResponse({ ansible_os_family: 'RedHat' }))
        .mockRejectedValueOnce(new Error('No facts'));

      const facts = await client.getInventoryHostFacts(5);
      expect(facts).toHaveLength(2);
      expect(facts[0].ansible_os_family).toBe('RedHat');
      expect(facts[1]).toEqual({ hostname: 'web-02' });
    });
  });

  // ── Polling ────────────────────────────────────────────────────────

  describe('pollWorkflowUntilDone', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns immediately on terminal status', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ id: 42, status: 'successful', finished: '2026-01-01' }));
      const result = await client.pollWorkflowUntilDone(42);
      expect(result.status).toBe('successful');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('recognizes all terminal statuses', async () => {
      for (const status of ['successful', 'failed', 'error', 'canceled']) {
        mockFetch.mockResolvedValue(okResponse({ id: 1, status }));
        const { client } = createClient();
        const result = await client.pollWorkflowUntilDone(1);
        expect(result.status).toBe(status);
      }
    });

    it('polls multiple times until terminal', async () => {
      const { client } = createClient();
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(okResponse({ id: 42, status: 'running' }));
        }
        return Promise.resolve(okResponse({ id: 42, status: 'successful' }));
      });

      const pollPromise = client.pollWorkflowUntilDone(42, 100, 10000);
      // Advance past 2 sleep intervals
      await jest.advanceTimersByTimeAsync(100);
      await jest.advanceTimersByTimeAsync(100);
      const result = await pollPromise;
      expect(result.status).toBe('successful');
    });

    it('throws when maxWaitMs exceeded', async () => {
      const { client } = createClient();
      jest.useRealTimers();
      mockFetch.mockResolvedValue(okResponse({ id: 42, status: 'running' }));
      await expect(
        client.pollWorkflowUntilDone(42, 10, 50),
      ).rejects.toThrow('did not complete within');
    });
  });

  // ── getJobStdout ───────────────────────────────────────────────────

  describe('getJobStdout', () => {
    it('calls correct endpoint with format=json', async () => {
      const { client } = createClient();
      mockFetch.mockResolvedValue(okResponse({ content: 'stdout output' }));
      const result = await client.getJobStdout(99);
      expect(result.content).toBe('stdout output');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('stdout/?format=json'),
        expect.anything(),
      );
    });
  });
});
