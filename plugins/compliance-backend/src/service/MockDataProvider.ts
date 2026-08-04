/**
 * Mock data provider for demo / offline mode.
 *
 * Returns the same data shapes the frontend already expects,
 * so switching from mock to live is transparent.
 */
import type {
  ComplianceProfile,
  FindingState,
  FindingStateSummary,
  MultiHostFinding,
  DashboardStats,
  LaunchScanResponse,
  LaunchRemediationResponse,
  PostureSnapshot,
  RemediationProfile,
} from '@ansible/backstage-compliance-common';

// ─── Built-in profiles ────────────────────────────────────────────────

const BUILTIN_PROFILES: ComplianceProfile[] = [
  {
    id: 'rhel9-stig',
    profileSlug: 'rhel9-stig',
    displayName: 'DISA STIG for RHEL 9',
    framework: 'DISA_STIG',
    version: 'V2R8',
    description:
      'Security Technical Implementation Guide for Red Hat Enterprise Linux 9, based on DISA STIG V2R8.',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: '',
    scanTags: '',
    certification: {
      status: 'certified' as const,
      authority: 'NIST SCAP 1.2',
      validationId: '',
      disclaimer: 'OpenSCAP is NIST SCAP 1.2 validated.',
    },
    ruleCount: 366,
    displayConfig: {
      gauge_label: 'compliance rate',
      gauge_unit: 'rules',
      score_formula: 'compliance_rate' as const,
      remediation_verb: 'Remediate',
      severity_map: { CAT_I: 'High', CAT_II: 'Medium', CAT_III: 'Low' },
      columns: [
        { field: 'stig_id', label: 'STIG ID' },
        { field: 'title', label: 'Rule' },
        { field: 'severity', label: 'Severity' },
        { field: 'status', label: 'Status' },
        { field: 'fix_text', label: 'Fix' },
      ],
    },
    createdAt: '2025-10-25T00:00:00Z',
    updatedAt: '2025-10-25T00:00:00Z',
  },
  {
    id: 'rhel9-cis-l1',
    profileSlug: 'rhel9-cis-l1',
    displayName: 'CIS Benchmark RHEL 9 — Level 1 Server',
    framework: 'CIS',
    version: '1.0.0',
    description: 'CIS Benchmark Level 1 for RHEL 9 servers.',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: '',
    scanTags: '',
    certification: {
      status: 'conformant' as const,
      authority: 'CIS',
      validationId: '',
      disclaimer:
        'OpenSCAP uses CIS Benchmark content from scap-security-guide.',
    },
    ruleCount: 189,
    displayConfig: {
      gauge_label: 'compliance rate',
      gauge_unit: 'rules',
      score_formula: 'compliance_rate' as const,
      remediation_verb: 'Remediate',
      severity_map: { CAT_I: 'High', CAT_II: 'Medium', CAT_III: 'Low' },
      columns: [
        { field: 'stig_id', label: 'CIS Control' },
        { field: 'title', label: 'Rule' },
        { field: 'severity', label: 'Severity' },
        { field: 'status', label: 'Status' },
        { field: 'fix_text', label: 'Fix' },
      ],
    },
    createdAt: '2025-06-15T00:00:00Z',
    updatedAt: '2025-06-15T00:00:00Z',
  },
  {
    id: 'rhel9-pci-dss',
    profileSlug: 'rhel9-pci-dss',
    displayName: 'PCI-DSS v4.0 for RHEL 9',
    framework: 'PCI_DSS',
    version: '4.0',
    description:
      'Payment Card Industry Data Security Standard v4.0 controls mapped to RHEL 9.',
    platform: 'RHEL 9',
    platformSpec: null,
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: '',
    scanTags: '',
    certification: {
      status: 'uncertified' as const,
      authority: '',
      validationId: '',
      disclaimer: '',
    },
    ruleCount: 142,
    displayConfig: {
      gauge_label: 'compliance rate',
      gauge_unit: 'rules',
      score_formula: 'compliance_rate' as const,
      remediation_verb: 'Remediate',
      severity_map: { CAT_I: 'High', CAT_II: 'Medium', CAT_III: 'Low' },
      columns: [
        { field: 'stig_id', label: 'STIG ID' },
        { field: 'title', label: 'Rule' },
        { field: 'severity', label: 'Severity' },
        { field: 'status', label: 'Status' },
        { field: 'fix_text', label: 'Fix' },
      ],
    },
    createdAt: '2025-03-20T00:00:00Z',
    updatedAt: '2025-03-20T00:00:00Z',
  },
  {
    id: 'supply-chain-vuln',
    profileSlug: 'supply-chain-vuln',
    displayName: 'Supply Chain Vulnerability Scan',
    framework: 'SUPPLY_CHAIN',
    version: '1.0.0',
    description:
      'Syft/Grype SBOM vulnerability scanning for OS packages and language dependencies.',
    platform: 'Linux (multi-distro)',
    platformSpec: { os_family: ['RedHat', 'Debian'], os_version: [] },
    workflowTemplateId: null,
    remediateJtId: null,
    eeId: null,
    remediationPlaybookPath: 'playbooks/remediate.yml',
    scanTags: '',
    certification: {
      status: 'uncertified' as const,
      authority: 'N/A',
      validationId: '',
      disclaimer: 'Syft and Grype are open-source tools from Anchore.',
    },
    ruleCount: 847,
    displayConfig: {
      gauge_label: 'vulnerability-free rate',
      gauge_unit: 'packages',
      remediation_verb: 'Patch',
      severity_map: {
        CAT_I: 'Critical / High',
        CAT_II: 'Medium',
        CAT_III: 'Low',
      },
      columns: [
        { field: 'rule_id', label: 'CVE' },
        { field: 'title', label: 'Package' },
        { field: 'severity', label: 'CVSS Severity' },
        { field: 'status', label: 'Status' },
        { field: 'fix_text', label: 'Remediation' },
      ],
      tab: {
        label: 'Supply Chain',
        icon: 'security',
        layout: [
          {
            widget: 'summary_card' as const,
            title: 'SBOM Coverage',
            metric: 'vulnerability_free_rate',
            unit: 'packages',
          },
          {
            widget: 'severity_breakdown' as const,
            group_by: 'severity',
            labels: {
              CAT_I: 'Critical / High',
              CAT_II: 'Medium',
              CAT_III: 'Low',
            },
          },
          {
            widget: 'findings_table' as const,
            columns: [
              { field: 'rule_id', label: 'CVE' },
              { field: 'title', label: 'Package' },
              { field: 'severity', label: 'Severity' },
              { field: 'fix_text', label: 'Fix' },
            ],
          },
          {
            widget: 'host_breakdown' as const,
            title: 'Hosts by Vulnerability Count',
          },
        ],
      },
    },
    connectionStatus: 'connected' as const,
    createdAt: '2026-06-25T00:00:00Z',
    updatedAt: '2026-06-25T00:00:00Z',
  },
];

// ─── Mock hosts and helper builders ───────────────────────────────────

const HOSTS = [
  'web-prod-01',
  'web-prod-02',
  'web-prod-03',
  'web-prod-04',
  'web-prod-05',
  'web-prod-06',
  'web-prod-07',
  'web-prod-08',
  'web-prod-09',
  'web-prod-10',
  'db-prod-01',
  'db-prod-02',
  'db-prod-03',
  'db-prod-04',
  'app-prod-01',
  'app-prod-02',
  'app-prod-03',
  'app-prod-04',
  'app-prod-05',
  'app-prod-06',
];

type HostFinding = {
  host: string;
  status: 'pass' | 'fail' | 'error';
  actualValue: string;
  expectedValue: string;
  findingState?: FindingState | null;
};

const allPass = (expected: string): HostFinding[] =>
  HOSTS.map(h => ({
    host: h,
    status: 'pass' as const,
    actualValue: expected,
    expectedValue: expected,
    findingState: null,
  }));

const mostPassSomeFail = (
  expected: string,
  failHosts: string[],
  failValues: Record<string, string>,
  stateOverride?: FindingState,
): HostFinding[] =>
  HOSTS.map(h => ({
    host: h,
    status: failHosts.includes(h) ? ('fail' as const) : ('pass' as const),
    actualValue: failHosts.includes(h) ? failValues[h] || 'not set' : expected,
    expectedValue: expected,
    findingState: failHosts.includes(h) ? stateOverride ?? 'active' : null,
  }));

const allFail = (
  expected: string,
  actualFn: (h: string) => string,
  stateOverride?: FindingState,
): HostFinding[] =>
  HOSTS.map(h => ({
    host: h,
    status: 'fail' as const,
    actualValue: actualFn(h),
    expectedValue: expected,
    findingState: stateOverride ?? 'active',
  }));

function computeStateSummary(hosts: HostFinding[]): FindingStateSummary {
  const summary: FindingStateSummary = {
    new: 0,
    active: 0,
    fixed: 0,
    resurfaced: 0,
  };
  for (const h of hosts) {
    if (h.findingState === 'new') summary.new++;
    else if (h.findingState === 'active') summary.active++;
    else if (h.findingState === 'fixed') summary.fixed++;
    else if (h.findingState === 'resurfaced') summary.resurfaced++;
  }
  return summary;
}

// ─── Mock findings ────────────────────────────────────────────────────

const MOCK_FINDINGS: MultiHostFinding[] = [
  {
    ruleId: 'sshd_set_idle_timeout',
    stigId: 'V-257844',
    title: 'Set SSH Client Alive Interval',
    description:
      'RHEL 9 must terminate SSH sessions after 10 minutes of inactivity.',
    fixText: 'Set ClientAliveInterval to 600 in /etc/ssh/sshd_config.',
    checkText:
      'Verify the SSH daemon is configured to terminate idle sessions.',
    severity: 'CAT_I' as const,
    category: 'Access Control',
    disruption: 'low' as const,
    parameters: [
      {
        name: 'var_sshd_set_keepalive',
        label: 'Client Alive Interval (seconds)',
        description: 'SSH client alive interval',
        type: 'number' as const,
        default: 600,
        value: 600,
      },
    ],
    hosts: mostPassSomeFail(
      '600',
      ['db-prod-03', 'app-prod-05'],
      { 'db-prod-03': '300', 'app-prod-05': 'not set' },
      'resurfaced',
    ),
    passCount: 18,
    failCount: 2,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'sshd_disable_root_login',
    stigId: 'V-257846',
    title: 'Disable SSH Root Login',
    description: 'RHEL 9 must prohibit direct root login via SSH.',
    fixText: 'Set PermitRootLogin to no in /etc/ssh/sshd_config.',
    checkText: 'Verify SSH prohibits direct root login.',
    severity: 'CAT_I' as const,
    category: 'Access Control',
    disruption: 'low' as const,
    parameters: [],
    hosts: mostPassSomeFail(
      'no',
      ['web-prod-03', 'db-prod-01', 'db-prod-02', 'db-prod-03', 'db-prod-04'],
      {
        'web-prod-03': 'yes',
        'db-prod-01': 'yes',
        'db-prod-02': 'yes',
        'db-prod-03': 'yes',
        'db-prod-04': 'yes',
      },
      'active',
    ),
    passCount: 15,
    failCount: 5,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'enable_fips_mode',
    stigId: 'V-257777',
    title: 'Enable FIPS 140-3 Mode',
    description: 'RHEL 9 must implement NIST FIPS-validated cryptography.',
    fixText: 'Enable FIPS mode: fips-mode-setup --enable',
    checkText: 'Verify the system is in FIPS mode.',
    severity: 'CAT_I' as const,
    category: 'System and Communications Protection',
    disruption: 'high' as const,
    parameters: [],
    hosts: allFail('FIPS', () => 'DEFAULT', 'new'),
    passCount: 0,
    failCount: 20,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'accounts_tmout',
    stigId: 'V-257893',
    title: 'Set Account Session Timeout',
    description:
      'RHEL 9 must terminate user sessions after 15 minutes of inactivity.',
    fixText: 'Configure TMOUT in /etc/profile.d/ to 900 seconds.',
    checkText: 'Verify TMOUT is set.',
    severity: 'CAT_II' as const,
    category: 'Access Control',
    disruption: 'low' as const,
    parameters: [
      {
        name: 'var_accounts_tmout',
        label: 'Timeout (seconds)',
        description: 'Session inactivity timeout',
        type: 'number' as const,
        default: 900,
        value: 900,
      },
    ],
    hosts: mostPassSomeFail('900', ['web-prod-09', 'app-prod-06'], {
      'web-prod-09': '1800',
      'app-prod-06': 'not set',
    }),
    passCount: 18,
    failCount: 2,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'package_aide_installed',
    stigId: 'V-257780',
    title: 'Install AIDE',
    description: 'RHEL 9 must install AIDE for file integrity monitoring.',
    fixText: 'Install AIDE: dnf install aide',
    checkText: 'Verify AIDE is installed.',
    severity: 'CAT_II' as const,
    category: 'System and Information Integrity',
    disruption: 'low' as const,
    parameters: [],
    hosts: mostPassSomeFail(
      'installed',
      [
        'web-prod-04',
        'web-prod-05',
        'web-prod-06',
        'db-prod-03',
        'db-prod-04',
        'app-prod-01',
        'app-prod-02',
      ],
      Object.fromEntries(
        [
          'web-prod-04',
          'web-prod-05',
          'web-prod-06',
          'db-prod-03',
          'db-prod-04',
          'app-prod-01',
          'app-prod-02',
        ].map(h => [h, 'not installed']),
      ),
      'new',
    ),
    passCount: 13,
    failCount: 7,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'service_auditd_enabled',
    stigId: 'V-257783',
    title: 'Enable auditd Service',
    description: 'RHEL 9 audit daemon must be enabled and running.',
    fixText: 'Enable auditd: systemctl enable --now auditd',
    checkText: 'Verify auditd is enabled and running.',
    severity: 'CAT_II' as const,
    category: 'Audit and Accountability',
    disruption: 'low' as const,
    parameters: [],
    hosts: HOSTS.map(h => ({
      host: h,
      status: 'pass' as const,
      actualValue: 'enabled',
      expectedValue: 'enabled',
      findingState: ['web-prod-03', 'db-prod-01', 'db-prod-02'].includes(h)
        ? ('fixed' as const)
        : null,
    })),
    passCount: 20,
    failCount: 0,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'grub2_password',
    stigId: 'V-257785',
    title: 'Set GRUB2 Boot Loader Password',
    description: 'RHEL 9 must require a boot loader password.',
    fixText: 'Set GRUB2 password using grub2-setpassword.',
    checkText: 'Verify GRUB2 is password-protected.',
    severity: 'CAT_I' as const,
    category: 'Configuration Management',
    disruption: 'medium' as const,
    parameters: [],
    hosts: mostPassSomeFail('set', ['web-prod-01', 'app-prod-03'], {
      'web-prod-01': 'not set',
      'app-prod-03': 'not set',
    }),
    passCount: 18,
    failCount: 2,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'selinux_enforcing',
    stigId: 'V-257786',
    title: 'SELinux Must Be Enforcing',
    description: 'RHEL 9 must have SELinux in enforcing mode.',
    fixText: 'Set SELinux to enforcing and reboot.',
    checkText: 'Verify SELinux is enforcing.',
    severity: 'CAT_I' as const,
    category: 'Access Control',
    disruption: 'high' as const,
    parameters: [],
    hosts: allPass('Enforcing'),
    passCount: 20,
    failCount: 0,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'configure_crypto_policy',
    stigId: 'V-257778',
    title: 'Configure System Cryptography Policy',
    description:
      'System cryptography policy must satisfy security requirements.',
    fixText: 'Run update-crypto-policies --set FIPS.',
    checkText: 'Verify system-wide crypto policy.',
    severity: 'CAT_II' as const,
    category: 'System and Communications Protection',
    disruption: 'medium' as const,
    parameters: [
      {
        name: 'var_system_crypto_policy',
        label: 'Crypto Policy',
        description: 'System-wide cryptographic policy',
        type: 'select' as const,
        default: 'FIPS',
        value: 'FIPS',
        options: [
          { label: 'DEFAULT', value: 'DEFAULT' },
          { label: 'FIPS', value: 'FIPS' },
          { label: 'FIPS:OSPP', value: 'FIPS:OSPP' },
        ],
      },
    ],
    hosts: allFail('FIPS', () => 'DEFAULT'),
    passCount: 0,
    failCount: 20,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'passwd_permissions',
    stigId: 'V-257820',
    title: 'Verify /etc/passwd Permissions',
    description: '/etc/passwd must have permissions 0644 or more restrictive.',
    fixText: 'Set permissions: chmod 0644 /etc/passwd',
    checkText: 'Verify /etc/passwd permissions.',
    severity: 'CAT_II' as const,
    category: 'Configuration Management',
    disruption: 'low' as const,
    parameters: [],
    hosts: mostPassSomeFail('0644', ['app-prod-04'], { 'app-prod-04': '0666' }),
    passCount: 19,
    failCount: 1,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'package_telnet_not_installed',
    stigId: 'V-257835',
    title: 'Remove telnet Package',
    description: 'telnet must not be installed.',
    fixText: 'Remove telnet: dnf remove telnet',
    checkText: 'Verify telnet is not installed.',
    severity: 'CAT_I' as const,
    category: 'Configuration Management',
    disruption: 'low' as const,
    parameters: [],
    hosts: mostPassSomeFail('not installed', ['db-prod-02'], {
      'db-prod-02': 'installed',
    }),
    passCount: 19,
    failCount: 1,
    naCount: 0,
    totalCount: 20,
  },
  {
    ruleId: 'banner_etc_issue',
    stigId: 'V-257795',
    title: 'Configure Login Banner',
    description: 'RHEL 9 must display the DoD consent banner before login.',
    fixText: 'Configure the consent banner in /etc/issue.',
    checkText: 'Verify login banner contains required text.',
    severity: 'CAT_II' as const,
    category: 'Access Control',
    disruption: 'low' as const,
    parameters: [
      {
        name: 'login_banner_text',
        label: 'Banner Text',
        description: 'Text to display',
        type: 'string' as const,
        default: 'You are accessing a U.S. Government Information System...',
        value: 'You are accessing a U.S. Government Information System...',
      },
    ],
    hosts: allFail('DoD banner configured', () => 'no banner'),
    passCount: 0,
    failCount: 20,
    naCount: 0,
    totalCount: 20,
  },
].map(f => {
  const AAP_IMPACT_MAP: Record<
    string,
    {
      aapImpact: 'safe' | 'caution' | 'breaks-connectivity';
      aapImpactReason: string;
    }
  > = {
    sshd_set_idle_timeout: {
      aapImpact: 'caution',
      aapImpactReason: 'SSH daemon must accept connections from Controller',
    },
    sshd_disable_root_login: {
      aapImpact: 'caution',
      aapImpactReason: 'SSH daemon must accept connections from Controller',
    },
    enable_fips_mode: {
      aapImpact: 'breaks-connectivity',
      aapImpactReason:
        'FIPS mode restricts ciphers — verify Controller SSH compatibility',
    },
    configure_crypto_policy: {
      aapImpact: 'caution',
      aapImpactReason:
        'Crypto policies must allow SSH ciphers compatible with Controller',
    },
    selinux_enforcing: {
      aapImpact: 'caution',
      aapImpactReason: 'SELinux must allow SSH and network access',
    },
  };
  const impact = AAP_IMPACT_MAP[f.ruleId] ?? {
    aapImpact: 'safe' as const,
    aapImpactReason: '',
  };
  return { ...f, ...impact, stateSummary: computeStateSummary(f.hosts) };
});

// ─── Mock inventories ─────────────────────────────────────────────────

const MOCK_INVENTORIES = [
  { id: 1, name: 'production-web-servers', total_hosts: 24 },
  { id: 2, name: 'staging-db-servers', total_hosts: 6 },
  { id: 3, name: 'dev-servers', total_hosts: 8 },
  { id: 4, name: 'all-rhel9-hosts', total_hosts: 38 },
];

// ─── Mock workflow templates ──────────────────────────────────────────

const MOCK_WORKFLOW_TEMPLATES = [
  {
    id: 101,
    name: 'compliance-scan-stig',
    description: 'STIG compliance scan workflow',
  },
  {
    id: 102,
    name: 'compliance-scan-cis',
    description: 'CIS benchmark scan workflow',
  },
  {
    id: 103,
    name: 'compliance-remediate',
    description: 'Remediation workflow',
  },
];

// ─── Mock execution environments ─────────────────────────────────────

const MOCK_EXECUTION_ENVIRONMENTS = [
  {
    id: 1,
    name: 'compliance-ee-rhel9',
    image: 'registry.example.com/compliance-ee-rhel9:latest',
  },
  {
    id: 2,
    name: 'ee-minimal-rhel9',
    image:
      'registry.redhat.io/ansible-automation-platform-26/ee-minimal-rhel9:latest',
  },
  {
    id: 3,
    name: 'ee-supported-rhel9',
    image:
      'registry.redhat.io/ansible-automation-platform-26/ee-supported-rhel9:latest',
  },
];

// ─── Mock remediations (saved rule selections) ───────────────────────

let mockRemediationProfiles: RemediationProfile[] = [];

// ─── Provider class ───────────────────────────────────────────────────

export class MockDataProvider {
  private static jobCounter = 100;

  static getProfiles(): ComplianceProfile[] {
    return BUILTIN_PROFILES;
  }

  static getFindings(): MultiHostFinding[] {
    return MOCK_FINDINGS;
  }

  static getInventories(): Array<{
    id: number;
    name: string;
    total_hosts: number;
  }> {
    return MOCK_INVENTORIES;
  }

  static getExecutionEnvironments(): Array<{
    id: number;
    name: string;
    image: string;
  }> {
    return MOCK_EXECUTION_ENVIRONMENTS;
  }

  static getWorkflowTemplates(
    nameFilter?: string,
  ): Array<{ id: number; name: string; description: string }> {
    if (!nameFilter) return MOCK_WORKFLOW_TEMPLATES;
    const lowerFilter = nameFilter.toLowerCase();
    return MOCK_WORKFLOW_TEMPLATES.filter(t =>
      t.name.toLowerCase().includes(lowerFilter),
    );
  }

  static launchScan(_profileId: string): LaunchScanResponse {
    MockDataProvider.jobCounter += 1;
    return {
      scanId: `mock-scan-${MockDataProvider.jobCounter}`,
      workflowJobId: MockDataProvider.jobCounter,
      status: 'pending',
    };
  }

  static launchRemediation(): LaunchRemediationResponse {
    MockDataProvider.jobCounter += 1;
    return {
      remediationId: `mock-remediation-${MockDataProvider.jobCounter}`,
      workflowJobId: MockDataProvider.jobCounter,
      status: 'pending',
      executionId: `mock-execution-${MockDataProvider.jobCounter}`,
    };
  }

  static getDashboardStats(): DashboardStats {
    return {
      hostsScanned: 12,
      criticalFindings: 8,
      criticalFindingsDelta: -3,
      pendingRemediation: 15,
      pendingRemediationDelta: -5,
      activeProfiles: 4,
      recentScans: [
        {
          id: '1',
          profileName: 'RHEL 9 STIG V2R8',
          inventoryName: 'production-web-servers',
          passRate: 78,
          timestamp: '2 hours ago',
          status: 'completed',
          scanType: 'assessment',
          scanner: 'oscap',
        },
        {
          id: '2',
          profileName: 'CIS RHEL 9 L1',
          inventoryName: 'staging-db-servers',
          passRate: 85,
          timestamp: '1 day ago',
          status: 'completed',
          scanType: 'assessment',
          scanner: 'oscap',
        },
        {
          id: '3',
          profileName: 'RHEL 9 STIG V2R8',
          inventoryName: 'production-web-servers',
          passRate: 0,
          timestamp: '12 hours ago',
          status: 'successful',
          scanner: 'remediation',
        },
        {
          id: '4',
          profileName: 'RHEL 9 STIG V2R8',
          inventoryName: 'dev-servers',
          passRate: 62,
          timestamp: '3 days ago',
          status: 'completed',
          scanType: 'assessment',
          scanner: 'oscap',
        },
        {
          id: '5',
          profileName: 'Supply Chain Vulnerability Scan',
          inventoryName: 'production-web-servers',
          passRate: 94,
          timestamp: '4 hours ago',
          status: 'completed',
          scanType: 'assessment',
          scanner: 'syft-grype',
        },
      ],
      frameworkScores: [
        {
          profileId: 'rhel9-stig',
          name: 'DISA STIG V2R8',
          target: 'RHEL 9',
          rules: 366,
          rate: 78,
          passCount: 285,
          failCount: 81,
          lastScan: '2 hours ago',
          contributingScans: [
            {
              scanId: 's1',
              inventoryId: 1,
              inventoryName: 'production-web-servers',
              passRate: 78,
              passCount: 285,
              failCount: 81,
              ruleCount: 366,
              timestamp: '2 hours ago',
            },
            {
              scanId: 's4',
              inventoryId: 3,
              inventoryName: 'dev-servers',
              passRate: 62,
              passCount: 227,
              failCount: 139,
              ruleCount: 366,
              timestamp: '3 days ago',
            },
          ],
          baseline: {
            rate: 92.5,
            passCount: 185,
            ruleCount: 200,
            inventoryCount: 1,
          },
        },
        {
          profileId: 'rhel9-cis-l1',
          name: 'CIS Benchmark L1',
          target: 'RHEL 9',
          rules: 189,
          rate: 85,
          passCount: 160,
          failCount: 29,
          lastScan: '1 day ago',
          contributingScans: [
            {
              scanId: 's2',
              inventoryId: 2,
              inventoryName: 'staging-db-servers',
              passRate: 85,
              passCount: 160,
              failCount: 29,
              ruleCount: 189,
              timestamp: '1 day ago',
            },
          ],
        },
        {
          profileId: 'rhel9-pci-dss',
          name: 'PCI-DSS v4.0',
          target: 'RHEL 9',
          rules: 142,
          rate: 62,
          passCount: 88,
          failCount: 54,
          lastScan: '3 days ago',
          contributingScans: [
            {
              scanId: 's5',
              inventoryId: 1,
              inventoryName: 'production-web-servers',
              passRate: 62,
              passCount: 88,
              failCount: 54,
              ruleCount: 142,
              timestamp: '3 days ago',
            },
          ],
        },
        {
          profileId: 'supply-chain-vuln',
          name: 'Supply Chain',
          target: 'Linux',
          rules: 847,
          rate: 94,
          passCount: 797,
          failCount: 50,
          lastScan: '4 hours ago',
          contributingScans: [
            {
              scanId: 's6',
              inventoryId: 1,
              inventoryName: 'production-web-servers',
              passRate: 94,
              passCount: 797,
              failCount: 50,
              ruleCount: 847,
              timestamp: '4 hours ago',
            },
          ],
        },
      ],
      postureStatus: [
        {
          profileId: 'rhel9-stig',
          name: 'DISA STIG V2R8',
          rate: 78,
          aboveTarget: false,
        },
        {
          profileId: 'rhel9-cis-l1',
          name: 'CIS Benchmark L1',
          rate: 85,
          aboveTarget: true,
        },
        {
          profileId: 'rhel9-pci-dss',
          name: 'PCI-DSS v4.0',
          rate: 62,
          aboveTarget: false,
        },
        {
          profileId: 'supply-chain-vuln',
          name: 'Supply Chain',
          rate: 94,
          aboveTarget: true,
        },
      ],
      byInventory: [
        {
          inventoryId: 1,
          inventoryName: 'production-web-servers',
          profileScores: [
            {
              profileId: 'rhel9-stig',
              name: 'DISA STIG V2R8',
              rate: 78,
              passCount: 285,
              failCount: 81,
              baseline: {
                remediationProfileId: 'mock-rp-1',
                remediationProfileName: 'STIG Baseline — Phase 1',
                rate: 92.5,
                passCount: 185,
                ruleCount: 200,
                pinnedAt: '2026-05-15T00:00:00Z',
              },
            },
            {
              profileId: 'rhel9-pci-dss',
              name: 'PCI-DSS v4.0',
              rate: 62,
              passCount: 88,
              failCount: 54,
            },
          ],
        },
        {
          inventoryId: 2,
          inventoryName: 'staging-db-servers',
          profileScores: [
            {
              profileId: 'rhel9-cis-l1',
              name: 'CIS Benchmark L1',
              rate: 85,
              passCount: 160,
              failCount: 29,
            },
          ],
        },
        {
          inventoryId: 3,
          inventoryName: 'dev-servers',
          profileScores: [
            {
              profileId: 'rhel9-stig',
              name: 'DISA STIG V2R8',
              rate: 62,
              passCount: 227,
              failCount: 139,
            },
          ],
        },
      ],
    };
  }

  static getPostureHistory(
    _profileId?: string,
    _days?: number,
  ): PostureSnapshot[] {
    const now = Date.now();
    const day = 86_400_000;
    return [
      {
        id: '1',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t1',
        timestamp: new Date(now - 30 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 165,
        failCount: 201,
        compliancePct: 45,
      },
      {
        id: '2',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t2',
        timestamp: new Date(now - 27 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 176,
        failCount: 190,
        compliancePct: 48,
      },
      {
        id: '3',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t3',
        timestamp: new Date(now - 24 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 190,
        failCount: 176,
        compliancePct: 52,
      },
      {
        id: '4',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t4',
        timestamp: new Date(now - 21 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 201,
        failCount: 165,
        compliancePct: 55,
      },
      {
        id: '5',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t5',
        timestamp: new Date(now - 18 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 216,
        failCount: 150,
        compliancePct: 59,
      },
      {
        id: '6',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t6',
        timestamp: new Date(now - 14 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 227,
        failCount: 139,
        compliancePct: 62,
      },
      {
        id: '7',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t7',
        timestamp: new Date(now - 10 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 238,
        failCount: 128,
        compliancePct: 65,
      },
      {
        id: '8',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t8',
        timestamp: new Date(now - 7 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 249,
        failCount: 117,
        compliancePct: 68,
      },
      {
        id: '9',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t9',
        timestamp: new Date(now - 3 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 256,
        failCount: 110,
        compliancePct: 70,
      },
      {
        id: '10',
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanId: 's-t10',
        timestamp: new Date(now - 1 * day).toISOString(),
        totalHosts: 20,
        totalRules: 366,
        passCount: 264,
        failCount: 102,
        compliancePct: 72,
      },
    ];
  }

  static getRemediationProfiles(): RemediationProfile[] {
    return mockRemediationProfiles;
  }

  static saveRemediationProfile(
    profile: RemediationProfile,
  ): RemediationProfile {
    const saved = { ...profile, id: `mock-rp-${Date.now()}` };
    mockRemediationProfiles = [...mockRemediationProfiles, saved];
    return saved;
  }

  static deleteRemediationProfile(id: string): boolean {
    const before = mockRemediationProfiles.length;
    mockRemediationProfiles = mockRemediationProfiles.filter(p => p.id !== id);
    return mockRemediationProfiles.length < before;
  }

  static getHostPosture(
    _inventoryId: number,
    profileId: string,
  ): import('@ansible/backstage-compliance-common').HostPostureResponse {
    const rand = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    };
    const r = rand(42);
    const hosts: import('@ansible/backstage-compliance-common').HostPosture[] =
      [];
    const count = 250;
    for (let i = 0; i < count; i++) {
      const v = r();
      let pct: number;
      if (v < 0.06) {
        pct = 20 + r() * 35;
      } else if (v < 0.18) {
        pct = 72 + r() * 13;
      } else {
        pct = 89 + r() * 9;
      }
      pct = Math.round(pct * 10) / 10;
      const total = 366;
      const pass = Math.round((total * pct) / 100);
      const fail = total - pass;
      let catI: number;
      if (pct < 60) {
        catI = Math.floor(r() * 8) + 2;
      } else if (r() < 0.15) {
        catI = 1;
      } else {
        catI = 0;
      }
      let os: string;
      if (r() < 0.85) {
        os = 'RHEL 9.4';
      } else if (r() < 0.5) {
        os = 'RHEL 8.9';
      } else {
        os = 'RHEL 9.2';
      }
      hosts.push({
        hostname: `prod-rhel-${String(i + 1).padStart(3, '0')}`,
        os,
        compliancePct: pct,
        passCount: pass,
        failCount: fail,
        naCount: 0,
        catIFail: catI,
        catIIFail: Math.round(fail * 0.65),
        catIIIFail: fail - Math.round(fail * 0.65) - catI,
      });
    }
    return {
      hosts,
      scanId: 'mock-scan-1',
      scanTimestamp: new Date().toISOString(),
      scanType: 'assessment',
      profileId,
      inventoryId: _inventoryId,
    };
  }

  static getHostFindings(
    _inventoryId: number,
    hostname: string,
    profileId: string,
  ): import('@ansible/backstage-compliance-common').HostFindingsResponse {
    const findings: import('@ansible/backstage-compliance-common').HostFindingSummary[] =
      [
        {
          ruleId: 'xccdf_stig_sshd_idle_timeout',
          stigId: 'RHEL-09-255040',
          title:
            'RHEL 9 must be configured so that all network connections associated with SSH traffic are terminated at the end of the session',
          severity: 'CAT_I',
          status: 'fail',
          findingState: 'active',
        },
        {
          ruleId: 'xccdf_stig_no_empty_passwords',
          stigId: 'RHEL-09-611090',
          title:
            'RHEL 9 must not allow accounts configured with blank or null passwords',
          severity: 'CAT_I',
          status: 'fail',
          findingState: 'new',
        },
        {
          ruleId: 'xccdf_stig_audit_rules',
          stigId: 'RHEL-09-654010',
          title:
            'RHEL 9 audit system must be configured to audit all uses of setuid programs',
          severity: 'CAT_II',
          status: 'fail',
          findingState: 'active',
        },
        {
          ruleId: 'xccdf_stig_firewalld',
          stigId: 'RHEL-09-251010',
          title: 'RHEL 9 must have the firewalld package installed',
          severity: 'CAT_II',
          status: 'pass',
          findingState: null,
        },
        {
          ruleId: 'xccdf_stig_crypto_policy',
          stigId: 'RHEL-09-672010',
          title:
            'RHEL 9 must implement DOD-approved encryption in the OpenSSL package',
          severity: 'CAT_II',
          status: 'fail',
          findingState: 'resurfaced',
        },
        {
          ruleId: 'xccdf_stig_banner_motd',
          stigId: 'RHEL-09-271040',
          title:
            'RHEL 9 must display the Standard Mandatory DOD Notice and Consent Banner before granting local or remote access',
          severity: 'CAT_III',
          status: 'fail',
          findingState: 'active',
        },
        {
          ruleId: 'xccdf_stig_chrony_conf',
          stigId: 'RHEL-09-252010',
          title:
            'RHEL 9 must securely compare internal information system clocks',
          severity: 'CAT_III',
          status: 'pass',
          findingState: null,
        },
      ];
    return {
      hostname,
      scanId: 'mock-scan-1',
      profileId,
      findings,
      totalCount: findings.length,
    };
  }
}
