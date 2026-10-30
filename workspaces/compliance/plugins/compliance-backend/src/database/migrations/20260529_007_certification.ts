/**
 * Add certification column to compliance_cartridge_registry table.
 *
 * Stores scanner certification metadata as a JSON TEXT column.
 * Values: {status: 'certified'|'conformant'|'uncertified', authority: string}
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260529_007_certification.js (used by dist-dynamic).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('compliance_cartridge_registry', 'certification'))) {
    await knex.schema.alterTable('compliance_cartridge_registry', table => {
      table.text('certification').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_cartridge_registry', table => {
    table.dropColumn('certification');
  });
}
