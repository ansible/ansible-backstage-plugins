'use strict';

exports.up = async function up(knex) {
  await knex.schema.alterTable('compliance_scans', function (table) {
    table.text('scan_metadata').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('compliance_scans', function (table) {
    table.dropColumn('scan_metadata');
  });
};
