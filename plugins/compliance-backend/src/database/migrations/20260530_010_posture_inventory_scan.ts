import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_posture_snapshots', table => {
    table.integer('inventory_id').nullable();
    table.string('scan_id').nullable();
    table.index(['inventory_id']);
    table.index(['scan_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_posture_snapshots', table => {
    table.dropColumn('scan_id');
    table.dropColumn('inventory_id');
  });
}
