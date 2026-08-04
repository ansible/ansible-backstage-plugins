import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_findings', table => {
    table.string('finding_state').nullable();
    table.index(['finding_state']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_findings', table => {
    table.dropIndex(['finding_state']);
    table.dropColumn('finding_state');
  });
}
