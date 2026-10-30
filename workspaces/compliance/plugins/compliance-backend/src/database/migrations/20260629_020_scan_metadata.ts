import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.text('scan_metadata').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('scan_metadata');
  });
}
