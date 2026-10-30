/**
 * Add normalized rule metadata table.
 * Compiled JS copy for dist-dynamic packaging.
 */
async function up(knex) {
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

async function down(knex) {
  await knex.schema.dropTableIfExists('compliance_rule_metadata');
}

module.exports = { up, down };
