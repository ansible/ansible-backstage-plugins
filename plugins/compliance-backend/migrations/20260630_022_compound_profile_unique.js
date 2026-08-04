'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['framework']);
    table.unique(['framework', 'display_name']);
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropUnique(['framework', 'display_name']);
    table.unique(['framework']);
  });
}
