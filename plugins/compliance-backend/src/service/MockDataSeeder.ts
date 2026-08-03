import type { Knex } from 'knex';
import type { LoggerService } from '@backstage/backend-plugin-api';

const HOSTS = [
  'web-prod-01', 'web-prod-02', 'web-prod-03', 'web-prod-04', 'web-prod-05',
  'web-prod-06', 'web-prod-07', 'web-prod-08', 'web-prod-09', 'web-prod-10',
  'db-prod-01', 'db-prod-02', 'db-prod-03', 'db-prod-04',
  'app-prod-01', 'app-prod-02', 'app-prod-03', 'app-prod-04', 'app-prod-05', 'app-prod-06',
];

function ago(days: number, hours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

const STIG_DISPLAY_CONFIG = {
  gauge_label: 'compliance rate',
  gauge_unit: 'rules',
  score_formula: 'compliance_rate',
  remediation_verb: 'Remediate',
  severity_map: { CAT_I: 'High', CAT_II: 'Medium', CAT_III: 'Low' },
  columns: [
    { field: 'stig_id', label: 'STIG ID' },
    { field: 'title', label: 'Rule' },
    { field: 'severity', label: 'Severity' },
    { field: 'status', label: 'Status' },
    { field: 'fix_text', label: 'Fix' },
  ],
};

const CIS_DISPLAY_CONFIG = {
  ...STIG_DISPLAY_CONFIG,
  columns: [
    { field: 'stig_id', label: 'CIS Control' },
    { field: 'title', label: 'Rule' },
    { field: 'severity', label: 'Severity' },
    { field: 'status', label: 'Status' },
    { field: 'fix_text', label: 'Fix' },
  ],
};

const SC_DISPLAY_CONFIG = {
  gauge_label: 'vulnerability-free rate',
  gauge_unit: 'packages',
  score_formula: 'vulnerability_free_rate',
  remediation_verb: 'Patch',
  severity_map: { CAT_I: 'Critical / High', CAT_II: 'Medium', CAT_III: 'Low' },
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
      { widget: 'score_grid', title: 'SBOM Coverage', metric: 'vulnerability_free_rate', unit: 'packages',
        labels: { totalPackages: 'Total Packages', totalVulnerabilities: 'Unique CVEs', fixable: 'Fixable', unfixable: 'No Fix Available', hostsAffected: 'Hosts Affected' } },
      { widget: 'severity_breakdown', group_by: 'severity', labels: { CAT_I: 'Critical / High', CAT_II: 'Medium', CAT_III: 'Low' } },
      { widget: 'action_table', title: 'Vulnerability Details', columns: [
        { field: 'rule_id', label: 'CVE' },
        { field: 'title', label: 'Package' },
        { field: 'severity', label: 'Severity' },
        { field: 'fix_text', label: 'Fix' },
      ] },
      { widget: 'host_risk_heatmap', title: 'Host Risk Heatmap',
        actions: [{ type: 'download_artifact', artifact_key_prefix: 'sbom-', label: 'Download SBOM', mime_type: 'application/json', file_extension: '.cdx.json' }] },
    ],
  },
};

// ─── STIG rule definitions ───────────────────────────────────────────

const STIG_RULES = [
  { ruleId: 'sshd_set_idle_timeout', stigId: 'V-257844', title: 'Set SSH Client Alive Interval', category: 'Access Control', severity: 'CAT_I', disruption: 'low', aapImpact: 'caution', aapImpactReason: 'SSH daemon must accept connections from Controller',
    checkText: 'Verify the SSH daemon is configured to terminate idle sessions.', fixText: 'Set ClientAliveInterval to 600 in /etc/ssh/sshd_config.' },
  { ruleId: 'sshd_disable_root_login', stigId: 'V-257846', title: 'Disable SSH Root Login', category: 'Access Control', severity: 'CAT_I', disruption: 'low', aapImpact: 'caution', aapImpactReason: 'SSH daemon must accept connections from Controller',
    checkText: 'Verify SSH prohibits direct root login.', fixText: 'Set PermitRootLogin to no in /etc/ssh/sshd_config.' },
  { ruleId: 'enable_fips_mode', stigId: 'V-257777', title: 'Enable FIPS 140-3 Mode', category: 'System and Communications Protection', severity: 'CAT_I', disruption: 'high', aapImpact: 'breaks-connectivity', aapImpactReason: 'FIPS mode restricts ciphers — verify Controller SSH compatibility',
    checkText: 'Verify the system is in FIPS mode.', fixText: 'Enable FIPS mode: fips-mode-setup --enable' },
  { ruleId: 'accounts_tmout', stigId: 'V-257893', title: 'Set Account Session Timeout', category: 'Access Control', severity: 'CAT_II', disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify TMOUT is set.', fixText: 'Configure TMOUT in /etc/profile.d/ to 900 seconds.' },
  { ruleId: 'package_aide_installed', stigId: 'V-257780', title: 'Install AIDE', category: 'System and Information Integrity', severity: 'CAT_II', disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify AIDE is installed.', fixText: 'Install AIDE: dnf install aide' },
  { ruleId: 'service_auditd_enabled', stigId: 'V-257783', title: 'Enable auditd Service', category: 'Audit and Accountability', severity: 'CAT_II', disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify auditd is enabled and running.', fixText: 'Enable auditd: systemctl enable --now auditd' },
  { ruleId: 'grub2_password', stigId: 'V-257785', title: 'Set GRUB2 Boot Loader Password', category: 'Configuration Management', severity: 'CAT_I', disruption: 'medium', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify GRUB2 is password-protected.', fixText: 'Set GRUB2 password using grub2-setpassword.' },
  { ruleId: 'selinux_enforcing', stigId: 'V-257786', title: 'SELinux Must Be Enforcing', category: 'Access Control', severity: 'CAT_I', disruption: 'high', aapImpact: 'caution', aapImpactReason: 'SELinux must allow SSH and network access',
    checkText: 'Verify SELinux is enforcing.', fixText: 'Set SELinux to enforcing and reboot.' },
  { ruleId: 'configure_crypto_policy', stigId: 'V-257778', title: 'Configure System Cryptography Policy', category: 'System and Communications Protection', severity: 'CAT_II', disruption: 'medium', aapImpact: 'caution', aapImpactReason: 'Crypto policies must allow SSH ciphers compatible with Controller',
    checkText: 'Verify system-wide crypto policy.', fixText: 'Run update-crypto-policies --set FIPS.' },
  { ruleId: 'passwd_permissions', stigId: 'V-257820', title: 'Verify /etc/passwd Permissions', category: 'Configuration Management', severity: 'CAT_II', disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify /etc/passwd permissions.', fixText: 'Set permissions: chmod 0644 /etc/passwd' },
  { ruleId: 'package_telnet_not_installed', stigId: 'V-257835', title: 'Remove telnet Package', category: 'Configuration Management', severity: 'CAT_I', disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify telnet is not installed.', fixText: 'Remove telnet: dnf remove telnet' },
  { ruleId: 'banner_etc_issue', stigId: 'V-257795', title: 'Configure Login Banner', category: 'Access Control', severity: 'CAT_II', disruption: 'low', aapImpact: 'safe', aapImpactReason: '',
    checkText: 'Verify login banner contains required text.', fixText: 'Configure the consent banner in /etc/issue.' },
];

// ─── Supply chain CVE definitions ────────────────────────────────────

const SC_RULES = [
  { ruleId: 'CVE-2026-28439', stigId: 'openssl', title: 'openssl 3.0.7-27.el9 — CVE-2026-28439', category: '', severity: 'CAT_I', disruption: 'low',
    checkText: 'CVSS: Critical', fixText: 'Update to openssl-3.0.7-28.el9 via `dnf update openssl`' },
  { ruleId: 'CVE-2026-31852', stigId: 'curl', title: 'curl 7.76.1-26.el9 — CVE-2026-31852', category: '', severity: 'CAT_I', disruption: 'low',
    checkText: 'CVSS: High', fixText: 'Update to curl-7.76.1-29.el9 via `dnf update curl`' },
  { ruleId: 'CVE-2026-22105', stigId: 'glibc', title: 'glibc 2.34-83.el9 — CVE-2026-22105', category: '', severity: 'CAT_II', disruption: 'low',
    checkText: 'CVSS: Medium', fixText: 'Update to glibc-2.34-85.el9 via `dnf update glibc`' },
  { ruleId: 'CVE-2026-19477', stigId: 'python3', title: 'python3 3.9.18-3.el9 — CVE-2026-19477', category: '', severity: 'CAT_II', disruption: 'low',
    checkText: 'CVSS: Medium', fixText: 'Update to python3-3.9.18-5.el9 via `dnf update python3`' },
  { ruleId: 'CVE-2026-40891', stigId: 'vim-minimal', title: 'vim-minimal 9.0.2081-2.el9 — CVE-2026-40891', category: '', severity: 'CAT_III', disruption: 'low',
    checkText: 'CVSS: Low', fixText: 'No fix available for vim-minimal. Monitor for vendor updates.' },
];

// ─── Scan-specific finding generators ────────────────────────────────

type FindingRow = {
  id: string; scan_id: string; rule_id: string; stig_id: string; host: string;
  status: string; severity: string; actual_value: string; expected_value: string;
  evidence: string | null; finding_state: string | null;
};

let _findingCounter = 0;
function nextFindingId(): string { return `mock-finding-${++_findingCounter}`; }
function resetFindingCounter(): void { _findingCounter = 0; }

function stigFindings(scanId: string, states: Record<string, { status: string; state: string | null }>): FindingRow[] {
  const rows: FindingRow[] = [];
  for (const rule of STIG_RULES) {
    const override = states[rule.ruleId];
    for (const host of HOSTS) {
      const defaultStatus = getDefaultStigStatus(rule.ruleId, host);
      rows.push({
        id: nextFindingId(),
        scan_id: scanId,
        rule_id: rule.ruleId,
        stig_id: rule.stigId,
        host,
        status: override?.status ?? defaultStatus,
        severity: rule.severity,
        actual_value: defaultStatus === 'fail' ? 'non-compliant' : 'compliant',
        expected_value: 'compliant',
        evidence: null,
        finding_state: override?.state ?? (defaultStatus === 'fail' ? 'active' : null),
      });
    }
  }
  return rows;
}

function getDefaultStigStatus(ruleId: string, host: string): string {
  const failMap: Record<string, string[]> = {
    sshd_set_idle_timeout: ['db-prod-03', 'app-prod-05'],
    sshd_disable_root_login: ['web-prod-03', 'db-prod-01', 'db-prod-02', 'db-prod-03', 'db-prod-04'],
    enable_fips_mode: HOSTS.slice(),
    accounts_tmout: ['web-prod-09', 'app-prod-06'],
    package_aide_installed: ['web-prod-04', 'web-prod-05', 'web-prod-06', 'db-prod-03', 'db-prod-04', 'app-prod-01', 'app-prod-02'],
    grub2_password: ['web-prod-01', 'app-prod-03'],
    configure_crypto_policy: HOSTS.slice(),
    passwd_permissions: ['app-prod-04'],
    package_telnet_not_installed: ['db-prod-02'],
    banner_etc_issue: HOSTS.slice(),
  };
  return (failMap[ruleId] ?? []).includes(host) ? 'fail' : 'pass';
}

function scFindings(scanId: string): FindingRow[] {
  const rows: FindingRow[] = [];
  const failMap: Record<string, { hosts: string[]; state: string; fixState: string; installed: string; fixed: string; cvss: number }> = {
    'CVE-2026-28439': { hosts: ['web-prod-01', 'web-prod-02', 'web-prod-03', 'db-prod-01', 'db-prod-02'], state: 'active', fixState: 'fix_available', installed: '3.0.7-27.el9', fixed: '3.0.7-28.el9', cvss: 9.8 },
    'CVE-2026-31852': { hosts: HOSTS.slice(), state: 'new', fixState: 'fix_available', installed: '7.76.1-26.el9', fixed: '7.76.1-29.el9', cvss: 8.1 },
    'CVE-2026-22105': { hosts: ['web-prod-05', 'app-prod-01', 'app-prod-02'], state: 'active', fixState: 'fix_available', installed: '2.34-83.el9', fixed: '2.34-85.el9', cvss: 6.5 },
    'CVE-2026-19477': { hosts: ['db-prod-03', 'db-prod-04'], state: 'resurfaced', fixState: 'fix_available', installed: '3.9.18-3.el9', fixed: '3.9.18-5.el9', cvss: 5.3 },
    'CVE-2026-40891': { hosts: HOSTS.slice(), state: 'active', fixState: 'no_fix', installed: '9.0.2081-2.el9', fixed: '', cvss: 3.3 },
  };
  for (const rule of SC_RULES) {
    const info = failMap[rule.ruleId]!;
    for (const host of HOSTS) {
      const isFail = info.hosts.includes(host);
      rows.push({
        id: nextFindingId(),
        scan_id: scanId,
        rule_id: rule.ruleId,
        stig_id: rule.stigId,
        host,
        status: isFail ? 'fail' : 'pass',
        severity: rule.severity,
        actual_value: isFail ? info.installed : info.fixed || info.installed,
        expected_value: info.fixed || 'patched',
        evidence: isFail ? JSON.stringify({
          fix_state: info.fixState,
          fix_versions: info.fixed ? [info.fixed] : [],
          installed_version: info.installed,
          cvss_score: info.cvss,
          cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N',
        }) : null,
        finding_state: isFail ? info.state : null,
      });
    }
  }
  return rows;
}

// ─── Remediation selection shapes ────────────────────────────────────

function stigSelections(count: number): string {
  return JSON.stringify(
    STIG_RULES.slice(0, count).map(r => ({
      ruleId: r.ruleId,
      stigId: r.stigId,
      enabled: true,
      parameters: [],
    })),
  );
}

function scSelections(): string {
  return JSON.stringify(
    SC_RULES.slice(0, 3).map(r => ({
      ruleId: r.ruleId,
      stigId: r.stigId,
      enabled: true,
      parameters: [],
    })),
  );
}

// ─── Seeder class ────────────────────────────────────────────────────

export class MockDataSeeder {
  private readonly db: Knex;
  private readonly logger: LoggerService;

  constructor(db: Knex, logger: LoggerService) {
    this.db = db;
    this.logger = logger;
  }

  async seed(): Promise<void> {
    const existing = await this.db('compliance_profile_registry')
      .where('id', 'rhel9-stig')
      .first();
    if (existing) {
      this.logger.info('Mock data already seeded, skipping');
      return;
    }

    this.logger.info('Seeding mock data for demo mode...');
    const t0 = Date.now();

    const steps: Array<[string, () => Promise<void>]> = [
      ['profiles', () => this.seedProfiles()],
      ['rule metadata', () => this.seedRuleMetadata()],
      ['scans', () => this.seedScans()],
      ['findings', () => this.seedFindings()],
      ['posture snapshots', () => this.seedPostureSnapshots()],
      ['remediation profiles', () => this.seedRemediationProfiles()],
      ['remediation executions', () => this.seedRemediationExecutions()],
      ['baseline targets', () => this.seedBaselineTargets()],
      ['scan artifacts', () => this.seedScanArtifacts()],
    ];
    for (const [name, fn] of steps) {
      try {
        await fn();
      } catch (err) {
        this.logger.error(`Failed to seed ${name}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }

    this.logger.info(`Mock data seeded in ${Date.now() - t0}ms`);
  }

  private async seedProfiles(): Promise<void> {
    const now = new Date().toISOString();
    const profiles = [
      {
        id: 'rhel9-stig', profile_slug: 'rhel9-stig',
        display_name: 'DISA STIG for RHEL 9', framework: 'DISA_STIG', version: 'V2R8',
        description: 'Security Technical Implementation Guide for Red Hat Enterprise Linux 9, based on DISA STIG V2R8.',
        platform: 'RHEL 9', platform_spec: null,
        certification: JSON.stringify({ status: 'certified', authority: 'NIST SCAP 1.2', validationId: '', disclaimer: 'OpenSCAP is NIST SCAP 1.2 validated.' }),
        display_config: JSON.stringify(STIG_DISPLAY_CONFIG),
        workflow_template_id: 101, remediate_jt_id: 103, ee_id: 1,
        remediation_playbook_path: 'playbooks/remediate.yml', scan_tags: '',
        rule_count: 366, connection_status: 'connected',
        profile_version: 'V2R8', connected_at: now,
        created_at: '2025-10-25T00:00:00Z', updated_at: now,
      },
      {
        id: 'rhel9-cis-l1', profile_slug: 'rhel9-cis-l1',
        display_name: 'CIS Benchmark RHEL 9 — Level 1 Server', framework: 'CIS', version: '1.0.0',
        description: 'CIS Benchmark Level 1 for RHEL 9 servers.',
        platform: 'RHEL 9', platform_spec: null,
        certification: JSON.stringify({ status: 'conformant', authority: 'CIS', validationId: '', disclaimer: 'OpenSCAP uses CIS Benchmark content from scap-security-guide.' }),
        display_config: JSON.stringify(CIS_DISPLAY_CONFIG),
        workflow_template_id: 102, remediate_jt_id: null, ee_id: 1,
        remediation_playbook_path: '', scan_tags: '',
        rule_count: 189, connection_status: 'connected',
        profile_version: '1.0.0', connected_at: now,
        created_at: '2025-06-15T00:00:00Z', updated_at: now,
      },
      {
        id: 'rhel9-pci-dss', profile_slug: 'rhel9-pci-dss',
        display_name: 'PCI-DSS v4.0 for RHEL 9', framework: 'PCI_DSS', version: '4.0',
        description: 'Payment Card Industry Data Security Standard v4.0 controls mapped to RHEL 9.',
        platform: 'RHEL 9', platform_spec: null,
        certification: JSON.stringify({ status: 'uncertified', authority: '', validationId: '', disclaimer: '' }),
        display_config: JSON.stringify(STIG_DISPLAY_CONFIG),
        workflow_template_id: null, remediate_jt_id: null, ee_id: null,
        remediation_playbook_path: '', scan_tags: '',
        rule_count: 142, connection_status: 'connected',
        profile_version: '4.0', connected_at: now,
        created_at: '2025-03-20T00:00:00Z', updated_at: now,
      },
      {
        id: 'supply-chain-vuln', profile_slug: 'supply-chain-vuln',
        display_name: 'Supply Chain Vulnerability Scan', framework: 'SUPPLY_CHAIN', version: '1.0.0',
        description: 'Syft/Grype SBOM vulnerability scanning for OS packages and language dependencies.',
        platform: 'Linux (multi-distro)',
        platform_spec: JSON.stringify({ os_family: ['RedHat', 'Debian'], os_version: [] }),
        certification: JSON.stringify({ status: 'uncertified', authority: 'N/A', validationId: '', disclaimer: 'Syft and Grype are open-source tools from Anchore.' }),
        display_config: JSON.stringify(SC_DISPLAY_CONFIG),
        workflow_template_id: null, remediate_jt_id: null, ee_id: null,
        remediation_playbook_path: 'playbooks/remediate.yml', scan_tags: '',
        rule_count: 847, connection_status: 'connected',
        profile_version: '1.0.0', connected_at: now,
        created_at: '2026-06-25T00:00:00Z', updated_at: now,
      },
    ];
    await this.db('compliance_profile_registry').insert(profiles);
    this.logger.info(`  Seeded ${profiles.length} profiles`);
  }

  private async seedRuleMetadata(): Promise<void> {
    const allRules = [
      ...STIG_RULES.map(r => ({
        rule_id: r.ruleId, stig_id: r.stigId, title: r.title,
        description: `RHEL 9 — ${r.title}`,
        check_text: r.checkText, fix_text: r.fixText,
        category: r.category, disruption: r.disruption, scanner: 'oscap',
        aap_impact: r.aapImpact, aap_impact_reason: r.aapImpactReason,
        updated_at: new Date().toISOString(),
      })),
      ...SC_RULES.map(r => ({
        rule_id: r.ruleId, stig_id: r.stigId, title: r.title,
        description: r.title,
        check_text: r.checkText, fix_text: r.fixText,
        category: r.category || 'Package Vulnerability', disruption: r.disruption, scanner: 'syft-grype',
        aap_impact: 'safe', aap_impact_reason: '',
        updated_at: new Date().toISOString(),
      })),
    ];
    await this.db('compliance_rule_metadata')
      .insert(allRules)
      .onConflict('rule_id')
      .merge(['title', 'description', 'check_text', 'fix_text', 'updated_at']);
    this.logger.info(`  Seeded ${allRules.length} rule metadata records`);
  }

  private async seedScans(): Promise<void> {
    const scHostsMeta = Object.fromEntries(
      HOSTS.map((h, i) => [h, { totalScannedPackages: 412, totalVulnerablePackages: (i % 5) + 1, totalVulnerabilities: 5 }]),
    );
    const scans = [
      { id: 'mock-scan-stig-prod-001', profile_id: 'rhel9-stig', inventory_id: 1, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 1001, status: 'completed', started_at: ago(25), completed_at: ago(25, -1), scan_metadata: JSON.stringify({ hosts: Object.fromEntries(HOSTS.map(h => [h, {}])) }) },
      { id: 'mock-scan-stig-prod-002', profile_id: 'rhel9-stig', inventory_id: 1, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 1002, status: 'completed', started_at: ago(0, 2), completed_at: ago(0, 1), scan_metadata: JSON.stringify({ hosts: Object.fromEntries(HOSTS.map(h => [h, {}])) }) },
      { id: 'mock-scan-cis-staging-001', profile_id: 'rhel9-cis-l1', inventory_id: 2, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 1003, status: 'completed', started_at: ago(1), completed_at: ago(1, -1), scan_metadata: null },
      { id: 'mock-scan-pci-prod-001', profile_id: 'rhel9-pci-dss', inventory_id: 1, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 1004, status: 'completed', started_at: ago(3), completed_at: ago(3, -1), scan_metadata: null },
      { id: 'mock-scan-sc-prod-001', profile_id: 'supply-chain-vuln', inventory_id: 1, scanner: 'syft-grype', scan_type: 'assessment', workflow_job_id: 1005, status: 'completed', started_at: ago(1), completed_at: ago(1, -1), scan_metadata: JSON.stringify({ hosts: scHostsMeta, totalScannedPackages: 8240, totalVulnerablePackages: 50, totalVulnerabilities: 5 }) },
      { id: 'mock-scan-sc-prod-002', profile_id: 'supply-chain-vuln', inventory_id: 1, scanner: 'syft-grype', scan_type: 'assessment', workflow_job_id: 1006, status: 'completed', started_at: ago(0, 4), completed_at: ago(0, 3), scan_metadata: JSON.stringify({ hosts: scHostsMeta, totalScannedPackages: 8240, totalVulnerablePackages: 50, totalVulnerabilities: 5 }) },
      { id: 'mock-scan-stig-dev-001', profile_id: 'rhel9-stig', inventory_id: 3, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 1007, status: 'completed', started_at: ago(3), completed_at: ago(3, -1), scan_metadata: null },
      { id: 'mock-scan-verify-001', profile_id: 'rhel9-stig', inventory_id: 1, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 1008, status: 'completed', started_at: ago(0, 1), completed_at: ago(0, 0), scan_metadata: JSON.stringify({ hosts: Object.fromEntries(HOSTS.map(h => [h, {}])) }) },
    ];
    await this.db('compliance_scans').insert(scans);
    this.logger.info(`  Seeded ${scans.length} scans`);
  }

  private async seedFindings(): Promise<void> {
    resetFindingCounter();

    // Scan 001 (baseline) — all findings in default state
    const scan1 = stigFindings('mock-scan-stig-prod-001', {});

    // Scan 002 (current) — state transitions relative to scan 001
    const scan2 = stigFindings('mock-scan-stig-prod-002', {
      service_auditd_enabled: { status: 'pass', state: 'fixed' },
      selinux_enforcing: { status: 'pass', state: null },
      package_aide_installed: { status: 'fail', state: 'new' },
      sshd_set_idle_timeout: { status: 'fail', state: 'resurfaced' },
    });

    // CIS scan (reuses STIG rules for simplicity — real CIS has different rules)
    const cisScan = stigFindings('mock-scan-cis-staging-001', {});

    // PCI scan
    const pciScan = stigFindings('mock-scan-pci-prod-001', {});

    // Supply chain scan
    const scScan = scFindings('mock-scan-sc-prod-002');

    // Dev scan
    const devScan = stigFindings('mock-scan-stig-dev-001', {});

    // Verification scan — most things improved
    const verifyScan = stigFindings('mock-scan-verify-001', {
      service_auditd_enabled: { status: 'pass', state: 'fixed' },
      sshd_disable_root_login: { status: 'pass', state: 'fixed' },
      accounts_tmout: { status: 'pass', state: 'fixed' },
    });

    // Add a few N/A findings to scan 002
    for (let i = 0; i < 3; i++) {
      scan2.push({
        id: nextFindingId(),
        scan_id: 'mock-scan-stig-prod-002',
        rule_id: `na_rule_${i + 1}`,
        stig_id: `V-NA-${i + 1}`,
        host: HOSTS[i],
        status: 'notapplicable',
        severity: 'CAT_III',
        actual_value: 'N/A',
        expected_value: 'N/A',
        evidence: null,
        finding_state: null,
      });
    }

    const allFindings = [...scan1, ...scan2, ...cisScan, ...pciScan, ...scScan, ...devScan, ...verifyScan];

    const batchSize = 200;
    for (let i = 0; i < allFindings.length; i += batchSize) {
      await this.db('compliance_findings')
        .insert(allFindings.slice(i, i + batchSize))
        .onConflict(['scan_id', 'rule_id', 'host'])
        .merge(['status', 'severity', 'finding_state']);
    }
    this.logger.info(`  Seeded ${allFindings.length} findings`);
  }

  private async seedPostureSnapshots(): Promise<void> {
    const day = 86_400_000;
    const now = Date.now();
    const snapshots = [
      { id: 'mock-ps-01', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: 'mock-scan-stig-prod-001', timestamp: new Date(now - 30 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 165, fail_count: 201, compliance_pct: 45 },
      { id: 'mock-ps-02', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 27 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 176, fail_count: 190, compliance_pct: 48 },
      { id: 'mock-ps-03', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 24 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 190, fail_count: 176, compliance_pct: 52 },
      { id: 'mock-ps-04', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 21 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 201, fail_count: 165, compliance_pct: 55 },
      { id: 'mock-ps-05', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 18 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 216, fail_count: 150, compliance_pct: 59 },
      { id: 'mock-ps-06', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 14 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 227, fail_count: 139, compliance_pct: 62 },
      { id: 'mock-ps-07', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 10 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 238, fail_count: 128, compliance_pct: 65 },
      { id: 'mock-ps-08', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 7 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 249, fail_count: 117, compliance_pct: 68 },
      { id: 'mock-ps-09', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: null, timestamp: new Date(now - 3 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 256, fail_count: 110, compliance_pct: 70 },
      { id: 'mock-ps-10', profile_id: 'rhel9-stig', inventory_id: 1, scan_id: 'mock-scan-stig-prod-002', timestamp: new Date(now - 1 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 264, fail_count: 102, compliance_pct: 72 },
      // Supply chain trend
      { id: 'mock-ps-11', profile_id: 'supply-chain-vuln', inventory_id: 1, scan_id: 'mock-scan-sc-prod-001', timestamp: new Date(now - 1 * day).toISOString(), total_hosts: 20, total_rules: 847, pass_count: 787, fail_count: 60, compliance_pct: 92.9 },
      { id: 'mock-ps-12', profile_id: 'supply-chain-vuln', inventory_id: 1, scan_id: 'mock-scan-sc-prod-002', timestamp: new Date(now - 4 * 3600000).toISOString(), total_hosts: 20, total_rules: 847, pass_count: 797, fail_count: 50, compliance_pct: 94.1 },
      // STIG on dev inventory
      { id: 'mock-ps-13', profile_id: 'rhel9-stig', inventory_id: 3, scan_id: 'mock-scan-stig-dev-001', timestamp: new Date(now - 3 * day).toISOString(), total_hosts: 20, total_rules: 366, pass_count: 227, fail_count: 139, compliance_pct: 62 },
      // CIS
      { id: 'mock-ps-14', profile_id: 'rhel9-cis-l1', inventory_id: 2, scan_id: 'mock-scan-cis-staging-001', timestamp: new Date(now - 1 * day).toISOString(), total_hosts: 20, total_rules: 189, pass_count: 160, fail_count: 29, compliance_pct: 84.7 },
    ];
    await this.db('compliance_posture_snapshots').insert(snapshots);
    this.logger.info(`  Seeded ${snapshots.length} posture snapshots`);
  }

  private async seedRemediationProfiles(): Promise<void> {
    const profiles = [
      {
        id: 'mock-rp-stig-phase1', name: 'STIG Baseline — Phase 1',
        description: 'First phase of STIG hardening: SSH, auditd, and basic config rules.',
        profile_id: 'rhel9-stig', creation_scan_id: 'mock-scan-stig-prod-001',
        selections_json: stigSelections(8), status: 'saved', created_by: 'mock-user',
        created_at: ago(20), updated_at: ago(10),
      },
      {
        id: 'mock-rp-stig-ssh', name: 'SSH Hardening Quick Fix',
        description: 'Quick fix for SSH-related findings only.',
        profile_id: 'rhel9-stig', creation_scan_id: 'mock-scan-stig-prod-002',
        selections_json: stigSelections(2), status: 'saved', created_by: 'mock-user',
        created_at: ago(5), updated_at: ago(5),
      },
      {
        id: 'mock-rp-sc-patch', name: 'Supply Chain Patch Plan',
        description: 'Patch openssl, curl, and glibc vulnerabilities.',
        profile_id: 'supply-chain-vuln', creation_scan_id: 'mock-scan-sc-prod-002',
        selections_json: scSelections(), status: 'draft', created_by: 'mock-user',
        created_at: ago(0, 3), updated_at: ago(0, 3),
      },
    ];
    await this.db('compliance_remediation_profiles').insert(profiles);
    this.logger.info(`  Seeded ${profiles.length} remediation profiles`);
  }

  private async seedRemediationExecutions(): Promise<void> {
    const executions = [
      {
        id: 'mock-exec-001',
        remediation_profile_id: 'mock-rp-stig-phase1',
        inventory_id: 1,
        informing_scan_id: 'mock-scan-stig-prod-001',
        primary_job_id: 2001,
        all_job_ids: JSON.stringify([2001, 2002]),
        status: 'succeeded',
        started_at: ago(10),
        completed_at: ago(10, -1),
        elapsed_seconds: 347,
        rules_applied: 5,
        rules_failed: 0,
        hosts_targeted: 20,
        hosts_succeeded: 18,
        hosts_failed: 2,
        plan_summary: JSON.stringify({
          totalRules: 8,
          enabledRules: 5,
          totalHosts: 20,
          groups: [
            { hosts: ['db-prod-03', 'app-prod-05'], ruleCount: 2, rules: ['sshd_set_idle_timeout', 'accounts_tmout'] },
            { hosts: ['web-prod-03', 'db-prod-01', 'db-prod-02'], ruleCount: 1, rules: ['sshd_disable_root_login'] },
          ],
        }),
        verification_scan_id: 'mock-scan-verify-001',
        created_by: 'mock-user',
      },
      {
        id: 'mock-exec-002',
        remediation_profile_id: 'mock-rp-stig-ssh',
        inventory_id: 1,
        informing_scan_id: 'mock-scan-stig-prod-002',
        primary_job_id: 2003,
        all_job_ids: JSON.stringify([2003]),
        status: 'running',
        started_at: ago(0, 0),
        completed_at: null,
        elapsed_seconds: null,
        rules_applied: null,
        rules_failed: null,
        hosts_targeted: 20,
        hosts_succeeded: null,
        hosts_failed: null,
        plan_summary: JSON.stringify({
          totalRules: 2, enabledRules: 2, totalHosts: 20,
          groups: [{ hosts: ['db-prod-03', 'app-prod-05'], ruleCount: 1, rules: ['sshd_set_idle_timeout'] }],
        }),
        verification_scan_id: null,
        created_by: 'mock-user',
      },
      {
        id: 'mock-exec-003',
        remediation_profile_id: 'mock-rp-stig-phase1',
        inventory_id: 3,
        informing_scan_id: 'mock-scan-stig-dev-001',
        primary_job_id: 2004,
        all_job_ids: JSON.stringify([2004]),
        status: 'failed',
        started_at: ago(2),
        completed_at: ago(2, -1),
        elapsed_seconds: 45,
        rules_applied: 0,
        rules_failed: 3,
        hosts_targeted: 8,
        hosts_succeeded: 0,
        hosts_failed: 8,
        plan_summary: null,
        verification_scan_id: null,
        created_by: 'mock-user',
      },
    ];
    await this.db('compliance_remediation_executions').insert(executions);
    this.logger.info(`  Seeded ${executions.length} remediation executions`);
  }

  private async seedBaselineTargets(): Promise<void> {
    const targets = [
      {
        id: 'mock-baseline-stig-prod',
        remediation_profile_id: 'mock-rp-stig-phase1',
        compliance_profile_id: 'rhel9-stig',
        inventory_id: 1,
        pinned_at: ago(10),
        pinned_by: 'mock-user',
      },
    ];
    await this.db('compliance_baseline_targets').insert(targets);
    this.logger.info(`  Seeded ${targets.length} baseline targets`);
  }

  private async seedScanArtifacts(): Promise<void> {
    const now = new Date().toISOString();
    const artifacts = [
      {
        id: 'mock-artifact-sbom-01',
        scan_id: 'mock-scan-sc-prod-002',
        artifact_key: 'sbom-web-prod-01',
        oci_reference: 'mock://pah.example.com/compliance/supply-chain-vuln/mock-scan-sc-prod-002:sbom-web-prod-01',
        artifact_name: 'web-prod-01.cdx.json',
        mime_type: 'application/json',
        created_at: now,
      },
      {
        id: 'mock-artifact-sbom-02',
        scan_id: 'mock-scan-sc-prod-002',
        artifact_key: 'sbom-db-prod-01',
        oci_reference: 'mock://pah.example.com/compliance/supply-chain-vuln/mock-scan-sc-prod-002:sbom-db-prod-01',
        artifact_name: 'db-prod-01.cdx.json',
        mime_type: 'application/json',
        created_at: now,
      },
    ];
    await this.db('compliance_scan_artifacts').insert(artifacts);
    this.logger.info(`  Seeded ${artifacts.length} scan artifacts`);
  }
}
