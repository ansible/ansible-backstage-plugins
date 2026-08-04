/**
 * Add platform_spec column to compliance_cartridge_registry table.
 *
 * Stores structured platform requirements (ADR-011) as a JSON TEXT column.
 * The existing `platform` column (display name like "RHEL 9") is kept as-is.
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260528_006_platform_spec.js (used by dist-dynamic).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_cartridge_registry', table => {
    table.text('platform_spec').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_cartridge_registry', table => {
    table.dropColumn('platform_spec');
  });
}
