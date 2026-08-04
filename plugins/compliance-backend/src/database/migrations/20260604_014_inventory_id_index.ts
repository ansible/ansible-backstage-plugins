import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.index(['inventory_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropIndex(['inventory_id']);
  });
}
