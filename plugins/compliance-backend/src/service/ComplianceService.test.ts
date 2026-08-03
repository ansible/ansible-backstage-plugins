import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';

import type {
  MultiHostFinding,
  StoredFinding,
  JobEvent,
  RemediationSelection,
  ComplianceProfile,
} from '@ansible/backstage-compliance-common';

import { ComplianceService } from './ComplianceService';
import { ControllerClient } from './ControllerClient';
import { ComplianceDatabase } from '../database/ComplianceDatabase';

// ─── Shared mock factories ──────────────────────────────────────────

function createMockLogger(): LoggerService {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as LoggerService;
}

function createMockConfig(
  overrides: {
    dataSource?: string;
    baseUrl?: string;
    token?: string;
    checkSSL?: boolean;
  } = {},
): Config {
  const { dataSource = 'mock', baseUrl, token, checkSSL } = overrides;

  const ansibleConfig =
    baseUrl || token
      ? {
          getOptionalString: jest.fn((key: string) => {
            if (key === 'rhaap.baseUrl') return baseUrl ?? '';
            if (key === 'rhaap.token') return token ?? '';
            return undefined;
          }),
          getOptionalBoolean: jest.fn((key: string) => {
            if (key === 'rhaap.checkSSL') return checkSSL ?? true;
            return undefined;
          }),
        }
      : undefined;

  return {
    getOptionalString: jest.fn((key: string) => {
      if (key === 'ansible.compliance.dataSource') return dataSource;
      return undefined;
    }),
    getOptionalConfig: jest.fn((_key: string) => ansibleConfig),
    getOptionalBoolean: jest.fn(() => undefined),
  } as unknown as Config;
}

function createMockDatabase(): jest.Mocked<ComplianceDatabase> {
  return {
    getProfile: jest.fn(),
    getFindingsByScanId: jest.fn(),
    saveFindingsForScan: jest.fn(),
    updateScanStatus: jest.fn(),
    createScan: jest.fn(),
    getRecentScans: jest.fn(),
    saveScanResults: jest.fn(),
    getLatestFindings: jest.fn(),
    savePostureSnapshot: jest.fn(),
    getPostureHistory: jest.fn(),
    saveRemediationProfile: jest.fn(),
    listRemediationProfiles: jest.fn(),
    getRemediationProfile: jest.fn(),
    deleteRemediationProfile: jest.fn(),
    listProfiles: jest.fn(),
    saveProfile: jest.fn(),
    deleteProfile: jest.fn(),
    getScanByWorkflowJobId: jest.fn(),
  } as unknown as jest.Mocked<ComplianceDatabase>;
}

// ─── Mock ControllerClient ──────────────────────────────────────────

jest.mock('./ControllerClient');

// ─── Tests ──────────────────────────────────────────────────────────

describe('ComplianceService', () => {
  let mockLogger: LoggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
  });

  // ── 1. Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates with mock dataSource by default', () => {
      const config = createMockConfig();
      const service = new ComplianceService(config, mockLogger);

      expect(service.getDataSource()).toBe('mock');
    });

    it('creates with mock dataSource when explicitly configured', () => {
      const config = createMockConfig({ dataSource: 'mock' });
      const service = new ComplianceService(config, mockLogger);

      expect(service.getDataSource()).toBe('mock');
    });

    it('creates with live dataSource when configured with Controller credentials', () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token-123',
      });
      const service = new ComplianceService(config, mockLogger);

      expect(service.getDataSource()).toBe('live');
    });

    it('defaults unknown dataSource values to mock', () => {
      const config = createMockConfig({ dataSource: 'bogus' });
      const service = new ComplianceService(config, mockLogger);

      expect(service.getDataSource()).toBe('mock');
    });

    it('throws when live mode is configured without baseUrl', () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: '',
        token: 'test-token',
      });

      expect(() => new ComplianceService(config, mockLogger)).toThrow(
        /baseUrl.*token.*not configured/i,
      );
    });

    it('throws when live mode is configured without token', () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: '',
      });

      expect(() => new ComplianceService(config, mockLogger)).toThrow(
        /baseUrl.*token.*not configured/i,
      );
    });
  });

  // ── 2. getProfiles ─────────────────────────────────────────────────

  describe('getProfiles', () => {
    it('returns mock profiles in mock mode', async () => {
      const config = createMockConfig();
      const service = new ComplianceService(config, mockLogger);

      const profiles = await service.getProfiles();

      expect(profiles.length).toBeGreaterThan(0);
      expect(profiles[0]).toHaveProperty('id');
      expect(profiles[0]).toHaveProperty('displayName');
      expect(profiles[0]).toHaveProperty('framework');
    });

    it('returns empty array in live mode', async () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });
      const service = new ComplianceService(config, mockLogger);

      const profiles = await service.getProfiles();
      expect(profiles).toEqual([]);
    });
  });

  // ── 3. getInventories ──────────────────────────────────────────────

  describe('getInventories', () => {
    it('returns mock inventories in mock mode', async () => {
      const config = createMockConfig();
      const service = new ComplianceService(config, mockLogger);

      const inventories = await service.getInventories();

      expect(inventories.length).toBeGreaterThan(0);
      expect(inventories[0]).toHaveProperty('id');
      expect(inventories[0]).toHaveProperty('name');
      expect(inventories[0]).toHaveProperty('hostCount');
    });

    it('calls ControllerClient in live mode', async () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });

      const mockListInventories = jest.fn().mockResolvedValue({
        count: 1,
        results: [{ id: 5, name: 'prod-hosts', total_hosts: 42 }],
      });

      // Get the mocked ControllerClient constructor
      const MockedClient = ControllerClient as jest.MockedClass<
        typeof ControllerClient
      >;
      MockedClient.prototype.listInventories = mockListInventories;

      const service = new ComplianceService(config, mockLogger);
      const inventories = await service.getInventories();

      expect(mockListInventories).toHaveBeenCalled();
      expect(inventories).toEqual([
        { id: 5, name: 'prod-hosts', hostCount: 42 },
      ]);
    });
  });

  // ── 4. getDashboardStats ───────────────────────────────────────────

  describe('getDashboardStats', () => {
    it('returns mock stats in mock mode', async () => {
      const config = createMockConfig();
      const service = new ComplianceService(config, mockLogger);

      const stats = await service.getDashboardStats();

      expect(stats).toHaveProperty('hostsScanned');
      expect(stats).toHaveProperty('criticalFindings');
      expect(stats).toHaveProperty('recentScans');
      expect(stats.hostsScanned).toBeGreaterThan(0);
    });

    it('returns zeroed stats in live mode (no DB data)', async () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });
      const service = new ComplianceService(config, mockLogger);

      const stats = await service.getDashboardStats();

      expect(stats.hostsScanned).toBe(0);
      expect(stats.criticalFindings).toBe(0);
      expect(stats.recentScans).toEqual([]);
    });
  });

  // ── 5. getFindings ─────────────────────────────────────────────────

  describe('getFindings', () => {
    it('returns mock findings in mock mode', async () => {
      const config = createMockConfig();
      const service = new ComplianceService(config, mockLogger);

      const findings = await service.getFindings();

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]).toHaveProperty('ruleId');
      expect(findings[0]).toHaveProperty('hosts');
      expect(findings[0]).toHaveProperty('severity');
    });

    it('returns empty array in live mode when no DB data', async () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });
      const service = new ComplianceService(config, mockLogger);

      const findings = await service.getFindings();
      expect(findings).toEqual([]);
    });

    it('returns aggregated findings from DB when scanId is provided in live mode', async () => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });
      const service = new ComplianceService(config, mockLogger);
      const mockDb = createMockDatabase();
      service.setDatabase(mockDb);

      const dbFindings = [
        {
          id: 'f1',
          scanId: 'scan-100',
          ruleId: 'sshd_set_idle_timeout',
          stigId: 'V-257844',
          host: '192.168.1.1',
          status: 'fail',
          severity: 'CAT_I',
          actualValue: '300',
          expectedValue: '600',
          evidence: null,
        },
        {
          id: 'f2',
          scanId: 'scan-100',
          ruleId: 'sshd_set_idle_timeout',
          stigId: 'V-257844',
          host: '192.168.1.2',
          status: 'pass',
          severity: 'CAT_I',
          actualValue: '600',
          expectedValue: '600',
          evidence: null,
        },
      ] as StoredFinding[];
      mockDb.getFindingsByScanId.mockResolvedValue(dbFindings);

      const findings = await service.getFindings('scan-100');

      expect(mockDb.getFindingsByScanId).toHaveBeenCalledWith('scan-100');
      expect(findings.length).toBe(1);
      expect(findings[0].ruleId).toBe('sshd_set_idle_timeout');
      expect(findings[0].hosts.length).toBe(2);
      expect(findings[0].passCount).toBe(1);
      expect(findings[0].failCount).toBe(1);
    });
  });

  // ── 6. launchScan (mock mode) ──────────────────────────────────────

  describe('launchScan', () => {
    it('returns mock response in mock mode', async () => {
      const config = createMockConfig();
      const service = new ComplianceService(config, mockLogger);

      const response = await service.launchScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,

      });

      expect(response).toHaveProperty('scanId');
      expect(response).toHaveProperty('workflowJobId');
      expect(response).toHaveProperty('status');
      expect(response.status).toBe('pending');
    });
  });

  // ── 7. resolveWorkflowTemplateId (tested via launchScan) ──────────

  describe('resolveWorkflowTemplateId (via launchScan)', () => {
    let service: ComplianceService;
    let mockDb: jest.Mocked<ComplianceDatabase>;
    let mockLaunchWorkflow: jest.Mock;
    let mockListWorkflowJobTemplates: jest.Mock;

    beforeEach(() => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });

      mockLaunchWorkflow = jest.fn().mockResolvedValue({
        id: 999,
        workflow_job: 999,
        status: 'pending',
      });

      mockListWorkflowJobTemplates = jest.fn().mockResolvedValue({
        count: 1,
        results: [
          {
            id: 50,
            name: 'compliance-rhel9_stig-scan',
            description: 'STIG scan',
          },
        ],
      });

      const MockedClient = ControllerClient as jest.MockedClass<
        typeof ControllerClient
      >;
      MockedClient.prototype.launchWorkflow = mockLaunchWorkflow;
      MockedClient.prototype.listWorkflowJobTemplates =
        mockListWorkflowJobTemplates;

      service = new ComplianceService(config, mockLogger);
      mockDb = createMockDatabase();
      service.setDatabase(mockDb);
    });

    it('tier 1: uses explicit workflowTemplateId from request', async () => {
      await service.launchScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,

        workflowTemplateId: 42,
      });

      expect(mockLaunchWorkflow).toHaveBeenCalledWith(
        42,
        expect.any(Object),
        undefined,
        undefined,
        undefined,
        1,
      );
      expect(mockDb.getProfile).not.toHaveBeenCalled();
      expect(mockListWorkflowJobTemplates).not.toHaveBeenCalled();
    });

    it('tier 2: uses profile from DB when no explicit ID', async () => {
      mockDb.getProfile.mockResolvedValue({
        id: 'rhel9-stig',
        profileSlug: 'rhel9-stig',
        displayName: 'STIG',
        description: '',
        framework: 'DISA_STIG',
        version: 'V2R8',
        platform: 'RHEL 9',
        platformSpec: null,
        workflowTemplateId: 77,
        remediateJtId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
        certification: null,
        createdAt: '',
        updatedAt: '',
      } as ComplianceProfile);

      await service.launchScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,

      });

      expect(mockDb.getProfile).toHaveBeenCalledWith('rhel9-stig');
      expect(mockLaunchWorkflow).toHaveBeenCalledWith(
        77,
        expect.any(Object),
        undefined,
        undefined,
        undefined,
        1,
      );
      expect(mockListWorkflowJobTemplates).not.toHaveBeenCalled();
    });

    it('tier 3: falls back to name-based search on Controller', async () => {
      mockDb.getProfile.mockResolvedValue(null);

      await service.launchScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,

      });

      expect(mockDb.getProfile).toHaveBeenCalledWith('rhel9-stig');
      expect(mockListWorkflowJobTemplates).toHaveBeenCalledWith(
        'compliance',
        undefined,
      );
      expect(mockLaunchWorkflow).toHaveBeenCalledWith(
        50,
        expect.any(Object),
        undefined,
        undefined,
        undefined,
        1,
      );
    });

    it('tier 3: throws when no matching template is found', async () => {
      mockDb.getProfile.mockResolvedValue(null);
      mockListWorkflowJobTemplates.mockResolvedValue({
        count: 0,
        results: [],
      });

      await expect(
        service.launchScan({
          profileId: 'nonexistent-profile',
          inventoryId: 1,
  
        }),
      ).rejects.toThrow(/no compliance workflow job template found/i);
    });
  });

  // ── 8. parseJobEvents ──────────────────────────────────────────────

  describe('parseJobEvents', () => {
    let service: ComplianceService;

    beforeEach(() => {
      const config = createMockConfig();
      service = new ComplianceService(config, mockLogger);
    });

    it('extracts findings from compliance_report.findings in ansible_facts', () => {
      const events: JobEvent[] = [
        {
          id: 1,
          event: 'runner_on_ok',
          event_data: {
            host: '192.168.1.1',
            task: 'Build consolidated findings report',
            res: {
              ansible_facts: {
                compliance_report: {
                  findings: [
                    {
                      rule_id: 'sshd_set_idle_timeout',
                      stig_id: 'V-257844',
                      status: 'fail',
                      severity: 'high',
                      evidence:
                        'sshd_config clientaliveinterval:  (expected: 600)',
                      host: '192.168.1.1',
                    },
                  ],
                },
              },
            },
          },
          stdout: '',
          host_name: '192.168.1.1',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-1');

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('sshd_set_idle_timeout');
      expect(findings[0].stigId).toBe('V-257844');
      expect(findings[0].status).toBe('fail');
      expect(findings[0].severity).toBe('CAT_I');
      expect(findings[0].host).toBe('192.168.1.1');
      expect(findings[0].scanId).toBe('scan-1');
    });

    it('extracts findings from res.findings (Track A direct output)', () => {
      const events: JobEvent[] = [
        {
          id: 2,
          event: 'runner_on_ok',
          event_data: {
            host: '10.0.0.1',
            res: {
              findings: [
                {
                  rule_id: 'enable_fips_mode',
                  stig_id: 'V-257777',
                  status: 'fail',
                  severity: 'high',
                },
              ],
            },
          },
          stdout: '',
          host_name: '10.0.0.1',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-2');

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('enable_fips_mode');
      expect(findings[0].host).toBe('10.0.0.1');
    });

    it('extracts findings from ansible_facts.findings (facts-based)', () => {
      const events: JobEvent[] = [
        {
          id: 3,
          event: 'runner_on_ok',
          event_data: {
            host: 'host-a',
            res: {
              ansible_facts: {
                findings: [
                  {
                    rule_id: 'accounts_tmout',
                    status: 'pass',
                    severity: 'medium',
                  },
                ],
              },
            },
          },
          stdout: '',
          host_name: 'host-a',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-3');

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('accounts_tmout');
      expect(findings[0].severity).toBe('CAT_II');
    });

    it('extracts findings from ansible_facts.compliance_results.findings', () => {
      const events: JobEvent[] = [
        {
          id: 4,
          event: 'runner_on_ok',
          event_data: {
            host: 'host-b',
            res: {
              ansible_facts: {
                compliance_results: {
                  findings: [
                    {
                      rule_id: 'selinux_enforcing',
                      status: 'pass',
                      severity: 'high',
                    },
                  ],
                },
              },
            },
          },
          stdout: '',
          host_name: 'host-b',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-4');

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('selinux_enforcing');
    });

    it('handles multiple findings across multiple events', () => {
      const events: JobEvent[] = [
        {
          id: 10,
          event: 'runner_on_ok',
          event_data: {
            host: 'host-1',
            res: {
              findings: [
                { rule_id: 'rule_a', status: 'fail', severity: 'high' },
                { rule_id: 'rule_b', status: 'pass', severity: 'low' },
              ],
            },
          },
          stdout: '',
          host_name: 'host-1',
        },
        {
          id: 11,
          event: 'runner_on_ok',
          event_data: {
            host: 'host-2',
            res: {
              findings: [
                { rule_id: 'rule_a', status: 'pass', severity: 'high' },
              ],
            },
          },
          stdout: '',
          host_name: 'host-2',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-5');

      expect(findings).toHaveLength(3);
      expect(findings.filter((f: any) => f.ruleId === 'rule_a')).toHaveLength(
        2,
      );
      expect(findings.filter((f: any) => f.ruleId === 'rule_b')).toHaveLength(
        1,
      );
    });

    it('skips events with no res field', () => {
      const events: JobEvent[] = [
        {
          id: 20,
          event: 'runner_on_ok',
          event_data: { host: 'host-x' },
          stdout: '',
          host_name: 'host-x',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-6');
      expect(findings).toHaveLength(0);
    });

    it('skips events with res but no findings', () => {
      const events: JobEvent[] = [
        {
          id: 21,
          event: 'runner_on_ok',
          event_data: {
            host: 'host-y',
            res: { changed: false, msg: 'some task' },
          },
          stdout: '',
          host_name: 'host-y',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-7');
      expect(findings).toHaveLength(0);
    });

    it('uses finding-level host field over event-level host', () => {
      const events: JobEvent[] = [
        {
          id: 30,
          event: 'runner_on_ok',
          event_data: {
            host: 'event-host',
            res: {
              findings: [
                {
                  rule_id: 'test_rule',
                  status: 'fail',
                  severity: 'medium',
                  host: 'finding-host',
                },
              ],
            },
          },
          stdout: '',
          host_name: 'event-host-name',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-8');
      expect(findings[0].host).toBe('finding-host');
    });

    it('falls back to host_name when event_data.host is empty', () => {
      const events: JobEvent[] = [
        {
          id: 31,
          event: 'runner_on_ok',
          event_data: {
            res: {
              findings: [
                { rule_id: 'test_rule', status: 'fail', severity: 'low' },
              ],
            },
          },
          stdout: '',
          host_name: 'fallback-host',
        },
      ];

      const findings = (service as any).parseJobEvents(events, 'scan-9');
      expect(findings[0].host).toBe('fallback-host');
    });
  });

  // ── 9. mapRawFinding ───────────────────────────────────────────────

  describe('mapRawFinding', () => {
    let service: ComplianceService;

    beforeEach(() => {
      const config = createMockConfig();
      service = new ComplianceService(config, mockLogger);
    });

    it('maps high severity to CAT_I', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule1', status: 'fail', severity: 'high' },
        'host-1',
        'scan-1',
      );
      expect(finding.severity).toBe('CAT_I');
    });

    it('maps medium severity to CAT_II', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule2', status: 'fail', severity: 'medium' },
        'host-1',
        'scan-1',
      );
      expect(finding.severity).toBe('CAT_II');
    });

    it('maps low severity to CAT_III', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule3', status: 'pass', severity: 'low' },
        'host-1',
        'scan-1',
      );
      expect(finding.severity).toBe('CAT_III');
    });

    it('preserves CAT_* severity values that are already mapped', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule4', status: 'fail', severity: 'CAT_I' },
        'host-1',
        'scan-1',
      );
      expect(finding.severity).toBe('CAT_I');
    });

    it('defaults to CAT_II for unknown severity', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule5', status: 'fail', severity: 'critical' },
        'host-1',
        'scan-1',
      );
      expect(finding.severity).toBe('CAT_II');
    });

    it('defaults to medium (CAT_II) when severity is missing', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule6', status: 'fail' },
        'host-1',
        'scan-1',
      );
      expect(finding.severity).toBe('CAT_II');
    });

    it('parses string evidence', () => {
      const finding = (service as any).mapRawFinding(
        {
          rule_id: 'rule7',
          status: 'fail',
          severity: 'high',
          evidence: 'sshd_config clientaliveinterval:  (expected: 600)',
        },
        'host-1',
        'scan-1',
      );
      expect(finding.evidence).toBe(
        'sshd_config clientaliveinterval:  (expected: 600)',
      );
    });

    it('stringifies object evidence', () => {
      const evidenceObj = { config_file: '/etc/sshd_config', setting: 'off' };
      const finding = (service as any).mapRawFinding(
        {
          rule_id: 'rule8',
          status: 'fail',
          severity: 'medium',
          evidence: evidenceObj,
        },
        'host-1',
        'scan-1',
      );
      expect(finding.evidence).toBe(JSON.stringify(evidenceObj));
    });

    it('sets evidence to null when not present', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'rule9', status: 'pass', severity: 'low' },
        'host-1',
        'scan-1',
      );
      expect(finding.evidence).toBeNull();
    });

    it('extracts actual/expected values from evidence string', () => {
      const finding = (service as any).mapRawFinding(
        {
          rule_id: 'rule10',
          status: 'fail',
          severity: 'high',
          evidence: 'sshd_config clientaliveinterval: 300 (expected: 600)',
        },
        'host-1',
        'scan-1',
      );
      expect(finding.expectedValue).toBe('600');
      expect(finding.actualValue).toBe('300');
    });

    it('extracts (not set) when actual value is empty in evidence', () => {
      const finding = (service as any).mapRawFinding(
        {
          rule_id: 'rule11',
          status: 'fail',
          severity: 'high',
          evidence: 'sshd_config clientaliveinterval:  (expected: 600)',
        },
        'host-1',
        'scan-1',
      );
      expect(finding.expectedValue).toBe('600');
      expect(finding.actualValue).toBe('(not set)');
    });

    it('uses explicit actual_value and expected_value over parsing', () => {
      const finding = (service as any).mapRawFinding(
        {
          rule_id: 'rule12',
          status: 'fail',
          severity: 'high',
          evidence: 'some evidence string: 123 (expected: 456)',
          actual_value: 'explicit-actual',
          expected_value: 'explicit-expected',
        },
        'host-1',
        'scan-1',
      );
      expect(finding.actualValue).toBe('explicit-actual');
      expect(finding.expectedValue).toBe('explicit-expected');
    });

    it('populates all required StoredFinding fields', () => {
      const finding = (service as any).mapRawFinding(
        {
          rule_id: 'full_rule',
          stig_id: 'V-999999',
          status: 'fail',
          severity: 'high',
          evidence: 'some evidence',
          actual_value: 'bad',
          expected_value: 'good',
        },
        'prod-host-01',
        'scan-42',
      );

      expect(finding).toEqual({
        scanId: 'scan-42',
        ruleId: 'full_rule',
        stigId: 'V-999999',
        host: 'prod-host-01',
        status: 'fail',
        severity: 'CAT_I',
        actualValue: 'bad',
        expectedValue: 'good',
        evidence: 'some evidence',
        findingState: null,
      });
    });

    it('defaults stigId to empty string when missing', () => {
      const finding = (service as any).mapRawFinding(
        { rule_id: 'no_stig', status: 'pass', severity: 'low' },
        'host-1',
        'scan-1',
      );
      expect(finding.stigId).toBe('');
    });
  });

  // ── 10. aggregateFindings ──────────────────────────────────────────

  describe('aggregateFindings', () => {
    let service: ComplianceService;

    beforeEach(() => {
      const config = createMockConfig();
      service = new ComplianceService(config, mockLogger);
    });

    it('groups findings by ruleId into MultiHostFinding[]', () => {
      const stored = [
        {
          scanId: 's1',
          ruleId: 'rule_a',
          stigId: 'V-001',
          host: 'host-1',
          status: 'fail',
          severity: 'CAT_I',
          actualValue: 'bad',
          expectedValue: 'good',
          evidence: null,
        },
        {
          scanId: 's1',
          ruleId: 'rule_a',
          stigId: 'V-001',
          host: 'host-2',
          status: 'pass',
          severity: 'CAT_I',
          actualValue: 'good',
          expectedValue: 'good',
          evidence: null,
        },
        {
          scanId: 's1',
          ruleId: 'rule_b',
          stigId: 'V-002',
          host: 'host-1',
          status: 'fail',
          severity: 'CAT_II',
          actualValue: 'wrong',
          expectedValue: 'right',
          evidence: null,
        },
      ] as Array<Omit<StoredFinding, 'id'>>;

      const result = service.aggregateFindings(stored);

      expect(result).toHaveLength(2);

      const ruleA = result.find(f => f.ruleId === 'rule_a');
      expect(ruleA).toBeDefined();
      expect(ruleA!.hosts).toHaveLength(2);
      expect(ruleA!.passCount).toBe(1);
      expect(ruleA!.failCount).toBe(1);
      expect(ruleA!.totalCount).toBe(2);
      expect(ruleA!.severity).toBe('CAT_I');
      expect(ruleA!.stigId).toBe('V-001');

      const ruleB = result.find(f => f.ruleId === 'rule_b');
      expect(ruleB).toBeDefined();
      expect(ruleB!.hosts).toHaveLength(1);
      expect(ruleB!.passCount).toBe(0);
      expect(ruleB!.failCount).toBe(1);
    });

    it('returns empty array for empty input', () => {
      const result = service.aggregateFindings([]);
      expect(result).toEqual([]);
    });

    it('handles all-pass findings correctly', () => {
      const stored = [
        {
          scanId: 's1',
          ruleId: 'rule_c',
          stigId: 'V-003',
          host: 'h1',
          status: 'pass',
          severity: 'CAT_III',
          actualValue: 'ok',
          expectedValue: 'ok',
          evidence: null,
        },
        {
          scanId: 's1',
          ruleId: 'rule_c',
          stigId: 'V-003',
          host: 'h2',
          status: 'pass',
          severity: 'CAT_III',
          actualValue: 'ok',
          expectedValue: 'ok',
          evidence: null,
        },
      ] as Array<Omit<StoredFinding, 'id'>>;

      const result = service.aggregateFindings(stored);

      expect(result).toHaveLength(1);
      expect(result[0].passCount).toBe(2);
      expect(result[0].failCount).toBe(0);
      expect(result[0].totalCount).toBe(2);
    });

    it('sets default fields for MultiHostFinding metadata', () => {
      const stored = [
        {
          scanId: 's1',
          ruleId: 'some_rule',
          stigId: 'V-100',
          host: 'h1',
          status: 'fail',
          severity: 'CAT_I',
          actualValue: '',
          expectedValue: '',
          evidence: null,
        },
      ] as Array<Omit<StoredFinding, 'id'>>;

      const result = service.aggregateFindings(stored);

      expect(result[0].title).toBe('some_rule');
      expect(result[0].description).toBe('');
      expect(result[0].category).toBe('');
      expect(result[0].disruption).toBe('medium');
      expect(result[0].parameters).toEqual([]);
    });
  });

  // ── 11. buildRemediationPlan ───────────────────────────────────────

  describe('buildRemediationPlan', () => {
    let service: ComplianceService;

    const findings = [
      {
        ruleId: 'sshd_set_idle_timeout',
        stigId: 'V-257844',
        title: 'Set SSH Client Alive Interval',
        description: '',
        fixText: '',
        checkText: '',
        severity: 'CAT_I',
        category: '',
        disruption: 'low',
        parameters: [],
        hosts: [
          {
            host: 'host-1',
            status: 'fail',
            actualValue: '300',
            expectedValue: '600',
          },
          {
            host: 'host-2',
            status: 'pass',
            actualValue: '600',
            expectedValue: '600',
          },
          {
            host: 'host-3',
            status: 'fail',
            actualValue: '0',
            expectedValue: '600',
          },
        ],
        passCount: 1,
        failCount: 2,
        totalCount: 3,
      },
      {
        ruleId: 'sshd_disable_root_login',
        stigId: 'V-257846',
        title: 'Disable SSH Root Login',
        description: '',
        fixText: '',
        checkText: '',
        severity: 'CAT_I',
        category: '',
        disruption: 'low',
        parameters: [],
        hosts: [
          {
            host: 'host-1',
            status: 'fail',
            actualValue: 'yes',
            expectedValue: 'no',
          },
          {
            host: 'host-2',
            status: 'fail',
            actualValue: 'yes',
            expectedValue: 'no',
          },
          {
            host: 'host-3',
            status: 'fail',
            actualValue: 'yes',
            expectedValue: 'no',
          },
        ],
        passCount: 0,
        failCount: 3,
        totalCount: 3,
      },
      {
        ruleId: 'enable_fips_mode',
        stigId: 'V-257777',
        title: 'Enable FIPS Mode',
        description: '',
        fixText: '',
        checkText: '',
        severity: 'CAT_I',
        category: '',
        disruption: 'high',
        parameters: [],
        hosts: [
          {
            host: 'host-1',
            status: 'fail',
            actualValue: 'DEFAULT',
            expectedValue: 'FIPS',
          },
          {
            host: 'host-3',
            status: 'fail',
            actualValue: 'DEFAULT',
            expectedValue: 'FIPS',
          },
        ],
        passCount: 0,
        failCount: 2,
        totalCount: 2,
      },
    ] as unknown as MultiHostFinding[];

    beforeEach(() => {
      const config = createMockConfig();
      service = new ComplianceService(config, mockLogger);
    });

    it('returns empty plan when no selections are enabled', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: false,
          parameters: {},
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      expect(plan.groups).toEqual([]);
      expect(plan.totalRules).toBe(0);
      expect(plan.totalHosts).toBe(0);
    });

    it('returns empty plan when selections list is empty', () => {
      const plan = service.buildRemediationPlan([], findings);

      expect(plan.groups).toEqual([]);
      expect(plan.totalRules).toBe(0);
    });

    it('groups rules targeting the same failed hosts', () => {
      // Both sshd_set_idle_timeout and enable_fips_mode fail on host-1, host-3
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
        {
          ruleId: 'enable_fips_mode',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      // Both rules fail on host-1, host-3 => should be grouped together
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].tags).toContain('sshd_set_idle_timeout');
      expect(plan.groups[0].tags).toContain('enable_fips_mode');
      expect(plan.groups[0].limit).toBe('host-1,host-3');
      expect(plan.groups[0].hostCount).toBe(2);
      expect(plan.groups[0].ruleCount).toBe(2);
      expect(plan.totalRules).toBe(2);
      expect(plan.totalHosts).toBe(2);
    });

    it('creates separate groups for rules with different host sets', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
        {
          ruleId: 'sshd_disable_root_login',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      // sshd_set_idle_timeout fails on host-1, host-3
      // sshd_disable_root_login fails on host-1, host-2, host-3
      // Different host sets => separate groups
      expect(plan.groups).toHaveLength(2);
      expect(plan.totalHosts).toBe(3);
    });

    it('uses standardize_all scope to include all hosts (not just failed)', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: true,
          parameters: { scope: 'standardize_all' },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      expect(plan.groups).toHaveLength(1);
      // All 3 hosts included, not just the 2 that failed
      expect(plan.groups[0].hostCount).toBe(3);
      expect(plan.groups[0].limit).toBe('host-1,host-2,host-3');
    });

    it('excludes scope from extraVars', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: true,
          parameters: {
            scope: 'failed_only',
            var_sshd_set_keepalive: 600,
          },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      expect(plan.groups[0].extraVars).not.toHaveProperty('scope');
      expect(plan.groups[0].extraVars).toHaveProperty(
        'var_sshd_set_keepalive',
        600,
      );
    });

    it('sorts groups largest first', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
        {
          ruleId: 'sshd_disable_root_login',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
        {
          ruleId: 'enable_fips_mode',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      // sshd_set_idle_timeout + enable_fips_mode both fail on host-1,host-3 => grouped (2 rules)
      // sshd_disable_root_login fails on host-1,host-2,host-3 => separate (1 rule)
      // Largest ruleCount first
      expect(plan.groups[0].ruleCount).toBeGreaterThanOrEqual(
        plan.groups[plan.groups.length - 1].ruleCount,
      );
    });

    it('skips selections whose ruleId is not in findings', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'nonexistent_rule',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      // The rule won't be found in findings, so no groups
      expect(plan.groups).toEqual([]);
      // totalRules still reflects the enabled count from selections
      expect(plan.totalRules).toBe(1);
      expect(plan.totalHosts).toBe(0);
    });

    it('skips rules where all hosts pass (no remediation needed)', () => {
      const passingFindings = [
        {
          ruleId: 'all_pass_rule',
          stigId: 'V-999',
          title: '',
          description: '',
          fixText: '',
          checkText: '',
          severity: 'CAT_II',
          category: '',
          disruption: 'low',
          parameters: [],
          hosts: [
            {
              host: 'h1',
              status: 'pass',
              actualValue: 'ok',
              expectedValue: 'ok',
            },
          ],
          passCount: 1,
          failCount: 0,
          totalCount: 1,
        },
      ] as unknown as MultiHostFinding[];

      const selections: RemediationSelection[] = [
        {
          ruleId: 'all_pass_rule',
          enabled: true,
          parameters: { scope: 'failed_only' },
        },
      ];

      const plan = service.buildRemediationPlan(
        selections,
        passingFindings,
      );

      expect(plan.groups).toEqual([]);
    });

    it('merges extraVars when rules share the same host set', () => {
      const selections: RemediationSelection[] = [
        {
          ruleId: 'sshd_set_idle_timeout',
          enabled: true,
          parameters: { scope: 'failed_only', timeout: 600 },
        },
        {
          ruleId: 'enable_fips_mode',
          enabled: true,
          parameters: { scope: 'failed_only', crypto_policy: 'FIPS' },
        },
      ];

      const plan = service.buildRemediationPlan(selections, findings);

      // Both fail on host-1, host-3 => same group
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0].extraVars).toHaveProperty('timeout', 600);
      expect(plan.groups[0].extraVars).toHaveProperty(
        'crypto_policy',
        'FIPS',
      );
    });
  });

  // ── 12. fetchScanErrorDetails ─────────────────────────────────────

  describe('fetchScanErrorDetails', () => {
    let service: ComplianceService;
    let mockGetWorkflowNodes: jest.Mock;
    let mockGetJobStatus: jest.Mock;
    let mockGetJobFailureEvents: jest.Mock;
    let mockGetJobStdout: jest.Mock;

    beforeEach(() => {
      const config = createMockConfig({
        dataSource: 'live',
        baseUrl: 'https://controller.example.com',
        token: 'test-token',
      });

      mockGetWorkflowNodes = jest.fn().mockResolvedValue({
        count: 0, next: null, previous: null, results: [],
      });
      mockGetJobStatus = jest.fn().mockResolvedValue({
        id: 100, status: 'failed', finished: null, failed: true, elapsed: 10, job_tags: '', result_traceback: '',
      });
      mockGetJobFailureEvents = jest.fn().mockResolvedValue({
        count: 0, next: null, previous: null, results: [],
      });
      mockGetJobStdout = jest.fn().mockResolvedValue({ content: '' });

      const MockedClient = ControllerClient as jest.MockedClass<typeof ControllerClient>;
      MockedClient.prototype.getWorkflowNodes = mockGetWorkflowNodes;
      MockedClient.prototype.getJobStatus = mockGetJobStatus;
      MockedClient.prototype.getJobFailureEvents = mockGetJobFailureEvents;
      MockedClient.prototype.getJobStdout = mockGetJobStdout;

      service = new ComplianceService(config, mockLogger);
    });

    it('returns result_traceback from failed child job', async () => {
      mockGetWorkflowNodes.mockResolvedValue({
        count: 1, next: null, previous: null, results: [
          { id: 1, summary_fields: { job: { id: 200, status: 'failed' } } },
        ],
      });
      mockGetJobStatus.mockResolvedValue({
        id: 200, status: 'failed', finished: null, failed: true, elapsed: 10, job_tags: '',
        result_traceback: 'Traceback: module error on host',
      });

      const details = await service.fetchScanErrorDetails(100);

      expect(details).toBe('Traceback: module error on host');
      expect(mockGetJobStatus).toHaveBeenCalledWith(200, undefined);
      expect(mockGetJobFailureEvents).not.toHaveBeenCalled();
    });

    it('falls back to job events when result_traceback is empty', async () => {
      mockGetWorkflowNodes.mockResolvedValue({
        count: 1, next: null, previous: null, results: [
          { id: 1, summary_fields: { job: { id: 200, status: 'failed' } } },
        ],
      });
      mockGetJobStatus.mockResolvedValue({
        id: 200, status: 'failed', finished: null, failed: true, elapsed: 10, job_tags: '',
        result_traceback: '',
      });
      mockGetJobFailureEvents.mockResolvedValue({
        count: 1, next: null, previous: null, results: [
          { id: 1, event: 'runner_on_failed', event_data: { host: 'host-1', task: 'Fail check', res: { msg: 'No XCCDF results found' } }, stdout: '', host_name: 'host-1' },
        ],
      });

      const details = await service.fetchScanErrorDetails(100);

      expect(details).toContain('host-1');
      expect(details).toContain('No XCCDF results found');
      expect(mockGetJobFailureEvents).toHaveBeenCalledWith(200, undefined);
    });

    it('formats unreachable host events', async () => {
      mockGetWorkflowNodes.mockResolvedValue({
        count: 1, next: null, previous: null, results: [
          { id: 1, summary_fields: { job: { id: 300, status: 'failed' } } },
        ],
      });
      mockGetJobStatus.mockResolvedValue({
        id: 300, status: 'failed', finished: null, failed: true, elapsed: 5, job_tags: '', result_traceback: '',
      });
      mockGetJobFailureEvents.mockResolvedValue({
        count: 2, next: null, previous: null, results: [
          { id: 1, event: 'runner_on_unreachable', event_data: { host: 'web01', task: 'Check SSH', res: { msg: 'SSH timeout' } }, stdout: '', host_name: 'web01' },
          { id: 2, event: 'runner_on_unreachable', event_data: { host: 'web02', task: 'Check SSH', res: { msg: 'SSH timeout' } }, stdout: '', host_name: 'web02' },
        ],
      });

      const details = await service.fetchScanErrorDetails(100);

      expect(details).toContain('web01: [Check SSH] SSH timeout');
      expect(details).toContain('web02: [Check SSH] SSH timeout');
    });

    it('returns null when no errors are found', async () => {
      const details = await service.fetchScanErrorDetails(100);

      expect(details).toBeNull();
    });

    it('returns null when controller client throws', async () => {
      mockGetWorkflowNodes.mockRejectedValue(new Error('Network error'));
      mockGetJobFailureEvents.mockRejectedValue(new Error('Network error'));
      mockGetJobStdout.mockRejectedValue(new Error('Network error'));

      const details = await service.fetchScanErrorDetails(100);

      expect(details).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
