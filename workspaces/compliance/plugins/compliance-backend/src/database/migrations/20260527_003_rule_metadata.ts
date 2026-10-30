/**
 * Add normalized rule metadata table.
 *
 * Rule metadata (title, description, fix_text, check_text, etc.) is stored
 * once per rule_id rather than duplicated across every finding row. Populated
 * during findings ingest from the scanner's full output (e.g., XCCDF
 * datastream via normalize_xccdf). Falls back to YAML files for rules not
 * seen via ingest.
 *
 * IMPORTANT: When modifying this file, also update the compiled JS copy
 * at ../../migrations/20260527_003_rule_metadata.js (used by dist-dynamic).
 */
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('compliance_rule_metadata', table => {
    table.string('rule_id').primary();
    table.string('stig_id').notNullable().defaultTo('');
    table.text('title').notNullable().defaultTo('');
    table.text('description').notNullable().defaultTo('');
    table.text('check_text').notNullable().defaultTo('');
    table.text('fix_text').notNullable().defaultTo('');
    table.string('category').notNullable().defaultTo('');
    table.string('disruption').notNullable().defaultTo('medium');
    table.string('scanner').notNullable().defaultTo('');
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('compliance_rule_metadata');
}
