import knex, { Knex } from 'knex';
import { ComplianceDatabase } from './ComplianceDatabase';

let db: Knex;
let complianceDb: ComplianceDatabase;

// ─── Schema setup ────────────────────────────────────────────────────

async function createTables(database: Knex): Promise<void> {
  await database.schema.createTable('compliance_scans', table => {
    table.string('id').primary();
    table.string('profile_id').notNullable();
    table.integer('inventory_id').notNullable();
    table.string('scanner').notNullable().defaultTo('oscap');
    table.string('scan_type').notNullable().defaultTo('assessment');
    table.integer('workflow_job_id').nullable();
    table.string('status').notNullable().defaultTo('pending');
    table.timestamp('started_at').notNullable().defaultTo(database.fn.now());
    table.timestamp('completed_at').nullable();
    table.string('ingest_token').nullable();
    table.text('error_details').nullable();
    table.text('scan_metadata').nullable();
    table.string('profile_version', 64).nullable();
  });

  await database.schema.createTable('compliance_findings', table => {
    table.string('id').primary();
    table
      .string('scan_id')
      .notNullable()
      .references('id')
      .inTable('compliance_scans')
      .onDelete('CASCADE');
    table.string('rule_id').notNullable();
    table.string('stig_id').notNullable();
    table.string('host').notNullable();
    table.string('status').notNullable();
    table.string('severity').notNullable();
    table.text('actual_value').defaultTo('');
    table.text('expected_value').defaultTo('');
    table.text('evidence').nullable();
    table.string('finding_state').nullable();
    table.unique(['scan_id', 'rule_id', 'host']);
  });

  await database.schema.createTable(
    'compliance_remediation_profiles',
    table => {
      table.string('id').primary();
      table.string('name').notNullable();
      table.text('description').defaultTo('');
      table.string('profile_id').notNullable();
      table.string('creation_scan_id').nullable();
      table.text('selections_json').notNullable();
      table.string('status').notNullable().defaultTo('saved');
      table.string('created_by').nullable();
      table
        .timestamp('created_at')
        .notNullable()
        .defaultTo(database.fn.now());
      table
        .timestamp('updated_at')
        .notNullable()
        .defaultTo(database.fn.now());
      table.unique(['name', 'profile_id', 'status']);
    },
  );

  await database.schema.createTable('compliance_remediation_executions', table => {
    table.string('id').primary();
    table.string('remediation_profile_id').notNullable()
      .references('id').inTable('compliance_remediation_profiles').onDelete('RESTRICT');
    table.integer('inventory_id').notNullable();
    table.string('informing_scan_id').nullable();
    table.integer('primary_job_id').nullable();
    table.text('all_job_ids').nullable();
    table.string('status').notNullable().defaultTo('pending');
    table.string('started_at').notNullable();
    table.string('completed_at').nullable();
    table.float('elapsed_seconds').nullable();
    table.integer('rules_applied').nullable();
    table.integer('rules_failed').nullable();
    table.integer('hosts_targeted').nullable();
    table.integer('hosts_succeeded').nullable();
    table.integer('hosts_failed').nullable();
    table.text('plan_summary').nullable();
    table.string('verification_scan_id').nullable();
    table.string('created_by').nullable();
    table.index(['remediation_profile_id']);
    table.index(['started_at']);
  });

  await database.raw(`
    CREATE UNIQUE INDEX idx_one_active_per_inventory
    ON compliance_remediation_executions (inventory_id)
    WHERE status IN ('pending', 'running')
  `);

  await database.schema.createTable('compliance_baseline_targets', table => {
    table.string('id').primary();
    table.string('remediation_profile_id').notNullable()
      .references('id').inTable('compliance_remediation_profiles').onDelete('RESTRICT');
    table.string('compliance_profile_id').notNullable();
    table.integer('inventory_id').notNullable();
    table.string('pinned_at').notNullable();
    table.string('pinned_by').nullable();
    table.unique(['compliance_profile_id', 'inventory_id']);
  });

  await database.schema.createTable(
    'compliance_posture_snapshots',
    table => {
      table.string('id').primary();
      table.string('profile_id').notNullable();
      table.integer('inventory_id').nullable();
      table.string('scan_id').nullable();
      table
        .timestamp('timestamp')
        .notNullable()
        .defaultTo(database.fn.now());
      table.integer('total_hosts').notNullable().defaultTo(0);
      table.integer('total_rules').notNullable().defaultTo(0);
      table.integer('pass_count').notNullable().defaultTo(0);
      table.integer('fail_count').notNullable().defaultTo(0);
      table.float('compliance_pct').notNullable().defaultTo(0);
    },
  );

  await database.schema.createTable('compliance_rule_metadata', table => {
    table.string('rule_id').primary();
    table.string('stig_id').notNullable().defaultTo('');
    table.text('title').notNullable().defaultTo('');
    table.text('description').notNullable().defaultTo('');
    table.text('check_text').notNullable().defaultTo('');
    table.text('fix_text').notNullable().defaultTo('');
    table.string('category').notNullable().defaultTo('');
    table.string('disruption').notNullable().defaultTo('medium');
    table.string('aap_impact').notNullable().defaultTo('safe');
    table.text('aap_impact_reason').notNullable().defaultTo('');
    table.string('scanner').notNullable().defaultTo('');
    table.timestamp('updated_at').notNullable().defaultTo(database.fn.now());
  });

  await database.schema.createTable(
    'compliance_profile_registry',
    table => {
      table.string('id').primary();
      table.string('profile_slug', 128).nullable();
      table.string('display_name').notNullable();
      table.text('description').defaultTo('');
      table.string('framework').notNullable();
      table.string('version').defaultTo('');
      table.string('platform').defaultTo('');
      table.text('platform_spec').nullable();
      table.integer('workflow_template_id').nullable();
      table.integer('remediate_jt_id').nullable();
      table.integer('ee_id').nullable();
      table.text('remediation_playbook_path').defaultTo('');
      table.string('scan_tags').defaultTo('');
      table.text('certification').nullable();
      table.integer('rule_count').nullable();
      table.text('display_config').nullable();
      table.string('connection_status').notNullable().defaultTo('connected');
      table.text('bundle_data').nullable();
      table.text('bundle_metadata').nullable();
      table.timestamp('connected_at').nullable();
      table.timestamp('disconnected_at').nullable();
      table.string('disconnected_by').nullable();
      table.string('profile_version').nullable();
      table.text('version_history').nullable();
      table
        .timestamp('created_at')
        .notNullable()
        .defaultTo(database.fn.now());
      table
        .timestamp('updated_at')
        .notNullable()
        .defaultTo(database.fn.now());
    },
  );
}

// ─── Lifecycle ───────────────────────────────────────────────────────

beforeEach(async () => {
  db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  await createTables(db);
  complianceDb = new ComplianceDatabase(db);
});

afterEach(async () => {
  await db.destroy();
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('ComplianceDatabase', () => {
  // ─── createScan + getRecentScans ─────────────────────────────────

  describe('createScan + getRecentScans', () => {
    it('creates a scan and retrieves it in recent scans', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: null,
      });

      expect(scan.id).toBeDefined();
      expect(scan.profileId).toBe('rhel9-stig');
      expect(scan.workflowJobId).toBe(42);
      expect(scan.scanType).toBe('assessment');

      const recent = await complianceDb.getRecentScans(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].id).toBe(scan.id);
      expect(recent[0].profileId).toBe('rhel9-stig');
      expect(recent[0].inventoryId).toBe(1);
      expect(recent[0].status).toBe('pending');
    });

    it('returns scans ordered by started_at descending', async () => {
      await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 1,
        status: 'completed',
        startedAt: '2026-04-29T10:00:00.000Z',
        completedAt: '2026-04-29T10:05:00.000Z',
      });
      await complianceDb.createScan({
        profileId: 'cis-rhel9',
        inventoryId: 2,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 2,
        status: 'pending',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: null,
      });

      const recent = await complianceDb.getRecentScans(10);
      expect(recent).toHaveLength(2);
      // Most recent first
      expect(recent[0].profileId).toBe('cis-rhel9');
      expect(recent[1].profileId).toBe('rhel9-stig');
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await complianceDb.createScan({
          profileId: `profile-${i}`,
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: i,
          status: 'completed',
          startedAt: `2026-04-${String(25 + i).padStart(2, '0')}T10:00:00.000Z`,
          completedAt: `2026-04-${String(25 + i).padStart(2, '0')}T10:05:00.000Z`,
        });
      }

      const recent = await complianceDb.getRecentScans(3);
      expect(recent).toHaveLength(3);
    });
  });

  // ─── getScanByWorkflowJobId ──────────────────────────────────────

  describe('getScanByWorkflowJobId', () => {
    it('returns the scan matching the workflow job ID', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'running',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: null,
      });

      const found = await complianceDb.getScanByWorkflowJobId(42);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(scan.id);
      expect(found!.workflowJobId).toBe(42);
    });

    it('returns null when no scan matches', async () => {
      const found = await complianceDb.getScanByWorkflowJobId(999);
      expect(found).toBeNull();
    });
  });

  // ─── updateScanStatus ────────────────────────────────────────────

  describe('updateScanStatus', () => {
    it('updates the status of a scan', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: null,
      });

      await complianceDb.updateScanStatus(
        scan.id,
        'completed',
        '2026-04-30T10:05:00.000Z',
      );

      const recent = await complianceDb.getRecentScans(1);
      expect(recent[0].status).toBe('completed');
    });
  });

  // ─── saveScanResults + getFindingsByScanId ───────────────────────

  describe('saveScanResults + getFindingsByScanId', () => {
    it('saves findings and retrieves them by scan ID', async () => {
      const findings = [
        {
          ruleId: 'xccdf_rule_sshd_config',
          stigId: 'RHEL-09-255040',
          host: 'host1.example.com',
          status: 'fail',
          severity: 'high',
          actualValue: 'PermitRootLogin yes',
          expectedValue: 'PermitRootLogin no',
          evidence: 'sshd_config line 42',
        },
        {
          ruleId: 'xccdf_rule_audit_rules',
          stigId: 'RHEL-09-654010',
          host: 'host1.example.com',
          status: 'pass',
          severity: 'medium',
          actualValue: 'enabled',
          expectedValue: 'enabled',
          evidence: null,
        },
      ];

      const result = await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 42,
          status: 'completed',
          startedAt: '2026-04-30T10:00:00.000Z',
          completedAt: '2026-04-30T10:05:00.000Z',
        },
        findings,
      );

      expect(result.scanId).toBeDefined();
      expect(result.findingCount).toBe(2);

      const retrieved = await complianceDb.getFindingsByScanId(result.scanId);
      expect(retrieved).toHaveLength(2);

      // Findings should be ordered by severity ascending
      const ruleIds = retrieved.map(f => f.ruleId);
      expect(ruleIds).toContain('xccdf_rule_sshd_config');
      expect(ruleIds).toContain('xccdf_rule_audit_rules');

      // Check field mapping
      const sshFinding = retrieved.find(
        f => f.ruleId === 'xccdf_rule_sshd_config',
      )!;
      expect(sshFinding.stigId).toBe('RHEL-09-255040');
      expect(sshFinding.host).toBe('host1.example.com');
      expect(sshFinding.status).toBe('fail');
      expect(sshFinding.severity).toBe('high');
      expect(sshFinding.actualValue).toBe('PermitRootLogin yes');
      expect(sshFinding.expectedValue).toBe('PermitRootLogin no');
      expect(sshFinding.evidence).toBe('sshd_config line 42');
      expect(sshFinding.scanId).toBe(result.scanId);
      expect(sshFinding.id).toBeDefined();
    });

    it('handles empty findings array', async () => {
      const result = await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 42,
          status: 'completed',
          startedAt: '2026-04-30T10:00:00.000Z',
          completedAt: '2026-04-30T10:05:00.000Z',
        },
        [],
      );

      expect(result.findingCount).toBe(0);

      const retrieved = await complianceDb.getFindingsByScanId(result.scanId);
      expect(retrieved).toHaveLength(0);
    });

    it('returns empty array for nonexistent scan ID', async () => {
      const findings = await complianceDb.getFindingsByScanId(
        'nonexistent-scan-id',
      );
      expect(findings).toEqual([]);
    });
  });

  // ─── saveFindingsForScan ─────────────────────────────────────────

  describe('saveFindingsForScan', () => {
    it('attaches findings to an existing scan', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'completed',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: '2026-04-30T10:05:00.000Z',
      });

      const count = await complianceDb.saveFindingsForScan(scan.id, [
        {
          ruleId: 'rule-1',
          stigId: 'RHEL-09-001',
          host: 'host1',
          status: 'fail',
          severity: 'high',
          actualValue: 'off',
          expectedValue: 'on',
          evidence: null,
        },
      ]);

      expect(count).toBe(1);

      const retrieved = await complianceDb.getFindingsByScanId(scan.id);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].ruleId).toBe('rule-1');
    });

    it('returns 0 for empty findings', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'completed',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: '2026-04-30T10:05:00.000Z',
      });

      const count = await complianceDb.saveFindingsForScan(scan.id, []);
      expect(count).toBe(0);
    });
  });

  // ─── Profile CRUD ──────────────────────────────────────────────

  describe('listProfiles + saveProfile + deleteProfile', () => {
    it('starts with an empty profile list', async () => {
      const list = await complianceDb.listProfiles();
      expect(list).toEqual([]);
    });

    it('saves and lists a profile', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'RHEL 9 STIG',
        description: 'DISA STIG for RHEL 9',
        framework: 'DISA_STIG',
        version: 'V2R1',
        platform: 'RHEL 9',
        workflowTemplateId: 10,
        eeId: 5,
        remediationPlaybookPath: '/playbooks/stig-remediate.yml',
        scanTags: 'stig,rhel9',
      });

      expect(saved.id).toBeDefined();
      expect(saved.displayName).toBe('RHEL 9 STIG');
      expect(saved.framework).toBe('DISA_STIG');
      expect(saved.workflowTemplateId).toBe(10);
      expect(saved.eeId).toBe(5);
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();

      const list = await complianceDb.listProfiles();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(saved.id);
    });

    it('updates an existing profile when ID matches', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'RHEL 9 STIG',
        description: '',
        framework: 'DISA_STIG',
        version: 'V2R1',
        platform: 'RHEL 9',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      const updated = await complianceDb.saveProfile({
        id: saved.id,
        displayName: 'RHEL 9 STIG (Updated)',
        description: 'Updated description',
        framework: 'DISA_STIG',
        version: 'V2R8',
        platform: 'RHEL 9',
        workflowTemplateId: 10,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.displayName).toBe('RHEL 9 STIG (Updated)');
      expect(updated.version).toBe('V2R8');

      const list = await complianceDb.listProfiles();
      expect(list).toHaveLength(1);
    });

    it('deletes a profile and returns true', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'RHEL 9 STIG',
        description: '',
        framework: 'DISA_STIG',
        version: '',
        platform: '',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      const deleted = await complianceDb.deleteProfile(saved.id);
      expect(deleted).toBe(true);

      const list = await complianceDb.listProfiles();
      expect(list).toEqual([]);
    });

    it('returns false when deleting a nonexistent profile', async () => {
      const deleted = await complianceDb.deleteProfile('nonexistent');
      expect(deleted).toBe(false);
    });

    it('retrieves a profile by ID', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'CIS Benchmark',
        description: 'CIS Level 1',
        framework: 'CIS',
        version: 'v1.0',
        platform: 'RHEL 9',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      const found = await complianceDb.getProfile(saved.id);
      expect(found).not.toBeNull();
      expect(found!.displayName).toBe('CIS Benchmark');
      expect(found!.framework).toBe('CIS');
    });

    it('returns null for nonexistent profile ID', async () => {
      const found = await complianceDb.getProfile('nonexistent');
      expect(found).toBeNull();
    });

    it('round-trips platformSpec as JSON', async () => {
      const platformSpec = {
        os_family: ['RedHat'],
        os_version: ['9'],
        device_type: [],
        scanner_validates: false,
      };

      const saved = await complianceDb.saveProfile({
        displayName: 'RHEL 9 STIG with Platform Spec',
        description: '',
        framework: 'DISA_STIG',
        version: 'V2R8',
        platform: 'RHEL 9',
        platformSpec,
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      expect(saved.platformSpec).toEqual(platformSpec);

      const found = await complianceDb.getProfile(saved.id);
      expect(found).not.toBeNull();
      expect(found!.platformSpec).toEqual(platformSpec);
      expect(found!.platformSpec!.os_family).toEqual(['RedHat']);
      expect(found!.platformSpec!.os_version).toEqual(['9']);
    });

    it('stores null platformSpec when not provided', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'No Platform Spec',
        description: '',
        framework: 'CIS',
        version: '',
        platform: '',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      expect(saved.platformSpec).toBeNull();

      const found = await complianceDb.getProfile(saved.id);
      expect(found!.platformSpec).toBeNull();
    });
  });

  // ─── Profile lifecycle ──────────────────────────────────────────

  describe('connectProfile + disconnectProfile', () => {
    it('disconnects a profile and reconnects it', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'STIG Lifecycle Test',
        description: '',
        framework: 'DISA_STIG',
        version: 'V2R8',
        platform: 'RHEL 9',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      const disconnected = await complianceDb.disconnectProfile(saved.id, 'admin@test.com');
      expect(disconnected).toBe(true);

      const profile = await complianceDb.getProfile(saved.id);
      expect(profile!.connectionStatus).toBe('disconnected');

      const reconnected = await complianceDb.connectProfile('DISA_STIG', 'V2R9');
      expect(reconnected).not.toBeNull();
      expect(reconnected!.connectionStatus).toBe('connected');
    });

    it('connectProfile returns null for unknown framework', async () => {
      const result = await complianceDb.connectProfile('NONEXISTENT', '1.0');
      expect(result).toBeNull();
    });

    it('disconnectProfileByFramework works', async () => {
      await complianceDb.saveProfile({
        displayName: 'CIS Disconnect Test',
        description: '',
        framework: 'CIS',
        version: 'v1.0',
        platform: 'RHEL 9',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      const result = await complianceDb.disconnectProfileByFramework('CIS');
      expect(result).toBe(true);
    });

    it('disconnectProfile returns false for unknown id', async () => {
      const result = await complianceDb.disconnectProfile('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  // ─── Bundle storage ────────────────────────────────────────────

  describe('saveProfileBundle + getProfileBundle + deleteProfileBundle', () => {
    it('saves and retrieves a bundle', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'Bundle Test',
        description: '',
        framework: 'SUPPLY_CHAIN',
        version: '1.0',
        platform: 'Linux',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      await complianceDb.saveProfileBundle(saved.id, 'export default function(){}', { size: 30 });

      const bundle = await complianceDb.getProfileBundle(saved.id);
      expect(bundle).not.toBeNull();
      expect(bundle!.data).toBe('export default function(){}');
      expect(bundle!.metadata.size).toBe(30);
    });

    it('returns null when no bundle exists', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'No Bundle',
        description: '',
        framework: 'PQC_READINESS',
        version: '1.0',
        platform: 'Linux',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      const bundle = await complianceDb.getProfileBundle(saved.id);
      expect(bundle).toBeNull();
    });

    it('deletes a bundle', async () => {
      const saved = await complianceDb.saveProfile({
        displayName: 'Delete Bundle Test',
        description: '',
        framework: 'CUSTOM',
        version: '1.0',
        platform: 'Linux',
        workflowTemplateId: null,
        eeId: null,
        remediationPlaybookPath: '',
        scanTags: '',
      });

      await complianceDb.saveProfileBundle(saved.id, 'code', { size: 4 });
      const deleted = await complianceDb.deleteProfileBundle(saved.id);
      expect(deleted).toBe(true);

      const bundle = await complianceDb.getProfileBundle(saved.id);
      expect(bundle).toBeNull();
    });
  });

  // ─── Remediation profiles ────────────────────────────────────────

  describe('saveRemediationProfile + listRemediationProfiles', () => {
    it('saves and lists a remediation profile', async () => {
      const result = await complianceDb.saveRemediationProfile({
        name: 'Production STIG',
        description: 'Remediation profile for prod RHEL servers',
        profileId: 'rhel9-stig',
        selections: [
          { ruleId: 'rule-1', enabled: true },
          { ruleId: 'rule-2', enabled: false },
        ],
      });

      expect(result.id).toBeDefined();

      const list = await complianceDb.listRemediationProfiles();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Production STIG');
      expect(list[0].description).toBe(
        'Remediation profile for prod RHEL servers',
      );
      expect(list[0].complianceProfileId).toBe('rhel9-stig');
      expect(list[0].selections).toHaveLength(2);
      expect(list[0].selections[0].ruleId).toBe('rule-1');
      expect(list[0].selections[0].enabled).toBe(true);
    });

    it('retrieves a remediation profile by ID', async () => {
      const result = await complianceDb.saveRemediationProfile({
        name: 'Test Profile',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
      });

      const found = await complianceDb.getRemediationProfile(result.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Test Profile');
    });

    it('returns null for nonexistent remediation profile', async () => {
      const found = await complianceDb.getRemediationProfile('nonexistent');
      expect(found).toBeNull();
    });
  });

  // ─── Posture snapshots ───────────────────────────────────────────

  describe('savePostureSnapshot + getPostureHistory', () => {
    it('saves and retrieves posture snapshots', async () => {
      const snapshot = await complianceDb.savePostureSnapshot({
        profileId: 'rhel9-stig',
        timestamp: new Date().toISOString(),
        totalHosts: 10,
        totalRules: 366,
        passCount: 340,
        failCount: 26,
        compliancePct: 92.9,
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.totalHosts).toBe(10);

      const history = await complianceDb.getPostureHistory('rhel9-stig', 30);
      expect(history).toHaveLength(1);
      expect(history[0].profileId).toBe('rhel9-stig');
      expect(history[0].passCount).toBe(340);
      expect(history[0].compliancePct).toBeCloseTo(92.9, 1);
    });

    it('filters by date range', async () => {
      // Save an old snapshot beyond the window
      await complianceDb.savePostureSnapshot({
        profileId: 'rhel9-stig',
        timestamp: '2025-01-01T00:00:00.000Z',
        totalHosts: 5,
        totalRules: 100,
        passCount: 80,
        failCount: 20,
        compliancePct: 80.0,
      });

      // Save a recent snapshot within the window
      await complianceDb.savePostureSnapshot({
        profileId: 'rhel9-stig',
        timestamp: new Date().toISOString(),
        totalHosts: 10,
        totalRules: 366,
        passCount: 340,
        failCount: 26,
        compliancePct: 92.9,
      });

      const history = await complianceDb.getPostureHistory('rhel9-stig', 30);
      expect(history).toHaveLength(1);
      expect(history[0].totalHosts).toBe(10);
    });

    it('returns empty array for unknown profile', async () => {
      const history = await complianceDb.getPostureHistory('nonexistent', 30);
      expect(history).toEqual([]);
    });
  });

  // ─── cleanupOldFindings ──────────────────────────────────────────

  describe('cleanupOldFindings', () => {
    it('deletes findings from scans older than the retention period', async () => {
      // Create an old scan (200 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200);
      const oldResult = await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 1,
          status: 'completed',
          startedAt: oldDate.toISOString(),
          completedAt: oldDate.toISOString(),
        },
        [
          {
            ruleId: 'old-rule-1',
            stigId: 'RHEL-09-001',
            host: 'host1',
            status: 'fail',
            severity: 'high',
            actualValue: 'off',
            expectedValue: 'on',
            evidence: null,
          },
          {
            ruleId: 'old-rule-2',
            stigId: 'RHEL-09-002',
            host: 'host1',
            status: 'pass',
            severity: 'medium',
            actualValue: 'on',
            expectedValue: 'on',
            evidence: null,
          },
        ],
      );

      // Create a recent scan (today)
      const recentResult = await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 2,
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        [
          {
            ruleId: 'recent-rule',
            stigId: 'RHEL-09-003',
            host: 'host1',
            status: 'pass',
            severity: 'low',
            actualValue: 'on',
            expectedValue: 'on',
            evidence: null,
          },
        ],
      );

      // Cleanup findings older than 90 days
      const deleted = await complianceDb.cleanupOldFindings(90);
      expect(deleted).toBe(2);

      // Old findings should be gone
      const oldFindings = await complianceDb.getFindingsByScanId(oldResult.scanId);
      expect(oldFindings).toHaveLength(0);

      // Recent findings should still exist
      const recentFindings = await complianceDb.getFindingsByScanId(recentResult.scanId);
      expect(recentFindings).toHaveLength(1);
      expect(recentFindings[0].ruleId).toBe('recent-rule');

      // Scan records should still exist (for history)
      const scans = await complianceDb.getRecentScans(10);
      expect(scans).toHaveLength(2);
    });

    it('returns 0 when no old findings exist', async () => {
      // Create a recent scan
      await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 1,
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        [
          {
            ruleId: 'rule-1',
            stigId: 'RHEL-09-001',
            host: 'host1',
            status: 'pass',
            severity: 'low',
            actualValue: 'on',
            expectedValue: 'on',
            evidence: null,
          },
        ],
      );

      const deleted = await complianceDb.cleanupOldFindings(90);
      expect(deleted).toBe(0);
    });

    it('returns 0 when database is empty', async () => {
      const deleted = await complianceDb.cleanupOldFindings(90);
      expect(deleted).toBe(0);
    });
  });

  // ─── getLatestFindings ───────────────────────────────────────────

  describe('getLatestFindings', () => {
    it('returns findings from the most recent completed scan', async () => {
      // Create an older completed scan with findings
      await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 1,
          status: 'completed',
          startedAt: '2026-04-29T10:00:00.000Z',
          completedAt: '2026-04-29T10:05:00.000Z',
        },
        [
          {
            ruleId: 'old-rule',
            stigId: 'RHEL-09-001',
            host: 'host1',
            status: 'fail',
            severity: 'high',
            actualValue: 'off',
            expectedValue: 'on',
            evidence: null,
          },
        ],
      );

      // Create a newer completed scan with findings
      const newResult = await complianceDb.saveScanResults(
        {
          profileId: 'rhel9-stig',
          inventoryId: 1,
          scanner: 'oscap',
          scanType: 'assessment',
          workflowJobId: 2,
          status: 'completed',
          startedAt: '2026-04-30T10:00:00.000Z',
          completedAt: '2026-04-30T10:05:00.000Z',
        },
        [
          {
            ruleId: 'new-rule',
            stigId: 'RHEL-09-002',
            host: 'host1',
            status: 'pass',
            severity: 'medium',
            actualValue: 'on',
            expectedValue: 'on',
            evidence: null,
          },
        ],
      );

      const latest = await complianceDb.getLatestFindings('rhel9-stig');
      expect(latest).toHaveLength(1);
      expect(latest[0].ruleId).toBe('new-rule');
      expect(latest[0].scanId).toBe(newResult.scanId);
    });

    it('returns empty array when no scans have findings', async () => {
      // Create a pending scan with no findings
      await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 1,
        status: 'pending',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: null,
      });

      const latest = await complianceDb.getLatestFindings('rhel9-stig');
      expect(latest).toEqual([]);
    });

    it('returns findings from a pending scan that has stored findings', async () => {
      // Simulate a scan that has findings but whose status has not yet
      // been flipped to "completed" (the status update happens lazily).
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 10,
        status: 'pending',
        startedAt: '2026-04-30T10:00:00.000Z',
        completedAt: null,
      });

      await complianceDb.saveFindingsForScan(scan.id, [
        {
          ruleId: 'pending-rule',
          stigId: 'RHEL-09-999',
          host: 'host1',
          status: 'fail',
          severity: 'high',
          actualValue: 'off',
          expectedValue: 'on',
          evidence: null,
        },
      ]);

      const latest = await complianceDb.getLatestFindings('rhel9-stig');
      expect(latest).toHaveLength(1);
      expect(latest[0].ruleId).toBe('pending-rule');
    });
  });

  // ─── Rule metadata ──────────────────────────────────────────────────

  describe('upsertRuleMetadata + getRuleMetadataBulk', () => {
    it('inserts rule metadata and retrieves it', async () => {
      const count = await complianceDb.upsertRuleMetadata([
        {
          ruleId: 'sshd_set_keepalive',
          stigId: 'RHEL-09-255040',
          title: 'Set SSH Client Alive Interval',
          description: 'Configure SSH keepalive',
          checkText: 'Verify keepalive is set',
          fixText: 'Set ClientAliveInterval to 600',
          category: 'Access Control',
          disruption: 'low',
          scanner: 'openscap',
          updatedAt: new Date().toISOString(),
        },
      ]);

      expect(count).toBe(1);

      const result = await complianceDb.getRuleMetadataBulk(['sshd_set_keepalive']);
      expect(result.size).toBe(1);
      const meta = result.get('sshd_set_keepalive')!;
      expect(meta.stigId).toBe('RHEL-09-255040');
      expect(meta.title).toBe('Set SSH Client Alive Interval');
      expect(meta.disruption).toBe('low');
    });

    it('updates an existing record on conflict (same rule_id)', async () => {
      await complianceDb.upsertRuleMetadata([
        {
          ruleId: 'accounts_tmout',
          stigId: 'RHEL-09-001',
          title: 'Original Title',
          description: 'Original',
          checkText: '',
          fixText: '',
          category: '',
          disruption: 'low',
          scanner: 'openscap',
          updatedAt: new Date().toISOString(),
        },
      ]);

      await complianceDb.upsertRuleMetadata([
        {
          ruleId: 'accounts_tmout',
          stigId: 'RHEL-09-001',
          title: 'Updated Title',
          description: 'Updated',
          checkText: 'new check',
          fixText: 'new fix',
          category: 'Access Control',
          disruption: 'medium',
          scanner: 'openscap',
          updatedAt: new Date().toISOString(),
        },
      ]);

      const result = await complianceDb.getRuleMetadataBulk(['accounts_tmout']);
      expect(result.size).toBe(1);
      const meta = result.get('accounts_tmout')!;
      expect(meta.title).toBe('Updated Title');
      expect(meta.description).toBe('Updated');
      expect(meta.disruption).toBe('medium');
    });

    it('retrieves multiple rules in bulk', async () => {
      await complianceDb.upsertRuleMetadata([
        {
          ruleId: 'rule_a',
          stigId: 'V-001',
          title: 'Rule A',
          description: '',
          checkText: '',
          fixText: '',
          category: '',
          disruption: 'low',
          scanner: 'openscap',
          updatedAt: new Date().toISOString(),
        },
        {
          ruleId: 'rule_b',
          stigId: 'V-002',
          title: 'Rule B',
          description: '',
          checkText: '',
          fixText: '',
          category: '',
          disruption: 'high',
          scanner: 'openscap',
          updatedAt: new Date().toISOString(),
        },
      ]);

      const result = await complianceDb.getRuleMetadataBulk(['rule_a', 'rule_b']);
      expect(result.size).toBe(2);
      expect(result.get('rule_a')!.title).toBe('Rule A');
      expect(result.get('rule_b')!.title).toBe('Rule B');
    });

    it('returns empty map for non-existent rule_ids', async () => {
      const result = await complianceDb.getRuleMetadataBulk(['nonexistent_rule', 'also_missing']);
      expect(result.size).toBe(0);
    });

    it('returns 0 for empty input', async () => {
      const count = await complianceDb.upsertRuleMetadata([]);
      expect(count).toBe(0);
    });
  });

  // ─── Ingest tokens ─────────────────────────────────────────────────

  describe('storeIngestToken + getIngestToken', () => {
    it('stores and retrieves an ingest token', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });

      await complianceDb.storeIngestToken(scan.id, 'test-token-123');

      const token = await complianceDb.getIngestToken(scan.id);
      expect(token).toBe('test-token-123');
    });

    it('returns null when no token is stored', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'pending',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });

      const token = await complianceDb.getIngestToken(scan.id);
      expect(token).toBeNull();
    });

    it('returns null for nonexistent scan', async () => {
      const token = await complianceDb.getIngestToken('nonexistent-scan-id');
      expect(token).toBeNull();
    });
  });

  // ─── Scan error details ───────────────────────────────────────────

  describe('updateScanErrorDetails', () => {
    it('stores and retrieves error details via getScanById', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: '2026-05-27T00:05:00.000Z',
      });

      await complianceDb.updateScanErrorDetails(
        scan.id,
        'All 10 hosts unreachable: SSH connection timed out',
      );

      const retrieved = await complianceDb.getScanById(scan.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.errorDetails).toBe(
        'All 10 hosts unreachable: SSH connection timed out',
      );
    });

    it('returns null errorDetails when no error has been stored', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });

      const retrieved = await complianceDb.getScanById(scan.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.errorDetails).toBeNull();
    });

    it('overwrites previously stored error details', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: null,
      });

      await complianceDb.updateScanErrorDetails(scan.id, 'First error');
      await complianceDb.updateScanErrorDetails(scan.id, 'Updated error details');

      const retrieved = await complianceDb.getScanById(scan.id);
      expect(retrieved!.errorDetails).toBe('Updated error details');
    });

    it('includes errorDetails in getRecentScans results', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig',
        inventoryId: 1,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: 42,
        status: 'failed',
        startedAt: '2026-05-27T00:00:00.000Z',
        completedAt: '2026-05-27T00:05:00.000Z',
      });

      await complianceDb.updateScanErrorDetails(scan.id, 'Host unreachable');

      const recent = await complianceDb.getRecentScans(10);
      expect(recent).toHaveLength(1);
      expect(recent[0].errorDetails).toBe('Host unreachable');
    });
  });

  // ─── Remediation executions (ADR-014) ───────────────────────────────

  describe('createExecution + concurrent guard', () => {
    let profileId: string;

    beforeEach(async () => {
      const result = await complianceDb.saveRemediationProfile({
        name: 'Test STIG Remediation',
        description: 'Test profile',
        profileId: 'rhel9-stig',
        selections: [{ ruleId: 'rule-1', enabled: true, parameters: {} }],
      });
      profileId = result.id;
    });

    it('creates an execution record', async () => {
      const exec = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
        informingScanId: 'scan-123',
      });
      expect(exec).not.toBeNull();
      expect(exec!.status).toBe('pending');
      expect(exec!.inventoryId).toBe(1);
      expect(exec!.remediationProfileId).toBe(profileId);
      expect(exec!.informingScanId).toBe('scan-123');
    });

    it('blocks a second execution on the same inventory (concurrent guard)', async () => {
      const first = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      expect(first).not.toBeNull();

      const second = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      expect(second).toBeNull();
    });

    it('allows execution on a different inventory', async () => {
      const first = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      const second = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 2,
      });
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
    });

    it('allows a new execution after the first completes', async () => {
      const first = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      expect(first).not.toBeNull();

      await complianceDb.updateExecutionStatus(first!.id, {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });

      const second = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      expect(second).not.toBeNull();
      expect(second!.id).not.toBe(first!.id);
    });

    it('returns the running execution for an inventory', async () => {
      await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });

      const running = await complianceDb.getRunningExecutionForInventory(1);
      expect(running).not.toBeNull();
      expect(running!.inventoryId).toBe(1);

      const empty = await complianceDb.getRunningExecutionForInventory(999);
      expect(empty).toBeNull();
    });

    it('lists executions by profile ID', async () => {
      const exec = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      await complianceDb.updateExecutionStatus(exec!.id, {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
        rulesApplied: 10,
        hostsTargeted: 5,
      });

      const list = await complianceDb.getExecutionsByProfileId(profileId);
      expect(list).toHaveLength(1);
      expect(list[0].rulesApplied).toBe(10);
      expect(list[0].hostsTargeted).toBe(5);
    });

    it('updates verification scan ID', async () => {
      const exec = await complianceDb.createExecution({
        remediationProfileId: profileId,
        inventoryId: 1,
      });
      await complianceDb.updateVerificationScanId(exec!.id, 'verify-scan-1');

      const updated = await complianceDb.getExecutionById(exec!.id);
      expect(updated!.verificationScanId).toBe('verify-scan-1');
    });
  });

  // ─── Profile status + stale recovery ──────────────────────────────

  describe('updateRemediationProfileStatus', () => {
    it('transitions profile status', async () => {
      const { id } = await complianceDb.saveRemediationProfile({
        name: 'Status Test',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
        status: 'draft',
      });

      await complianceDb.updateRemediationProfileStatus(id, 'saved');
      const profile = await complianceDb.getRemediationProfile(id);
      expect(profile!.status).toBe('saved');

      await complianceDb.updateRemediationProfileStatus(id, 'archived');
      const archived = await complianceDb.getRemediationProfile(id);
      expect(archived!.status).toBe('archived');
    });

    it('hides archived profiles from default list', async () => {
      await complianceDb.saveRemediationProfile({
        name: 'Active Profile',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
      });
      const { id: archivedId } = await complianceDb.saveRemediationProfile({
        name: 'Old Profile',
        description: '',
        profileId: 'rhel9-cis',
        selections: [],
      });
      await complianceDb.updateRemediationProfileStatus(archivedId, 'archived');

      const defaultList = await complianceDb.listRemediationProfiles();
      expect(defaultList).toHaveLength(1);
      expect(defaultList[0].name).toBe('Active Profile');

      const archivedList = await complianceDb.listRemediationProfiles('archived');
      expect(archivedList).toHaveLength(1);
      expect(archivedList[0].name).toBe('Old Profile');
    });
  });

  describe('deleteRemediationProfile guard', () => {
    it('allows deleting draft profiles', async () => {
      const { id } = await complianceDb.saveRemediationProfile({
        name: 'Draft Profile',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
        status: 'draft',
      });
      const deleted = await complianceDb.deleteRemediationProfile(id);
      expect(deleted).toBe(true);
    });

    it('allows deleting saved profiles with no executions or pins', async () => {
      const { id } = await complianceDb.saveRemediationProfile({
        name: 'Saved Profile',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
        status: 'saved',
      });
      const deleted = await complianceDb.deleteRemediationProfile(id);
      expect(deleted).toBe(true);
    });

    it('rejects deleting profiles with execution history', async () => {
      const { id } = await complianceDb.saveRemediationProfile({
        name: 'Used Profile',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
        status: 'saved',
      });
      const exec = await complianceDb.createExecution({
        remediationProfileId: id,
        inventoryId: 1,
      });
      await complianceDb.updateExecutionStatus(exec!.id, {
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });
      await expect(complianceDb.deleteRemediationProfile(id)).rejects.toThrow('execution history');
    });

    it('rejects deleting profiles pinned as baseline', async () => {
      const { id } = await complianceDb.saveRemediationProfile({
        name: 'Pinned Profile',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
        status: 'saved',
      });
      await complianceDb.pinBaselineTarget({
        remediationProfileId: id,
        complianceProfileId: 'rhel9-stig',
        inventoryId: 1,
        pinnedBy: 'test-user',
      });
      await expect(complianceDb.deleteRemediationProfile(id)).rejects.toThrow('pinned as a baseline');
    });
  });

  // ─── Baseline targets (ADR-014 §7) ────────────────────────────────

  describe('baseline targets', () => {
    let profileId: string;

    beforeEach(async () => {
      const result = await complianceDb.saveRemediationProfile({
        name: 'Golden Standard',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
      });
      profileId = result.id;
    });

    it('pins and unpins a baseline target', async () => {
      const target = await complianceDb.pinBaselineTarget({
        remediationProfileId: profileId,
        complianceProfileId: 'rhel9-stig',
        inventoryId: 1,
        pinnedBy: 'test-user',
      });
      expect(target.inventoryId).toBe(1);
      expect(target.pinnedBy).toBe('test-user');

      const isPinned = await complianceDb.isProfilePinnedAsBaseline(profileId);
      expect(isPinned).toBe(true);

      await complianceDb.unpinBaselineTarget(target.id);
      const isStillPinned = await complianceDb.isProfilePinnedAsBaseline(profileId);
      expect(isStillPinned).toBe(false);
    });

    it('enforces one golden standard per compliance profile + inventory', async () => {
      await complianceDb.pinBaselineTarget({
        remediationProfileId: profileId,
        complianceProfileId: 'rhel9-stig',
        inventoryId: 1,
      });
      await expect(
        complianceDb.pinBaselineTarget({
          remediationProfileId: profileId,
          complianceProfileId: 'rhel9-stig',
          inventoryId: 1,
        }),
      ).rejects.toThrow();
    });

    it('allows different inventories for the same compliance profile', async () => {
      const t1 = await complianceDb.pinBaselineTarget({
        remediationProfileId: profileId,
        complianceProfileId: 'rhel9-stig',
        inventoryId: 1,
      });
      const t2 = await complianceDb.pinBaselineTarget({
        remediationProfileId: profileId,
        complianceProfileId: 'rhel9-stig',
        inventoryId: 2,
      });
      expect(t1.id).not.toBe(t2.id);

      const targets = await complianceDb.getBaselineTargetsForProfile('rhel9-stig');
      expect(targets).toHaveLength(2);
    });
  });

  // ─── Stale execution recovery ─────────────────────────────────────

  describe('getStaleRunningExecutions', () => {
    it('returns executions older than threshold', async () => {
      const { id: profileId } = await complianceDb.saveRemediationProfile({
        name: 'Stale Test',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
      });
      // Insert an execution with a very old started_at directly
      const execId = 'stale-exec-1';
      const fiveHoursAgo = new Date();
      fiveHoursAgo.setHours(fiveHoursAgo.getHours() - 5);
      await db('compliance_remediation_executions').insert({
        id: execId,
        remediation_profile_id: profileId,
        inventory_id: 99,
        status: 'running',
        started_at: fiveHoursAgo.toISOString(),
      });

      const stale = await complianceDb.getStaleRunningExecutions(4);
      expect(stale).toHaveLength(1);
      expect(stale[0].id).toBe(execId);

      const notStale = await complianceDb.getStaleRunningExecutions(6);
      expect(notStale).toHaveLength(0);
    });

    it('includes pending executions', async () => {
      const { id: profileId } = await complianceDb.saveRemediationProfile({
        name: 'Stale Pending',
        description: '',
        profileId: 'rhel9-stig',
        selections: [],
      });
      const fiveHoursAgo = new Date();
      fiveHoursAgo.setHours(fiveHoursAgo.getHours() - 5);
      await db('compliance_remediation_executions').insert({
        id: 'stale-pending-1',
        remediation_profile_id: profileId,
        inventory_id: 98,
        status: 'pending',
        started_at: fiveHoursAgo.toISOString(),
      });

      const stale = await complianceDb.getStaleRunningExecutions(4);
      expect(stale).toHaveLength(1);
      expect(stale[0].status).toBe('pending');
    });
  });

  // ─── computeFindingStates (ADR-016 Layer 2) ─────────────────────────

  describe('computeFindingStates', () => {
    const PROFILE = 'rhel9-stig';
    const INVENTORY = 1;

    async function createCompletedScan(startedAt: string) {
      const scan = await complianceDb.createScan({
        profileId: PROFILE,
        inventoryId: INVENTORY,
        scanner: 'oscap',
        scanType: 'assessment',
        workflowJobId: null,
        status: 'completed',
        startedAt,
        completedAt: startedAt,
        errorDetails: null,
      });
      return scan;
    }

    function makeFinding(scanId: string, ruleId: string, host: string, status: string) {
      return { scanId, ruleId, stigId: '', host, status, severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null };
    }

    it('marks all failures as "new" when no previous scan exists', async () => {
      const scan = await createCompletedScan('2026-06-01T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan.id, [
        makeFinding(scan.id, 'rule_a', 'host1', 'fail'),
        makeFinding(scan.id, 'rule_b', 'host1', 'pass'),
      ]);

      await complianceDb.computeFindingStates(scan.id, PROFILE, INVENTORY);

      const findings = await complianceDb.getFindingsByScanId(scan.id);
      const ruleA = findings.find(f => f.ruleId === 'rule_a');
      const ruleB = findings.find(f => f.ruleId === 'rule_b');
      expect(ruleA?.findingState).toBe('new');
      expect(ruleB?.findingState).toBeNull();
    });

    it('marks persistent failures as "active"', async () => {
      const scan1 = await createCompletedScan('2026-06-01T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan1.id, [
        makeFinding(scan1.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan1.id, PROFILE, INVENTORY);

      const scan2 = await createCompletedScan('2026-06-02T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan2.id, [
        makeFinding(scan2.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan2.id, PROFILE, INVENTORY);

      const findings = await complianceDb.getFindingsByScanId(scan2.id);
      expect(findings[0].findingState).toBe('active');
    });

    it('marks remediated findings as "fixed"', async () => {
      const scan1 = await createCompletedScan('2026-06-01T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan1.id, [
        makeFinding(scan1.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan1.id, PROFILE, INVENTORY);

      const scan2 = await createCompletedScan('2026-06-02T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan2.id, [
        makeFinding(scan2.id, 'rule_a', 'host1', 'pass'),
      ]);
      await complianceDb.computeFindingStates(scan2.id, PROFILE, INVENTORY);

      const findings = await complianceDb.getFindingsByScanId(scan2.id);
      expect(findings[0].findingState).toBe('fixed');
    });

    it('marks regressions after remediation as "resurfaced"', async () => {
      // Scan 1: failing
      const scan1 = await createCompletedScan('2026-06-01T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan1.id, [
        makeFinding(scan1.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan1.id, PROFILE, INVENTORY);

      // Scan 2: fixed
      const scan2 = await createCompletedScan('2026-06-02T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan2.id, [
        makeFinding(scan2.id, 'rule_a', 'host1', 'pass'),
      ]);
      await complianceDb.computeFindingStates(scan2.id, PROFILE, INVENTORY);

      // Scan 3: resurfaced (was fixed, now failing again)
      const scan3 = await createCompletedScan('2026-06-03T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan3.id, [
        makeFinding(scan3.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan3.id, PROFILE, INVENTORY);

      const findings = await complianceDb.getFindingsByScanId(scan3.id);
      expect(findings[0].findingState).toBe('resurfaced');
    });

    it('marks first-time failure from always-passing as "new" (not resurfaced)', async () => {
      const scan1 = await createCompletedScan('2026-06-01T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan1.id, [
        makeFinding(scan1.id, 'rule_a', 'host1', 'pass'),
      ]);
      await complianceDb.computeFindingStates(scan1.id, PROFILE, INVENTORY);

      const scan2 = await createCompletedScan('2026-06-02T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan2.id, [
        makeFinding(scan2.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan2.id, PROFILE, INVENTORY);

      const findings = await complianceDb.getFindingsByScanId(scan2.id);
      expect(findings[0].findingState).toBe('new');
    });

    it('handles mixed states across hosts for the same rule', async () => {
      const scan1 = await createCompletedScan('2026-06-01T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan1.id, [
        makeFinding(scan1.id, 'rule_a', 'host1', 'fail'),
        makeFinding(scan1.id, 'rule_a', 'host2', 'pass'),
      ]);
      await complianceDb.computeFindingStates(scan1.id, PROFILE, INVENTORY);

      const scan2 = await createCompletedScan('2026-06-02T10:00:00Z');
      await complianceDb.saveFindingsForScan(scan2.id, [
        makeFinding(scan2.id, 'rule_a', 'host1', 'pass'),
        makeFinding(scan2.id, 'rule_a', 'host2', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan2.id, PROFILE, INVENTORY);

      const findings = await complianceDb.getFindingsByScanId(scan2.id);
      const host1 = findings.find(f => f.host === 'host1');
      const host2 = findings.find(f => f.host === 'host2');
      expect(host1?.findingState).toBe('fixed');
      expect(host2?.findingState).toBe('new');
    });

    it('does not cross-contaminate between inventories', async () => {
      const scan1 = await complianceDb.createScan({
        profileId: PROFILE, inventoryId: 1, scanner: 'oscap', scanType: 'assessment',
        workflowJobId: null, status: 'completed', startedAt: '2026-06-01T10:00:00Z', completedAt: '2026-06-01T10:00:00Z', errorDetails: null,
      });
      await complianceDb.saveFindingsForScan(scan1.id, [
        makeFinding(scan1.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan1.id, PROFILE, 1);

      // Different inventory — should have no previous scan context
      const scan2 = await complianceDb.createScan({
        profileId: PROFILE, inventoryId: 2, scanner: 'oscap', scanType: 'assessment',
        workflowJobId: null, status: 'completed', startedAt: '2026-06-02T10:00:00Z', completedAt: '2026-06-02T10:00:00Z', errorDetails: null,
      });
      await complianceDb.saveFindingsForScan(scan2.id, [
        makeFinding(scan2.id, 'rule_a', 'host1', 'fail'),
      ]);
      await complianceDb.computeFindingStates(scan2.id, PROFILE, 2);

      const findings = await complianceDb.getFindingsByScanId(scan2.id);
      expect(findings[0].findingState).toBe('new');
    });
  });

  // ─── getBatchScanStatsAggregated with state counts ─────────────────

  describe('getBatchScanStatsAggregated state counts', () => {
    it('returns state counts alongside pass/fail', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig', inventoryId: 1, scanner: 'oscap', scanType: 'assessment',
        workflowJobId: null, status: 'completed', startedAt: '2026-06-01T10:00:00Z', completedAt: '2026-06-01T10:00:00Z', errorDetails: null,
      });
      await complianceDb.saveFindingsForScan(scan.id, [
        { scanId: scan.id, ruleId: 'r1', stigId: '', host: 'h1', status: 'fail', severity: 'CAT_I', actualValue: '', expectedValue: '', evidence: null, findingState: 'new' },
        { scanId: scan.id, ruleId: 'r2', stigId: '', host: 'h1', status: 'fail', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: 'resurfaced' },
        { scanId: scan.id, ruleId: 'r3', stigId: '', host: 'h1', status: 'pass', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: 'fixed' },
        { scanId: scan.id, ruleId: 'r4', stigId: '', host: 'h1', status: 'pass', severity: 'CAT_III', actualValue: '', expectedValue: '', evidence: null, findingState: null },
      ]);

      const stats = await complianceDb.getBatchScanStatsAggregated([scan.id]);
      expect(stats[scan.id]).toMatchObject({
        pass: 2,
        fail: 2,
        stateNew: 1,
        stateFixed: 1,
        stateResurfaced: 1,
      });
    });

    it('excludes not_applicable rows from rule/host counts and exposes naCount', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig', inventoryId: 1, scanner: 'oscap', scanType: 'assessment',
        workflowJobId: null, status: 'completed', startedAt: '2026-06-02T10:00:00Z', completedAt: '2026-06-02T10:00:00Z', errorDetails: null,
      });
      await complianceDb.saveFindingsForScan(scan.id, [
        { scanId: scan.id, ruleId: 'r-pass', stigId: '', host: 'h1', status: 'pass', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { scanId: scan.id, ruleId: 'r-na-1', stigId: '', host: 'h1', status: 'not_applicable', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { scanId: scan.id, ruleId: 'r-na-2', stigId: '', host: 'h1', status: 'not_applicable', severity: 'CAT_III', actualValue: '', expectedValue: '', evidence: null, findingState: null },
      ]);

      const stats = await complianceDb.getBatchScanStatsAggregated([scan.id]);
      expect(stats[scan.id]).toMatchObject({
        pass: 1,
        fail: 0,
        rules: 1,
        naCount: 2,
      });
    });
  });

  // ─── getNotApplicableRules ─────────────────────────────────────────

  describe('getNotApplicableRules', () => {
    it('returns distinct N/A rules joined with rule metadata titles', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig', inventoryId: 1, scanner: 'oscap', scanType: 'assessment',
        workflowJobId: null, status: 'completed', startedAt: '2026-06-03T10:00:00Z', completedAt: '2026-06-03T10:00:00Z', errorDetails: null,
      });
      await complianceDb.upsertRuleMetadata([
        { ruleId: 'rule-na-1', stigId: '', title: 'Disable USB Storage', description: '', checkText: '', fixText: '', category: '', disruption: 'low', scanner: 'openscap', updatedAt: '2026-06-03T10:00:00Z' },
      ]);
      await complianceDb.saveFindingsForScan(scan.id, [
        { scanId: scan.id, ruleId: 'rule-na-1', stigId: '', host: 'h1', status: 'not_applicable', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { scanId: scan.id, ruleId: 'rule-na-1', stigId: '', host: 'h2', status: 'not_applicable', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { scanId: scan.id, ruleId: 'rule-na-2', stigId: '', host: 'h1', status: 'not_applicable', severity: 'CAT_I', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { scanId: scan.id, ruleId: 'rule-pass', stigId: '', host: 'h1', status: 'pass', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
      ]);

      const rules = await complianceDb.getNotApplicableRules(scan.id);
      // Returns distinct rules (not per-host), non-applicable only
      expect(rules).toHaveLength(2);
      const na1 = rules.find(r => r.ruleId === 'rule-na-1');
      expect(na1?.ruleTitle).toBe('Disable USB Storage'); // from rule_metadata JOIN
      const na2 = rules.find(r => r.ruleId === 'rule-na-2');
      expect(na2?.ruleTitle).toBe('rule-na-2'); // COALESCE fallback: no metadata → use rule_id
    });

    it('returns empty array when scan has no N/A findings', async () => {
      const scan = await complianceDb.createScan({
        profileId: 'rhel9-stig', inventoryId: 1, scanner: 'oscap', scanType: 'assessment',
        workflowJobId: null, status: 'completed', startedAt: '2026-06-04T10:00:00Z', completedAt: '2026-06-04T10:00:00Z', errorDetails: null,
      });
      await complianceDb.saveFindingsForScan(scan.id, [
        { scanId: scan.id, ruleId: 'r1', stigId: '', host: 'h1', status: 'pass', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
      ]);

      const rules = await complianceDb.getNotApplicableRules(scan.id);
      expect(rules).toHaveLength(0);
    });
  });

  describe('getDeltaBetweenScans', () => {
    it('computes fixed/regressed/unchanged between two scans', async () => {
      await db('compliance_scans').insert({ id: 'delta-s1', profile_id: 'p1', inventory_id: 1, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 100, status: 'completed', started_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-01T00:01:00Z' });
      await db('compliance_scans').insert({ id: 'delta-s2', profile_id: 'p1', inventory_id: 1, scanner: 'oscap', scan_type: 'verification', workflow_job_id: 101, status: 'completed', started_at: '2026-06-01T01:00:00Z', completed_at: '2026-06-01T01:01:00Z' });
      await complianceDb.saveFindingsForScan('delta-s1', [
        { ruleId: 'rule1', stigId: 'V-1', host: 'h1', status: 'fail', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { ruleId: 'rule2', stigId: 'V-2', host: 'h1', status: 'pass', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { ruleId: 'rule3', stigId: 'V-3', host: 'h1', status: 'fail', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
      ]);
      await complianceDb.saveFindingsForScan('delta-s2', [
        { ruleId: 'rule1', stigId: 'V-1', host: 'h1', status: 'pass', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { ruleId: 'rule2', stigId: 'V-2', host: 'h1', status: 'fail', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
        { ruleId: 'rule3', stigId: 'V-3', host: 'h1', status: 'fail', severity: 'CAT_II', actualValue: '', expectedValue: '', evidence: null, findingState: null },
      ]);
      const delta = await complianceDb.getDeltaBetweenScans('delta-s1', 'delta-s2');
      expect(delta.fixed).toBe(1);
      expect(delta.regressed).toBe(1);
      expect(delta.unchanged).toBe(1);
    });

    it('returns zeros for scans with no common findings', async () => {
      await db('compliance_scans').insert({ id: 'empty-s1', profile_id: 'p1', inventory_id: 1, scanner: 'oscap', scan_type: 'assessment', workflow_job_id: 200, status: 'completed', started_at: '2026-06-02T00:00:00Z', completed_at: '2026-06-02T00:01:00Z' });
      await db('compliance_scans').insert({ id: 'empty-s2', profile_id: 'p1', inventory_id: 1, scanner: 'oscap', scan_type: 'verification', workflow_job_id: 201, status: 'completed', started_at: '2026-06-02T01:00:00Z', completed_at: '2026-06-02T01:01:00Z' });
      const delta = await complianceDb.getDeltaBetweenScans('empty-s1', 'empty-s2');
      expect(delta.fixed).toBe(0);
      expect(delta.regressed).toBe(0);
      expect(delta.unchanged).toBe(0);
    });
  });

  describe('draft upsert', () => {
    it('updates existing draft with same name and profileId instead of inserting', async () => {
      const first = await complianceDb.saveRemediationProfile({
        name: 'Upsert Test', description: '', profileId: 'rhel9-stig',
        selections: [], status: 'draft',
      });
      const second = await complianceDb.saveRemediationProfile({
        name: 'Upsert Test', description: 'updated', profileId: 'rhel9-stig',
        selections: [], status: 'draft',
      });
      expect(second.id).toBe(first.id);
      const rows = await db('compliance_remediation_profiles')
        .where({ name: 'Upsert Test', profile_id: 'rhel9-stig', status: 'draft' });
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toBe('updated');
    });

    it('inserts new row when saving as saved status', async () => {
      const draft = await complianceDb.saveRemediationProfile({
        name: 'Status Test', description: '', profileId: 'rhel9-stig',
        selections: [], status: 'draft',
      });
      const saved = await complianceDb.saveRemediationProfile({
        name: 'Status Test', description: '', profileId: 'rhel9-stig',
        selections: [], status: 'saved',
      });
      expect(saved.id).not.toBe(draft.id);
    });
  });
});
