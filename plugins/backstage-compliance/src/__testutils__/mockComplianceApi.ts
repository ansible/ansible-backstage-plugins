/**
 * Shared mock for ComplianceApi used by all plugin tests.
 *
 * Usage:
 *   const mockApi = createMockComplianceApi();
 *   <TestApiProvider apis={[[complianceApiRef, mockApi]]}>
 */
import type { ComplianceApi } from '../api/complianceApiRef';
import type {
  ComplianceProfile,
  MultiHostFinding,
  DashboardStats,
  RemediationProfile,
  ComplianceScan,
  PostureSnapshot,
  LaunchScanResponse,
  LaunchRemediationResponse,
  WorkflowJobStatus,
  WorkflowNode,
  JobEvent,
  BaselineTarget,
} from '@ansible/backstage-compliance-common/types';

// ---------------------------------------------------------------------------
// Sample mock data constants
// ---------------------------------------------------------------------------

export const MOCK_PROFILES: ComplianceProfile[] = [
  {
    id: 'rhel9-stig',
    profileSlug: 'rhel9-stig',
    displayName: 'DISA STIG for RHEL 9',
    framework: 'DISA_STIG',
    version: 'V2R8',
    description: 'Defense Information Systems Agency STIG for RHEL 9',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: '',
    scanTags: '',
    certification: null,
    ruleCount: 366,
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'rhel9-cis-l1',
    profileSlug: 'rhel9-cis-l1',
    displayName: 'CIS Benchmark RHEL 9 — Level 1',
    framework: 'CIS',
    version: '1.0.0',
    description: 'CIS Benchmark Level 1 for RHEL 9',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: '',
    scanTags: '',
    certification: null,
    ruleCount: 189,
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'rhel9-pci-dss',
    profileSlug: 'rhel9-pci-dss',
    displayName: 'PCI-DSS v4.0 for RHEL 9',
    framework: 'PCI_DSS',
    version: '4.0',
    description: 'PCI Data Security Standard v4.0',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: '',
    scanTags: '',
    certification: null,
    ruleCount: 142,
    createdAt: '2026-03-10T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
];

export const MOCK_FINDINGS: MultiHostFinding[] = [
  {
    ruleId: 'sshd_set_idle_timeout',
    stigId: 'V-257844',
    title: 'Set SSH Client Alive Interval',
    description: 'The SSH idle timeout must be set to 600 seconds or less.',
    fixText: 'Set ClientAliveInterval to 600 in /etc/ssh/sshd_config',
    checkText: 'Verify the SSH daemon ClientAliveInterval setting.',
    severity: 'CAT_II',
    category: 'SSH',
    disruption: 'low', aapImpact: 'safe' as const, aapImpactReason: '',
    parameters: [
      {
        name: 'interval',
        label: 'Interval (seconds)',
        description: 'SSH client alive interval in seconds',
        type: 'number',
        default: 600,
        value: 600,
      },
    ],
    hosts: [
      { host: 'web-01.example.com', status: 'fail', actualValue: '900', expectedValue: '600', findingState: 'active' as const },
      { host: 'web-02.example.com', status: 'pass', actualValue: '600', expectedValue: '600', findingState: 'fixed' as const },
      { host: 'db-01.example.com', status: 'fail', actualValue: '0', expectedValue: '600', findingState: 'new' as const },
    ],
    passCount: 1,
    failCount: 2,
    naCount: 0,
    totalCount: 3,
    stateSummary: { new: 1, active: 1, fixed: 1, resurfaced: 0 },
    automationAvailable: true,
  },
  {
    ruleId: 'accounts_password_minlen',
    stigId: 'V-257856',
    title: 'Set Password Minimum Length',
    description: 'Passwords must be a minimum of 15 characters.',
    fixText: 'Set minlen = 15 in /etc/security/pwquality.conf',
    checkText: 'Verify the password minimum length in pwquality.conf.',
    severity: 'CAT_I',
    category: 'Accounts',
    disruption: 'low', aapImpact: 'safe' as const, aapImpactReason: '',
    parameters: [
      {
        name: 'minlen',
        label: 'Minimum Length',
        description: 'Minimum password length',
        type: 'number',
        default: 15,
        value: 15,
      },
    ],
    hosts: [
      { host: 'web-01.example.com', status: 'fail', actualValue: '8', expectedValue: '15', findingState: 'resurfaced' as const },
      { host: 'web-02.example.com', status: 'fail', actualValue: '8', expectedValue: '15', findingState: 'active' as const },
      { host: 'db-01.example.com', status: 'pass', actualValue: '15', expectedValue: '15', findingState: null },
    ],
    passCount: 1,
    failCount: 2,
    naCount: 0,
    totalCount: 3,
    stateSummary: { new: 0, active: 1, fixed: 0, resurfaced: 1 },
    automationAvailable: true,
  },
  {
    ruleId: 'sshd_disable_root_login',
    stigId: 'V-257850',
    title: 'Disable SSH Root Login',
    description: 'SSH root login must be disabled.',
    fixText: 'Set PermitRootLogin to no in /etc/ssh/sshd_config',
    checkText: 'Verify PermitRootLogin is set to no.',
    severity: 'CAT_I',
    category: 'SSH',
    disruption: 'low', aapImpact: 'safe' as const, aapImpactReason: '',
    parameters: [],
    hosts: [
      { host: 'web-01.example.com', status: 'pass', actualValue: 'no', expectedValue: 'no', findingState: null },
      { host: 'web-02.example.com', status: 'pass', actualValue: 'no', expectedValue: 'no', findingState: null },
      { host: 'db-01.example.com', status: 'pass', actualValue: 'no', expectedValue: 'no', findingState: null },
    ],
    passCount: 3,
    failCount: 0,
    naCount: 0,
    totalCount: 3,
    stateSummary: { new: 0, active: 0, fixed: 0, resurfaced: 0 },
  },
];

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  hostsScanned: 38,
  criticalFindings: 5,
  criticalFindingsDelta: -2,
  pendingRemediation: 12,
  pendingRemediationDelta: -4,
  activeProfiles: 3,
  recentScans: [
    {
      id: 'scan-1',
      profileName: 'RHEL 9 STIG V2R8',
      inventoryName: 'production-web-servers',
      passRate: 78,
      timestamp: '2026-04-28 14:30',
      status: 'completed',
      scanner: 'oscap',
    },
    {
      id: 'scan-2',
      profileName: 'CIS Benchmark L1',
      inventoryName: 'staging-db-servers',
      passRate: 92,
      timestamp: '2026-04-27 09:15',
      status: 'completed',
      scanner: 'oscap',
    },
    {
      id: 'scan-3',
      profileName: 'RHEL 9 STIG V2R8',
      inventoryName: 'production-web-servers',
      passRate: 0,
      timestamp: '2026-04-28 10:00',
      status: 'successful',
      scanner: 'remediation',
    },
  ],
  frameworkScores: [
    { profileId: 'rhel9-stig', name: 'DISA STIG V2R8', target: 'RHEL 9', rules: 366, rate: 78, passCount: 285, failCount: 81, lastScan: '2026-04-28', contributingScans: [{ scanId: 's1', inventoryId: 1, inventoryName: 'prod-servers', passRate: 78, passCount: 285, failCount: 81, ruleCount: 366, timestamp: '2026-04-28' }] },
    { profileId: 'rhel9-cis-l1', name: 'CIS Benchmark L1', target: 'RHEL 9', rules: 189, rate: 92, passCount: 174, failCount: 15, lastScan: '2026-04-27', contributingScans: [{ scanId: 's2', inventoryId: 2, inventoryName: 'staging-servers', passRate: 92, passCount: 174, failCount: 15, ruleCount: 189, timestamp: '2026-04-27' }] },
    { profileId: 'rhel9-pci-dss', name: 'PCI-DSS v4.0', target: 'RHEL 9', rules: 142, rate: 85, passCount: 121, failCount: 21, lastScan: '2026-04-25', contributingScans: [{ scanId: 's3', inventoryId: 1, inventoryName: 'prod-servers', passRate: 85, passCount: 121, failCount: 21, ruleCount: 142, timestamp: '2026-04-25' }] },
  ],
  postureStatus: [
    { profileId: 'rhel9-stig', name: 'DISA STIG V2R8', rate: 78, aboveTarget: false },
    { profileId: 'rhel9-cis-l1', name: 'CIS Benchmark L1', rate: 92, aboveTarget: true },
    { profileId: 'rhel9-pci-dss', name: 'PCI-DSS v4.0', rate: 85, aboveTarget: true },
  ],
  byInventory: [
    { inventoryId: 1, inventoryName: 'prod-servers', profileScores: [
      { profileId: 'rhel9-stig', name: 'DISA STIG V2R8', rate: 78, passCount: 285, failCount: 81 },
      { profileId: 'rhel9-pci-dss', name: 'PCI-DSS v4.0', rate: 85, passCount: 121, failCount: 21 },
    ] },
    { inventoryId: 2, inventoryName: 'staging-servers', profileScores: [
      { profileId: 'rhel9-cis-l1', name: 'CIS Benchmark L1', rate: 92, passCount: 174, failCount: 15 },
    ] },
  ],
};

export const MOCK_REGISTERED_PROFILES: ComplianceProfile[] = [
  {
    id: 'rhel9-stig',
    profileSlug: 'rhel9-stig',
    displayName: 'DISA STIG for RHEL 9',
    description: 'Defense Information Systems Agency STIG for RHEL 9',
    framework: 'DISA_STIG',
    version: 'V2R8',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: 10,
    remediateJtId: null,
    eeId: 1,
    remediationPlaybookPath: 'playbooks/rhel9-stig-remediate.yml',
    scanTags: 'stig,rhel9',
    certification: { status: 'certified' as const, authority: 'NIST SCAP 1.2', validationId: '', disclaimer: '' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
];

export const MOCK_INVENTORIES = [
  { id: 1, name: 'production-web-servers', hostCount: 24 },
  { id: 2, name: 'staging-db-servers', hostCount: 6 },
  { id: 3, name: 'dev-servers', hostCount: 8 },
];

export const MOCK_REMEDIATION_PROFILES: RemediationProfile[] = [
  {
    id: 'rp-1',
    name: 'prod-web-stig',
    description: 'Production web server STIG remediation',
    complianceProfileId: 'rhel9-stig',
    creationScanId: '42',
    targetInventory: 'production-web-servers',
    status: 'saved',
    selections: [
      { ruleId: 'sshd_set_idle_timeout', enabled: true, parameters: { interval: 600 } },
    ],
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
];

export const MOCK_SCANS: ComplianceScan[] = [
  {
    id: 'scan-1',
    profileId: 'rhel9-stig',
    inventoryId: 1,
    scanner: 'oscap',
    scanType: 'assessment',
    workflowJobId: 42,
    status: 'completed',
    startedAt: '2026-04-28T14:30:00Z',
    completedAt: '2026-04-28T14:45:00Z',
    errorDetails: null,
  },
];

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a mock ComplianceApi where every method is a jest.fn()
 * returning sensible defaults. Override individual mocks per test:
 *
 *   mockApi.getFindings.mockResolvedValue(customFindings);
 */
export function createMockComplianceApi(): jest.Mocked<ComplianceApi> {
  return {
    getHealth: jest.fn().mockResolvedValue({ status: 'ok', dataSource: 'mock', retentionDays: 90 }),
    updateSettings: jest.fn().mockResolvedValue({ retentionDays: 90 }),
    runCleanup: jest.fn().mockResolvedValue({ deleted: 0, retentionDays: 90 }),
    getProfiles: jest.fn().mockResolvedValue(MOCK_PROFILES),
    getInventories: jest.fn().mockResolvedValue(MOCK_INVENTORIES),
    getWorkflowTemplates: jest.fn().mockResolvedValue([
      { id: 10, name: 'compliance-stig-scan', description: 'STIG scan workflow' },
    ]),
    getScans: jest.fn().mockResolvedValue(MOCK_SCANS),
    getScan: jest.fn().mockResolvedValue(null),
    validateScan: jest.fn().mockResolvedValue({ valid: true, matchedHosts: [], mismatchedHosts: [], factsAvailable: true }),
    launchScan: jest.fn().mockResolvedValue({
      scanId: 'scan-new',
      workflowJobId: 100,
      status: 'pending',
    } as LaunchScanResponse),
    getFindings: jest.fn().mockResolvedValue(MOCK_FINDINGS),
    getFindingsPaginated: jest.fn().mockResolvedValue({ findings: MOCK_FINDINGS, total: MOCK_FINDINGS.length, limit: 100, offset: 0 }),
    getPreviousFindings: jest.fn().mockResolvedValue([]),
    getWorkflowStatus: jest.fn().mockResolvedValue({
      id: 42,
      status: 'successful',
      finished: '2026-04-28T14:45:00Z',
      failed: false,
      elapsed: 900,
      name: 'compliance-stig-scan',
    } as WorkflowJobStatus),
    getJobStatus: jest.fn().mockResolvedValue({
      id: 42,
      status: 'successful',
      finished: '2026-04-28T14:45:00Z',
      failed: false,
      elapsed: 30,
      name: 'compliance-remediate',
    } as WorkflowJobStatus),
    getWorkflowNodes: jest.fn().mockResolvedValue([
      {
        id: 1,
        summary_fields: { job: { id: 100, name: 'scan', status: 'successful', type: 'job' } },
        identifier: 'scan',
      },
    ] as WorkflowNode[]),
    getJobEvents: jest.fn().mockResolvedValue([] as JobEvent[]),
    launchRemediation: jest.fn().mockResolvedValue({
      remediationId: 'rem-1',
      workflowJobId: 200,
      status: 'pending',
    } as LaunchRemediationResponse),
    getDashboardStats: jest.fn().mockResolvedValue(MOCK_DASHBOARD_STATS),
    getContributingScans: jest.fn().mockResolvedValue([]),
    getPostureHistory: jest.fn().mockResolvedValue([] as PostureSnapshot[]),
    getRemediationEventsForTrend: jest.fn().mockResolvedValue([]),
    getHostPosture: jest.fn().mockResolvedValue({ hosts: [], scanId: '', scanTimestamp: '', profileId: '', inventoryId: 0 }),
    getHostFindings: jest.fn().mockResolvedValue({ hostname: '', scanId: '', profileId: '', findings: [], totalCount: 0 }),
    getRemediationProfiles: jest.fn().mockResolvedValue(MOCK_REMEDIATION_PROFILES),
    getRemediationProfile: jest.fn().mockResolvedValue(MOCK_REMEDIATION_PROFILES[0]),
    saveRemediationProfile: jest.fn().mockResolvedValue(MOCK_REMEDIATION_PROFILES[0]),
    deleteRemediationProfile: jest.fn().mockResolvedValue(undefined),
    updateRemediationProfileStatus: jest.fn().mockResolvedValue(MOCK_REMEDIATION_PROFILES[0]),
    getRemediationExecutions: jest.fn().mockResolvedValue([]),
    getRemediationExecution: jest.fn().mockResolvedValue(null),
    updateRemediationExecution: jest.fn().mockResolvedValue(null),
    getRegisteredProfiles: jest.fn().mockResolvedValue(MOCK_REGISTERED_PROFILES),
    getRegisteredProfile: jest.fn().mockResolvedValue(MOCK_REGISTERED_PROFILES[0]),
    saveRegisteredProfile: jest.fn().mockResolvedValue(MOCK_REGISTERED_PROFILES[0]),
    deleteRegisteredProfile: jest.fn().mockResolvedValue(undefined),
    disconnectProfile: jest.fn().mockResolvedValue(undefined),
    getProfileTabData: jest.fn().mockResolvedValue({ findings: [], summary: { totalPackages: 0, totalVulnerabilities: 0, totalScannedPackages: 0, totalVulnerablePackages: 0, fixable: 0, unfixable: 0, hostsAffected: 0, criticalHigh: 0 }, hostRisk: [] }),
    getJobTemplateDetail: jest.fn().mockResolvedValue({ id: 10, name: 'compliance-stig-scan', description: '', extra_vars: '{}' }),
    getControllerJobTemplates: jest.fn().mockResolvedValue([
      { id: 49, name: 'compliance-run-oscap', description: 'STIG assessment' },
      { id: 52, name: 'compliance-scan-cis-l1-rhel9', description: 'CIS L1 assessment' },
      { id: 54, name: 'compliance-scan-cis-l2-rhel9', description: 'CIS L2 assessment' },
    ]),
    getControllerWorkflowTemplates: jest.fn().mockResolvedValue([
      { id: 10, name: 'compliance-stig-scan', description: 'STIG scan workflow' },
    ]),
    getControllerExecutionEnvironments: jest.fn().mockResolvedValue([
      { id: 1, name: 'compliance-ee', image: 'registry.example.com/compliance-ee:latest' },
    ]),
    getAuthoritativeScan: jest.fn().mockResolvedValue(null),
    getBatchScanStats: jest.fn().mockResolvedValue({}  as Record<string, { pass: number; fail: number; rules: number; hosts: number; naCount: number; stateNew?: number; stateFixed?: number; stateResurfaced?: number }>),
    getNotApplicableRules: jest.fn().mockResolvedValue([]),
    getAllRecentExecutions: jest.fn().mockResolvedValue([]),
    getBaselineTargets: jest.fn().mockResolvedValue([]),
    pinBaselineTarget: jest.fn().mockResolvedValue({
      id: 'bt-1',
      remediationProfileId: 'rp-1',
      complianceProfileId: 'rhel9-stig',
      inventoryId: 1,
      pinnedAt: '2026-06-04T00:00:00Z',
      pinnedBy: null,
    } as BaselineTarget),
    unpinBaselineTarget: jest.fn().mockResolvedValue(undefined),
    getRemediationErrorDetails: jest.fn().mockResolvedValue(null),
    getBaselineScores: jest.fn().mockResolvedValue([]),
    getChain: jest.fn().mockResolvedValue({
      execution: {
        id: 'exec-1',
        remediationProfileId: 'rp-1',
        inventoryId: 1,
        informingScanId: 'scan-1',
        primaryJobId: 100,
        allJobIds: [100],
        status: 'succeeded',
        startedAt: '2026-06-01T20:00:00Z',
        completedAt: '2026-06-01T20:04:00Z',
        elapsedSeconds: 240,
        rulesApplied: 3,
        rulesFailed: 0,
        hostsTargeted: 10,
        hostsSucceeded: 10,
        hostsFailed: 0,
        planSummary: null,
        verificationScanId: null,
        createdBy: 'admin',
      },
      assessmentScan: null,
      assessmentStats: null,
      verificationScan: null,
      verificationStats: null,
      delta: null,
    }),
    getArtifacts: jest.fn().mockResolvedValue([]),
    downloadArtifact: jest.fn().mockResolvedValue(undefined),
  };
}
