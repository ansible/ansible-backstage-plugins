"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;

async function up(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.text('display_config').nullable();
    table.string('connection_status').notNullable().defaultTo('connected');
    table.text('bundle_data').nullable();
    table.text('bundle_metadata').nullable();
    table.timestamp('connected_at').nullable();
    table.timestamp('disconnected_at').nullable();
    table.string('disconnected_by').nullable();
    table.string('profile_version').nullable();
    table.text('version_history').nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_profile_registry', table => {
    table.dropColumn('display_config');
    table.dropColumn('connection_status');
    table.dropColumn('bundle_data');
    table.dropColumn('bundle_metadata');
    table.dropColumn('connected_at');
    table.dropColumn('disconnected_at');
    table.dropColumn('disconnected_by');
    table.dropColumn('profile_version');
    table.dropColumn('version_history');
  });
}
