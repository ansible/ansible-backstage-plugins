/**
 * Add certification column to compliance_cartridge_registry table.
 * Compiled JS copy for dist-dynamic packaging.
 */
async function up(knex) {
  if (!(await knex.schema.hasColumn('compliance_cartridge_registry', 'certification'))) {
    await knex.schema.alterTable('compliance_cartridge_registry', table => {
      table.text('certification').nullable();
    });
  }
}

async function down(knex) {
  await knex.schema.alterTable('compliance_cartridge_registry', table => {
    table.dropColumn('certification');
  });
}

module.exports = { up, down };
