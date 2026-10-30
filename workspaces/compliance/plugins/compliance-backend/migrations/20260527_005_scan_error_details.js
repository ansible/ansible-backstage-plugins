/**
 * Add error_details column to compliance_scans table.
 * Compiled JS copy for dist-dynamic packaging.
 */
async function up(knex) {
  await knex.schema.alterTable('compliance_scans', table => {
    table.text('error_details').nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_scans', table => {
    table.dropColumn('error_details');
  });
}

module.exports = { up, down };
