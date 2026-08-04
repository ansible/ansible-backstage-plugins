'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.integer('rule_count').nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropColumn('rule_count');
  });
}
