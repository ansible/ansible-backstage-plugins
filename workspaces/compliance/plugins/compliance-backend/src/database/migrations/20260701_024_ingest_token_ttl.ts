/**
 * Add ingest_token_created_at column to compliance_scans table.
 *
 * Hardens the per-scan ingest token (ADR-010) with a time-to-live: tokens
 * older than a configurable TTL (default 60 minutes, see
 * `ansible.compliance.ingestTokenTtlMinutes`) are rejected even if they
 * still match, closing the window for a leaked/replayed token to be used
 * indefinitely. Paired with a scan-state guard and invalidation on
 * finalize — see `ComplianceDatabase.isIngestTokenValid()` and
 * `invalidateIngestToken()`.
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260701_024_ingest_token_ttl.js (used by dist-dynamic).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.timestamp('ingest_token_created_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('ingest_token_created_at');
  });
}
