'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_rule_metadata', table => {
    table.string('aap_impact').notNullable().defaultTo('safe');
    table.text('aap_impact_reason').notNullable().defaultTo('');
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_rule_metadata', table => {
    table.dropColumn('aap_impact_reason');
    table.dropColumn('aap_impact');
  });
}
