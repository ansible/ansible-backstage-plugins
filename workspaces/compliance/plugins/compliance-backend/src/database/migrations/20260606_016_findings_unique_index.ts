import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Remove duplicate rows before adding the constraint — keep the first
  // inserted row (MIN(id)) for each (scan_id, rule_id, host) group.
  await knex.raw(`
    DELETE FROM compliance_findings WHERE id NOT IN (
      SELECT MIN(id) FROM compliance_findings GROUP BY scan_id, rule_id, host
    )
  `);

  await knex.schema.alterTable('compliance_findings', table => {
    table.unique(['scan_id', 'rule_id', 'host']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('compliance_findings', table => {
    table.dropUnique(['scan_id', 'rule_id', 'host']);
  });
}
