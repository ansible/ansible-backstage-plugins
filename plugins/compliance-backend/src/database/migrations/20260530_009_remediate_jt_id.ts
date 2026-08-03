import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.integer('remediate_jt_id').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropColumn('remediate_jt_id');
  });
}
