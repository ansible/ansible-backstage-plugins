/**
 * Add ingest_token column to compliance_scans table.
 *
 * Per-scan ingest tokens were previously stored in-process memory, which
 * meant they were lost on server restart and not shared across replicas.
 * Persisting them in the database ensures tokens survive restarts and
 * work correctly in multi-replica deployments.
 *
 * See ADR-010 for the ingest token security model.
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260527_004_ingest_token.js (used by dist-dynamic).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.string('ingest_token').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('ingest_token');
  });
}
