"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_posture_snapshots', table => {
    table.integer('inventory_id').nullable();
    table.string('scan_id').nullable();
    table.index(['inventory_id']);
    table.index(['scan_id']);
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_posture_snapshots', table => {
    table.dropColumn('scan_id');
    table.dropColumn('inventory_id');
  });
}
