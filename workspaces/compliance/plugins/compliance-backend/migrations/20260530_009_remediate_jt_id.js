'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.integer('remediate_jt_id').nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropColumn('remediate_jt_id');
  });
}
