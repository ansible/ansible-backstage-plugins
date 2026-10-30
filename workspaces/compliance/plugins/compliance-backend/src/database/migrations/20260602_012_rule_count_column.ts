import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.integer('rule_count').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropColumn('rule_count');
  });
}
