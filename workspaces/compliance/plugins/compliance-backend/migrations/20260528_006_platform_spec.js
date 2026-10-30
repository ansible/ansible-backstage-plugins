/**
 * Add platform_spec column to compliance_cartridge_registry table.
 * Compiled JS copy for dist-dynamic packaging.
 */
async function up(knex) {
  await knex.schema.alterTable('compliance_cartridge_registry', table => {
    table.text('platform_spec').nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable('compliance_cartridge_registry', table => {
    table.dropColumn('platform_spec');
  });
}

module.exports = { up, down };
