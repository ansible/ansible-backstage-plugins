import knex from 'knex';
import type { Knex } from 'knex';
import { MockDataSeeder } from './MockDataSeeder';
import type { LoggerService } from '@backstage/backend-plugin-api';

const logger: LoggerService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: () => logger,
};

let db: Knex;

async function runMigrations(client: Knex) {
  const path = require('path');
  const fs = require('fs');
  const tsMigrations = path.resolve(__dirname, '..', 'database', 'migrations');
  const jsMigrations = path.resolve(__dirname, '..', '..', 'migrations');
  // Prefer TS source dir, but use JS dir if it has more migrations (022, 023 are JS-only)
  let dir = tsMigrations;
  if (fs.existsSync(jsMigrations)) {
    const tsCount = fs.readdirSync(tsMigrations).filter((f: string) => f.endsWith('.ts')).length;
    const jsCount = fs.readdirSync(jsMigrations).filter((f: string) => f.endsWith('.js')).length;
    if (jsCount > tsCount) dir = jsMigrations;
  }
  await client.migrate.latest({
    directory: dir,
    tableName: 'compliance_knex_migrations',
  });
}

beforeEach(async () => {
  db = knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  });
  await runMigrations(db);
});

afterEach(async () => {
  await db.destroy();
});

describe('MockDataSeeder', () => {
  it('seeds all 9 tables with expected row counts', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();

    const profiles = await db('compliance_profile_registry').count('* as cnt');
    expect(Number(profiles[0].cnt)).toBe(4);

    const rules = await db('compliance_rule_metadata').count('* as cnt');
    expect(Number(rules[0].cnt)).toBe(17);

    const scans = await db('compliance_scans').count('* as cnt');
    expect(Number(scans[0].cnt)).toBe(8);

    const findings = await db('compliance_findings').count('* as cnt');
    expect(Number(findings[0].cnt)).toBeGreaterThan(500);

    const snapshots = await db('compliance_posture_snapshots').count('* as cnt');
    expect(Number(snapshots[0].cnt)).toBe(14);

    const remProfiles = await db('compliance_remediation_profiles').count('* as cnt');
    expect(Number(remProfiles[0].cnt)).toBe(3);

    const executions = await db('compliance_remediation_executions').count('* as cnt');
    expect(Number(executions[0].cnt)).toBe(3);

    const baselines = await db('compliance_baseline_targets').count('* as cnt');
    expect(Number(baselines[0].cnt)).toBe(1);

    const artifacts = await db('compliance_scan_artifacts').count('* as cnt');
    expect(Number(artifacts[0].cnt)).toBe(2);
  });

  it('is idempotent — running twice produces same row counts', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();
    const countBefore = Number((await db('compliance_scans').count('* as cnt'))[0].cnt);

    await seeder.seed();
    const countAfter = Number((await db('compliance_scans').count('* as cnt'))[0].cnt);

    expect(countAfter).toBe(countBefore);
  });

  it('seeds profiles with valid slugs and display configs', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();

    const profiles = await db('compliance_profile_registry').select('*');
    for (const p of profiles) {
      expect(p.profile_slug).toBeTruthy();
      expect(p.display_config).toBeTruthy();
      const config = JSON.parse(p.display_config as string);
      expect(config.gauge_label).toBeTruthy();
      expect(config.columns).toBeInstanceOf(Array);
    }

    const sc = profiles.find((p: any) => p.id === 'supply-chain-vuln');
    expect(sc).toBeTruthy();
    const scConfig = JSON.parse(sc!.display_config as string);
    expect(scConfig.score_formula).toBe('vulnerability_free_rate');
    expect(scConfig.tab).toBeTruthy();
    expect(scConfig.tab.layout.length).toBeGreaterThan(0);
  });

  it('seeds findings with finding_state values', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();

    const states = await db('compliance_findings')
      .whereNotNull('finding_state')
      .select('finding_state')
      .groupBy('finding_state');
    const stateValues = states.map((s: any) => s.finding_state);

    expect(stateValues).toContain('active');
    expect(stateValues).toContain('new');
    expect(stateValues).toContain('fixed');
    expect(stateValues).toContain('resurfaced');
  });

  it('seeds cross-references correctly', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();

    // Findings reference valid scans
    const orphanFindings = await db('compliance_findings as f')
      .leftJoin('compliance_scans as s', 'f.scan_id', 's.id')
      .whereNull('s.id')
      .count('* as cnt');
    expect(Number(orphanFindings[0].cnt)).toBe(0);

    // Baseline targets reference valid profiles
    const baseline = await db('compliance_baseline_targets').first();
    expect(baseline).toBeTruthy();
    const remProfile = await db('compliance_remediation_profiles')
      .where('id', baseline.remediation_profile_id)
      .first();
    expect(remProfile).toBeTruthy();
    const compProfile = await db('compliance_profile_registry')
      .where('id', baseline.compliance_profile_id)
      .first();
    expect(compProfile).toBeTruthy();

    // Executions reference valid remediation profiles
    const exec = await db('compliance_remediation_executions').where('id', 'mock-exec-001').first();
    expect(exec).toBeTruthy();
    expect(exec.verification_scan_id).toBe('mock-scan-verify-001');
    const verifyScan = await db('compliance_scans').where('id', 'mock-scan-verify-001').first();
    expect(verifyScan).toBeTruthy();
  });

  it('seeds supply chain scan metadata with package counts', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();

    const scScan = await db('compliance_scans').where('id', 'mock-scan-sc-prod-002').first();
    expect(scScan).toBeTruthy();
    expect(scScan.scan_metadata).toBeTruthy();
    const meta = JSON.parse(scScan.scan_metadata as string);
    expect(meta.totalScannedPackages).toBeGreaterThan(0);
    expect(meta.totalVulnerablePackages).toBeGreaterThan(0);
    expect(meta.hosts).toBeTruthy();
    expect(Object.keys(meta.hosts).length).toBe(20);
  });

  it('seeds not-applicable findings', async () => {
    const seeder = new MockDataSeeder(db, logger);
    await seeder.seed();

    const naFindings = await db('compliance_findings')
      .where('status', 'notapplicable')
      .count('* as cnt');
    expect(Number(naFindings[0].cnt)).toBeGreaterThan(0);
  });
});
