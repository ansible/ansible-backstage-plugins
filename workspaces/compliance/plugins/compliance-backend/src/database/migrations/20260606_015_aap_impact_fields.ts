import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_rule_metadata', table => {
    table.string('aap_impact').notNullable().defaultTo('safe');
    table.text('aap_impact_reason').notNullable().defaultTo('');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_rule_metadata', table => {
    table.dropColumn('aap_impact_reason');
    table.dropColumn('aap_impact');
  });
}
