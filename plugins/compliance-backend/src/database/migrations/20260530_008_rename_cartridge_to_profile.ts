/**
 * Rename compliance_cartridge_registry table to compliance_profile_registry.
 * Aligns internal naming with user-facing "compliance profile" terminology.
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.renameTable(
    'compliance_cartridge_registry',
    'compliance_profile_registry',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.renameTable(
    'compliance_profile_registry',
    'compliance_cartridge_registry',
  );
}
