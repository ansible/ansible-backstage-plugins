import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Rename scan_id → creation_scan_id on remediation profiles (Q7)
  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.renameColumn('scan_id', 'creation_scan_id');
  });

  // 2. Add lifecycle columns to remediation profiles (ADR-014 §2)
  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.string('status').notNullable().defaultTo('saved');
    table.string('created_by').nullable();
  });

  // 3. Create execution history table (ADR-014 §1)
  await knex.schema.createTable('compliance_remediation_executions', table => {
    table.string('id').primary();
    table
      .string('remediation_profile_id')
      .notNullable()
      .references('id')
      .inTable('compliance_remediation_profiles')
      .onDelete('RESTRICT');
    table.integer('inventory_id').notNullable();
    table.string('informing_scan_id').nullable();
    table.integer('primary_job_id').nullable();
    table.text('all_job_ids').nullable(); // JSON array
    table.string('status').notNullable().defaultTo('pending');
    table.string('started_at').notNullable();
    table.string('completed_at').nullable();
    table.float('elapsed_seconds').nullable();
    table.integer('rules_applied').nullable();
    table.integer('rules_failed').nullable();
    table.integer('hosts_targeted').nullable();
    table.integer('hosts_succeeded').nullable();
    table.integer('hosts_failed').nullable();
    table.text('plan_summary').nullable(); // JSON serialized RemediationPlan
    table.string('verification_scan_id').nullable();
    table.string('created_by').nullable();

    table.index(['remediation_profile_id']);
    table.index(['started_at']);
  });

  // Partial unique index for concurrent execution guard (ADR-014 §6)
  // Ensures at most one pending/running execution per inventory
  await knex.raw(`
    CREATE UNIQUE INDEX idx_one_active_per_inventory
    ON compliance_remediation_executions (inventory_id)
    WHERE status IN ('pending', 'running')
  `);

  // 4. Create baseline targets table (ADR-014 §7)
  await knex.schema.createTable('compliance_baseline_targets', table => {
    table.string('id').primary();
    table
      .string('remediation_profile_id')
      .notNullable()
      .references('id')
      .inTable('compliance_remediation_profiles')
      .onDelete('RESTRICT');
    table.string('compliance_profile_id').notNullable();
    table.integer('inventory_id').notNullable();
    table.string('pinned_at').notNullable();
    table.string('pinned_by').nullable();

    table.unique(['compliance_profile_id', 'inventory_id']);
  });

  // 5. Backfill: derive execution records from existing remediation scan records
  const remediationScans = await knex('compliance_scans')
    .where('scanner', 'remediation')
    .orderBy('started_at', 'asc');

  for (const scan of remediationScans) {
    // Match to a remediation profile by profile_id
    const profile = await knex('compliance_remediation_profiles')
      .where('profile_id', scan.profile_id)
      .first();

    if (!profile) {
      // Skip unmatched records — best-effort backfill
      continue;
    }

    let status = 'failed';
    if (scan.status === 'completed') {
      status = 'succeeded';
    } else if (scan.status === 'failed') {
      status = 'failed';
    } else if (scan.status === 'cancelled') {
      status = 'cancelled';
    }

    // Use try-catch to skip duplicates (partial unique index may reject)
    try {
      await knex('compliance_remediation_executions').insert({
        id: `backfill-${scan.id}`,
        remediation_profile_id: profile.id,
        inventory_id: scan.inventory_id || 0,
        informing_scan_id: null,
        primary_job_id: scan.workflow_job_id,
        all_job_ids: scan.workflow_job_id
          ? JSON.stringify([scan.workflow_job_id])
          : null,
        status,
        started_at: scan.started_at,
        completed_at: scan.completed_at,
        elapsed_seconds: null,
        rules_applied: null,
        rules_failed: null,
        hosts_targeted: null,
        hosts_succeeded: null,
        hosts_failed: null,
        plan_summary: null,
        verification_scan_id: null,
        created_by: null,
      });
    } catch {
      // Skip on constraint violation (e.g., duplicate inventory for running status)
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('compliance_baseline_targets');
  await knex.schema.dropTableIfExists('compliance_remediation_executions');

  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.dropColumn('status');
    table.dropColumn('created_by');
  });

  await knex.schema.alterTable('compliance_remediation_profiles', table => {
    table.renameColumn('creation_scan_id', 'scan_id');
  });
}
