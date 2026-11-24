import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // SQLite recreates tables on ALTER — disable FK checks to prevent cascading failures
  await knex.raw('PRAGMA foreign_keys = OFF').catch(() => {});
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['framework']);
    table.unique(['framework', 'display_name']);
  });
  await knex.raw('PRAGMA foreign_keys = ON').catch(() => {});
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('PRAGMA foreign_keys = OFF').catch(() => {});
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['framework', 'display_name']);
    table.unique(['framework']);
  });
  await knex.raw('PRAGMA foreign_keys = ON').catch(() => {});
}
