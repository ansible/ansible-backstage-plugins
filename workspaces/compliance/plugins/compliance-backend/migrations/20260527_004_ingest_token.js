"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_scans', table => {
    table.string('ingest_token').nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('ingest_token');
  });
}
